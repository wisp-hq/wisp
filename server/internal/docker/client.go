package docker

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	dockertypes "github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/image"
	"github.com/docker/docker/api/types/network"
	"github.com/docker/docker/client"
	"github.com/docker/docker/pkg/stdcopy"
)

const (
	SessionLabel = "launcher.session"
	UserLabel    = "launcher.user"
	AppLabel     = "launcher.app"

	// LinuxServer Selkies images bind their web UI to :3000.
	DefaultSelkiesPort = 3000
)

type Client struct {
	cli *client.Client
}

func New() (*Client, error) {
	cli, err := client.NewClientWithOpts(
		client.FromEnv,
		client.WithAPIVersionNegotiation(),
	)
	if err != nil {
		return nil, fmt.Errorf("docker client: %w", err)
	}

	return &Client{cli: cli}, nil
}

func (c *Client) Close() error {
	return c.cli.Close()
}

// HostPathForSelfMount returns the host path backing containerPath on wisp's
// own container, or "" if wisp isn't in a container or the path isn't bound.
func (c *Client) HostPathForSelfMount(ctx context.Context, containerPath string) (string, error) {
	info, err := c.inspectSelf(ctx)
	if err != nil || info == nil {
		return "", nil //nolint:nilerr
	}

	for _, m := range info.Mounts {
		if m.Destination == containerPath {
			return m.Source, nil
		}
	}
	return "", nil
}

// SelfNetworks lists wisp's own attached networks, excluding bridge/host/none.
func (c *Client) SelfNetworks(ctx context.Context) ([]string, error) {
	info, err := c.inspectSelf(ctx)
	if err != nil || info == nil || info.NetworkSettings == nil {
		return nil, nil //nolint:nilerr
	}

	out := make([]string, 0, len(info.NetworkSettings.Networks))
	for name := range info.NetworkSettings.Networks {
		if name == "bridge" || name == "host" || name == "none" {
			continue
		}

		out = append(out, name)
	}
	return out, nil
}

func (c *Client) inspectSelf(ctx context.Context) (*dockertypes.ContainerJSON, error) {
	hostname, err := os.Hostname()
	if err != nil {
		return nil, nil //nolint:nilerr
	}

	info, err := c.cli.ContainerInspect(ctx, hostname)
	if err != nil {
		return nil, nil //nolint:nilerr
	}

	return &info, nil
}

type SpawnOptions struct {
	SessionID     string
	UserID        string
	AppSlug       string
	Image         string
	Network       string
	Env           map[string]string
	Binds         []string
	ContainerPort int
	GPU           string // "nvidia" enables all-GPU passthrough; "" disables.
}

type SpawnResult struct {
	ContainerID   string
	ContainerName string
}

// EnsureImage pulls the image if missing. ContainerCreate does not auto-pull, so
// first-time launches would otherwise fail with "No such image".
func (c *Client) EnsureImage(ctx context.Context, ref string, logger *slog.Logger, onProgress func(percent int)) error {
	if logger == nil {
		logger = slog.Default()
	}

	if _, _, err := c.cli.ImageInspectWithRaw(ctx, ref); err == nil {
		logger.Info("image already present, skipping pull", "image", ref)
		return nil
	}

	return c.PullImage(ctx, ref, logger, onProgress)
}

// RemoteImageDigest asks the registry for the current manifest digest of ref.
// Manifest lookups require Docker API 1.30+.
func (c *Client) RemoteImageDigest(ctx context.Context, ref string) (string, error) {
	remote, err := c.cli.DistributionInspect(ctx, ref, "")
	if err != nil {
		return "", fmt.Errorf("distribution inspect %s: %w", ref, err)
	}

	digest := string(remote.Descriptor.Digest)
	if digest == "" {
		return "", fmt.Errorf("registry returned empty digest for %s", ref)
	}

	return digest, nil
}

// PullImage always pulls the image from the registry, even if a local copy exists.
//
// Progress is computed from the Docker pull JSON stream (sum of per-layer current/total
// bytes). A separate ticker drives `onProgress` every 2 seconds independently of the
// stream — otherwise json.Decoder blocks on the network and slow registries (auth
// handshake, layer queueing) make the launcher look frozen.
func (c *Client) PullImage(ctx context.Context, ref string, logger *slog.Logger, onProgress func(percent int)) error {
	if logger == nil {
		logger = slog.Default()
	}

	logger.Info("PullImage: calling ImagePull", "image", ref)
	rc, err := c.cli.ImagePull(ctx, ref, image.PullOptions{})
	if err != nil {
		return fmt.Errorf("pull %s: %w", ref, err)
	}

	defer rc.Close()
	logger.Info("PullImage: ImagePull returned, starting reader", "image", ref)

	type layer struct {
		current int64
		total   int64
	}
	type event struct {
		ID             string `json:"id"`
		Status         string `json:"status"`
		ProgressDetail struct {
			Current int64 `json:"current"`
			Total   int64 `json:"total"`
		} `json:"progressDetail"`
		ErrorMessage string `json:"error"`
	}

	var (
		mu      sync.Mutex
		layers  = map[string]*layer{}
		readErr error
	)

	computePercent := func() int {
		mu.Lock()
		defer mu.Unlock()
		var sumC, sumT int64
		for _, l := range layers {
			sumC += l.current
			sumT += l.total
		}
		if sumT == 0 {
			return 0
		}

		p := int(sumC * 100 / sumT)
		if p > 100 {
			p = 100
		}

		return p
	}
	notify := func(percent int) {
		logger.Info("pulling", "image", ref, "percent", percent)
		if onProgress != nil {
			onProgress(percent)
		}
	}

	// Surface a "0%" tick immediately so the UI knows the pull has started, even if
	// the registry takes its time before the first progress event lands.
	notify(0)

	done := make(chan struct{})
	firstEvent := false
	go func() {
		defer close(done)
		dec := json.NewDecoder(rc)
		for {
			var ev event
			if err := dec.Decode(&ev); err != nil {
				logger.Info("EnsureImage: reader exiting", "err", err)
				if !errors.Is(err, io.EOF) {
					mu.Lock()
					readErr = err
					mu.Unlock()
				}

				return
			}

			if ev.ErrorMessage != "" {
				mu.Lock()
				readErr = errors.New(ev.ErrorMessage)
				mu.Unlock()
				return
			}

			if !firstEvent {
				firstEvent = true
				logger.Info("EnsureImage: first event received", "status", ev.Status, "id", ev.ID)
			}

			if ev.ID == "" {
				continue
			}

			mu.Lock()
			switch ev.Status {
			case "Pulling fs layer", "Waiting":
				if _, ok := layers[ev.ID]; !ok {
					layers[ev.ID] = &layer{}
				}

			case "Downloading":
				l, ok := layers[ev.ID]
				if !ok {
					l = &layer{}
					layers[ev.ID] = l
				}

				l.current = ev.ProgressDetail.Current
				l.total = ev.ProgressDetail.Total
			case "Verifying Checksum", "Download complete":
				if l, ok := layers[ev.ID]; ok && l.total > 0 {
					l.current = l.total
				}

			case "Already exists":
				if _, ok := layers[ev.ID]; !ok {
					layers[ev.ID] = &layer{current: 1, total: 1}
				}
			}
			mu.Unlock()
		}
	}()

	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			notify(computePercent())
		case <-done:
			mu.Lock()
			err := readErr
			mu.Unlock()
			if err != nil {
				return fmt.Errorf("pull %s: %w", ref, err)
			}

			notify(100)
			logger.Info("pull complete", "image", ref)
			return nil
		}
	}
}

func (c *Client) Spawn(ctx context.Context, opts SpawnOptions) (*SpawnResult, error) {
	if opts.ContainerPort == 0 {
		opts.ContainerPort = DefaultSelkiesPort
	}

	envSlice := make([]string, 0, len(opts.Env))
	for k, v := range opts.Env {
		envSlice = append(envSlice, k+"="+v)
	}

	name := "wisp-" + opts.SessionID

	hostCfg := &container.HostConfig{
		Binds:         opts.Binds,
		RestartPolicy: container.RestartPolicy{Name: container.RestartPolicyDisabled},
		AutoRemove:    false,
		ShmSize:       2 * 1024 * 1024 * 1024,
		SecurityOpt:   []string{"seccomp=unconfined", "apparmor=unconfined"},
	}

	switch opts.GPU {
	case "nvidia":
		hostCfg.DeviceRequests = []container.DeviceRequest{
			{Driver: "nvidia", Count: -1, Capabilities: [][]string{{"gpu"}}},
		}
	case "intel", "amd", "dri":
		hostCfg.Devices = append(hostCfg.Devices, container.DeviceMapping{
			PathOnHost:        "/dev/dri",
			PathInContainer:   "/dev/dri",
			CgroupPermissions: "rwm",
		})
	}

	containerCfg := &container.Config{
		Image: opts.Image,
		Env:   envSlice,
		Labels: map[string]string{
			SessionLabel: opts.SessionID,
			UserLabel:    opts.UserID,
			AppLabel:     opts.AppSlug,
		},
	}

	var netCfg *network.NetworkingConfig
	if opts.Network != "" {
		netCfg = &network.NetworkingConfig{
			EndpointsConfig: map[string]*network.EndpointSettings{
				opts.Network: {},
			},
		}
	}

	created, err := c.cli.ContainerCreate(ctx, containerCfg, hostCfg, netCfg, nil, name)
	if err != nil {
		return nil, fmt.Errorf("container create: %w", err)
	}

	if err := c.cli.ContainerStart(ctx, created.ID, container.StartOptions{}); err != nil {
		_ = c.cli.ContainerRemove(context.Background(), created.ID, container.RemoveOptions{Force: true})
		return nil, fmt.Errorf("container start: %w", err)
	}

	return &SpawnResult{
		ContainerID:   created.ID,
		ContainerName: name,
	}, nil
}

func (c *Client) InspectIP(ctx context.Context, containerID, preferredNetwork string) (string, error) {
	insp, err := c.cli.ContainerInspect(ctx, containerID)
	if err != nil {
		return "", err
	}

	if insp.NetworkSettings == nil {
		return "", fmt.Errorf("container %s has no network settings", containerID)
	}

	if preferredNetwork != "" {
		if ep, ok := insp.NetworkSettings.Networks[preferredNetwork]; ok && ep.IPAddress != "" {
			return ep.IPAddress, nil
		}
	}

	for _, ep := range insp.NetworkSettings.Networks {
		if ep.IPAddress != "" {
			return ep.IPAddress, nil
		}
	}
	return "", fmt.Errorf("container %s has no usable IP", containerID)
}

func (c *Client) WaitHealthy(ctx context.Context, ip string, port int, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	url := fmt.Sprintf("http://%s:%d/", ip, port)
	httpClient := &http.Client{Timeout: 2 * time.Second}

	for time.Now().Before(deadline) {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
		if err != nil {
			return err
		}

		resp, err := httpClient.Do(req)
		if err == nil {
			_, _ = io.Copy(io.Discard, resp.Body)
			resp.Body.Close()
			if resp.StatusCode < 500 {
				return nil
			}
		}

		time.Sleep(500 * time.Millisecond)
	}
	return fmt.Errorf("container at %s:%d never became healthy within %s", ip, port, timeout)
}

// WaitWebSocketReady probes the LSIO/Selkies signaling endpoint with a real
// WebSocket Upgrade handshake. nginx fronts the Python signaling server: 502
// until selkies is up, 101 Switching Protocols once it can accept WS clients.
// We retry until ctx is done — relying on the parent SpawnTimeout instead of
// a second budget so the total spawn wait doesn't double.
func (c *Client) WaitWebSocketReady(ctx context.Context, ip string, port int, wsPath string) error {
	url := fmt.Sprintf("http://%s:%d%s", ip, port, wsPath)
	httpClient := &http.Client{Timeout: 2 * time.Second}

	for {
		select {
		case <-ctx.Done():
			return fmt.Errorf("websocket at %s never accepted upgrade: %w", url, ctx.Err())
		default:
		}

		req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
		if err != nil {
			return err
		}

		req.Header.Set("Upgrade", "websocket")
		req.Header.Set("Connection", "Upgrade")
		req.Header.Set("Sec-WebSocket-Version", "13")
		req.Header.Set("Sec-WebSocket-Key", "dGhlIHNhbXBsZSBub25jZQ==")

		resp, err := httpClient.Do(req)
		if err == nil {
			_, _ = io.Copy(io.Discard, resp.Body)
			resp.Body.Close()
			if resp.StatusCode == http.StatusSwitchingProtocols {
				return nil
			}
		}

		time.Sleep(500 * time.Millisecond)
	}
}

// StreamLogs returns a reader of demuxed (stdout+stderr merged) follow-mode
// container logs. The reader is closed when ctx is canceled. The caller is
// responsible for closing the returned ReadCloser.
func (c *Client) StreamLogs(ctx context.Context, containerID string, tailLines int) (io.ReadCloser, error) {
	rc, err := c.cli.ContainerLogs(ctx, containerID, container.LogsOptions{
		ShowStdout: true,
		ShowStderr: true,
		Follow:     true,
		Tail:       strconv.Itoa(tailLines),
	})
	if err != nil {
		return nil, err
	}

	pr, pw := io.Pipe()
	go func() {
		defer rc.Close()
		_, copyErr := stdcopy.StdCopy(pw, pw, rc)
		_ = pw.CloseWithError(copyErr)
	}()

	return pr, nil
}

// TailLogs returns the last `lines` of combined stdout+stderr for a container.
// Best-effort: returns an empty string on any failure (we'd rather mark the
// session failed than block on log retrieval). Container must still exist —
// call before Stop(), which removes it.
func (c *Client) TailLogs(ctx context.Context, containerID string, lines int) string {
	rc, err := c.cli.ContainerLogs(ctx, containerID, container.LogsOptions{
		ShowStdout: true,
		ShowStderr: true,
		Tail:       strconv.Itoa(lines),
	})
	if err != nil {
		return ""
	}
	defer rc.Close()

	var stdout, stderr bytes.Buffer
	if _, err := stdcopy.StdCopy(&stdout, &stderr, rc); err != nil {
		return ""
	}

	combined := strings.TrimRight(stdout.String()+stderr.String(), "\n")
	return combined
}

func (c *Client) Stop(ctx context.Context, containerID string, gracePeriod time.Duration) error {
	graceSec := int(gracePeriod.Seconds())
	_ = c.cli.ContainerStop(ctx, containerID, container.StopOptions{Timeout: &graceSec})
	return c.cli.ContainerRemove(ctx, containerID, container.RemoveOptions{Force: true, RemoveVolumes: false})
}

// ExecDetached runs cmd inside a running container as the given user and
// returns immediately without waiting for completion. Used for hot-launching
// commands in already-running launcher sessions (e.g. asking a live Steam
// container to start a specific game). Stdout/stderr are discarded.
func (c *Client) ExecDetached(ctx context.Context, containerName string, cmd []string, user string) error {
	created, err := c.cli.ContainerExecCreate(ctx, containerName, container.ExecOptions{
		Cmd:    cmd,
		User:   user,
		Detach: true,
	})
	if err != nil {
		return fmt.Errorf("exec create: %w", err)
	}

	if err := c.cli.ContainerExecStart(ctx, created.ID, container.ExecStartOptions{Detach: true}); err != nil {
		return fmt.Errorf("exec start: %w", err)
	}

	return nil
}

// ListLauncherSessions returns a session-id → container-id map for every container
// tagged with SessionLabel, regardless of run state. Used by the boot reconciler.
func (c *Client) ListLauncherSessions(ctx context.Context) (map[string]string, error) {
	f := filters.NewArgs(filters.Arg("label", SessionLabel))
	containers, err := c.cli.ContainerList(ctx, container.ListOptions{All: true, Filters: f})
	if err != nil {
		return nil, err
	}

	out := make(map[string]string, len(containers))
	for _, ct := range containers {
		if sid := ct.Labels[SessionLabel]; sid != "" {
			out[sid] = ct.ID
		}
	}
	return out, nil
}
