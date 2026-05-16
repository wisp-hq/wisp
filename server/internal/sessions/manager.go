package sessions

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/pocketbase/pocketbase/core"

	"github.com/KevinBonnoron/wisp/internal/catalog"
	"github.com/KevinBonnoron/wisp/internal/config"
	"github.com/KevinBonnoron/wisp/internal/docker"
	"github.com/KevinBonnoron/wisp/internal/progress"
	"github.com/KevinBonnoron/wisp/internal/shortcuts"
)

const inviteTokenBytes = 18

const (
	collectionSessions     = "sessions"
	collectionApps         = "apps"
	stopGracePeriodSeconds = 10
	// PB stores dates as "2006-01-02 15:04:05.000Z". Using time.RFC3339 ("T" separator)
	// breaks lexicographic comparisons in PB filters: space (0x20) < "T" (0x54), so an
	// RFC3339 cutoff always sorts AFTER a PB-formatted timestamp on the same day and
	// every ready session looks idle.
	pbDateLayout = "2006-01-02 15:04:05.000Z"
)

var (
	ErrNotInstalled = errors.New("app not installed")
	ErrAppNotFound  = errors.New("app not found")
)

// AppProgressPrefix namespaces app-pull progress keys so they can't collide
// with session IDs in the shared tracker.
const AppProgressPrefix = "app:"

type Manager struct {
	pb        core.App
	docker    *docker.Client
	cfg       config.Config
	logger    *slog.Logger
	progress  *progress.Tracker
	shortcuts *shortcuts.Manager
	catalog   *catalog.Manager

	hostDataRoot  string
	dockerNetwork string

	// In-memory buffer: avoids one SQLite write per proxied request.
	touchMu sync.Mutex
	touches map[string]time.Time
}

// ImageStatus is persisted under apps.state.imageStatus and surfaced to the
// client via the live collection. The client renders the update badge directly
// from this field — no on-demand registry calls.
type ImageStatus string

const (
	ImageStatusPending   ImageStatus = "pending"
	ImageStatusNotPulled ImageStatus = "not_pulled"
	ImageStatusPulling   ImageStatus = "pulling"
	ImageStatusUpToDate  ImageStatus = "up_to_date"
	ImageStatusOutdated  ImageStatus = "outdated"
	ImageStatusError     ImageStatus = "error"
)

func (m *Manager) readSpec(appRec *core.Record) (*catalog.Spec, error) {
	raw := appRec.GetString("spec")
	source := appRec.GetString("catalogSource")
	slug := appRec.GetString("slug")

	if source == "" {
		if strings.TrimSpace(raw) == "" {
			return nil, fmt.Errorf("custom app has no spec")
		}

		var spec catalog.Spec
		if err := json.Unmarshal([]byte(raw), &spec); err != nil {
			return nil, fmt.Errorf("parse spec: %w", err)
		}

		return &spec, nil
	}

	if m.catalog == nil {
		return nil, fmt.Errorf("catalog manager not initialised")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	entry, err := m.catalog.Find(ctx, source, slug)
	if err != nil {
		return nil, fmt.Errorf("lookup catalog entry %s/%s: %w", source, slug, err)
	}

	if entry == nil {
		return nil, fmt.Errorf("catalog entry %s/%s not found", source, slug)
	}

	var overrides catalog.Overrides
	if strings.TrimSpace(raw) != "" {
		if err := json.Unmarshal([]byte(raw), &overrides); err != nil {
			return nil, fmt.Errorf("parse overrides: %w", err)
		}
	}

	merged := catalog.Merge(entry.Spec, &overrides)
	return &merged, nil
}

func readState(appRec *core.Record) AppState {
	var state AppState
	raw := appRec.GetString("state")
	if strings.TrimSpace(raw) == "" {
		return state
	}

	_ = json.Unmarshal([]byte(raw), &state)
	return state
}

func encodeState(state AppState) string {
	b, _ := json.Marshal(state)
	return string(b)
}

// readShortcutsFeature pulls spec.features.shortcuts and parses it into a
// ProviderConfig. Returns (nil, nil) when the app declares no shortcuts feature.
func (m *Manager) readShortcutsFeature(appRec *core.Record) (*shortcuts.ProviderConfig, error) {
	spec, err := m.readSpec(appRec)
	if err != nil {
		return nil, err
	}

	raw, ok := spec.Features["shortcuts"]
	if !ok {
		return nil, nil
	}

	return shortcuts.ParseConfig(raw)
}

func NewManager(pb core.App, dk *docker.Client, cfg config.Config, logger *slog.Logger, pt *progress.Tracker, sc *shortcuts.Manager, cm *catalog.Manager) *Manager {
	if logger == nil {
		logger = slog.Default()
	}

	m := &Manager{
		pb:        pb,
		docker:    dk,
		cfg:       cfg,
		logger:    logger,
		progress:  pt,
		shortcuts: sc,
		catalog:   cm,
		touches:   make(map[string]time.Time),
	}
	m.resolveHostDataRoot()
	m.resolveDockerNetwork()
	return m
}

func (m *Manager) resolveDockerNetwork() {
	if v := os.Getenv("DOCKER_NETWORK"); v != "" {
		m.dockerNetwork = v
		m.logger.Info("docker network from env", "name", m.dockerNetwork)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	nets, err := m.docker.SelfNetworks(ctx)
	switch {
	case err == nil && len(nets) == 1:
		m.dockerNetwork = nets[0]
		m.logger.Info("docker network auto-detected", "name", m.dockerNetwork)
	case err == nil && len(nets) > 1:
		m.dockerNetwork = m.cfg.DockerNetwork
		m.logger.Warn("multiple networks attached to wisp — set DOCKER_NETWORK to pick one",
			"candidates", nets,
			"fallback", m.dockerNetwork,
		)
	default:
		m.dockerNetwork = m.cfg.DockerNetwork
		m.logger.Info("docker network falls back to config default", "name", m.dockerNetwork)
	}
}

func (m *Manager) resolveHostDataRoot() {
	if m.cfg.HostDataRoot != "" {
		m.hostDataRoot = m.cfg.HostDataRoot
		m.logger.Info("host data root from env", "path", m.hostDataRoot)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	detected, err := m.docker.HostPathForSelfMount(ctx, m.cfg.DataRoot)
	if err != nil || detected == "" {
		m.hostDataRoot = m.cfg.DataRoot
		m.logger.Info("host data root falls back to container path", "path", m.hostDataRoot)
		return
	}

	m.hostDataRoot = detected
	m.logger.Info("host data root auto-detected", "path", m.hostDataRoot)
}

func newInviteToken() string {
	b := make([]byte, inviteTokenBytes)
	_, _ = rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}

// EnsureInviteToken returns the session's invite token, generating and
// persisting one if the field is empty. Mutates rec in place. All joiners
// claim as viewer; the host promotes them via PB API as needed.
func (m *Manager) EnsureInviteToken(rec *core.Record) (string, error) {
	if tok := rec.GetString("inviteToken"); tok != "" {
		return tok, nil
	}

	tok := newInviteToken()
	rec.Set("inviteToken", tok)
	if err := m.pb.Save(rec); err != nil {
		return "", err
	}

	return tok, nil
}

// RotateInviteToken replaces the session's invite token. Existing participants
// keep their own per-participant tokens — only future joiners through the
// rotated link are affected.
func (m *Manager) RotateInviteToken(rec *core.Record) (string, error) {
	tok := newInviteToken()
	rec.Set("inviteToken", tok)
	if err := m.pb.Save(rec); err != nil {
		return "", err
	}

	return tok, nil
}

// LookupByInviteToken returns the active session for an invite token, or
// (nil, nil) if the token is unknown or the session is in a terminal state.
func (m *Manager) LookupByInviteToken(token string) (*core.Record, error) {
	if token == "" {
		return nil, nil
	}

	rec, err := m.pb.FindFirstRecordByFilter(
		collectionSessions,
		"inviteToken = {:t}",
		map[string]any{"t": token},
	)
	if err != nil {
		return nil, nil //nolint:nilerr
	}

	status := rec.GetString("status")
	if status == string(StatusStopped) || status == string(StatusFailed) || status == string(StatusStopping) {
		return nil, nil
	}

	return rec, nil
}

// LoadActive returns (nil, nil) when the row is missing or in a terminal state — the
// proxy and the launcher API both treat both cases the same way (404).
func (m *Manager) LoadActive(sessionID string) (*core.Record, error) {
	rec, err := m.pb.FindRecordById(collectionSessions, sessionID)
	if err != nil {
		return nil, nil //nolint:nilerr
	}

	status := rec.GetString("status")
	if status == string(StatusStopped) || status == string(StatusFailed) || status == string(StatusStopping) {
		return nil, nil
	}

	return rec, nil
}

func (m *Manager) Touch(sessionID string) {
	m.touchMu.Lock()
	m.touches[sessionID] = time.Now()
	m.touchMu.Unlock()
}

func (m *Manager) Flush(ctx context.Context) {
	m.touchMu.Lock()
	pending := m.touches
	m.touches = make(map[string]time.Time, len(pending))
	m.touchMu.Unlock()

	for sid, ts := range pending {
		select {
		case <-ctx.Done():
			return
		default:
		}
		rec, err := m.pb.FindRecordById(collectionSessions, sid)
		if err != nil {
			continue
		}

		rec.Set("updated", ts.UTC().Format(pbDateLayout))
		_ = m.pb.Save(rec)
	}
}

// FindActiveForApp returns the (one) active session for (user, app); the unique
// partial index on sessions guarantees at most one match. `stopping` counts as active
// so a stop-then-immediate-relaunch can't sneak past the slot reservation.
func (m *Manager) FindActiveForApp(userID, appID string) (*core.Record, error) {
	rec, err := m.pb.FindFirstRecordByFilter(
		collectionSessions,
		"user = {:user} && app = {:app} && (status = 'starting' || status = 'ready' || status = 'stopping')",
		map[string]any{"user": userID, "app": appID},
	)
	if err != nil {
		return nil, nil //nolint:nilerr
	}

	return rec, nil
}

func (m *Manager) ListActiveForUser(userID string) ([]*core.Record, error) {
	return m.pb.FindRecordsByFilter(
		collectionSessions,
		"user = {:user} && (status = 'starting' || status = 'ready' || status = 'stopping')",
		"-created",
		100,
		0,
		map[string]any{"user": userID},
	)
}

// Create saves the session record synchronously (status=starting) and runs the
// long-running spawn off the request goroutine; subscribers watch the record for
// the ready/failed transition. extraEnv holds per-launch overrides (e.g. a
// shortcut's STEAM_APPID); they're ignored when an existing session is reused
// because the running container can't accept new env vars retroactively.
func (m *Manager) Create(ctx context.Context, userRec *core.Record, appID string, extraEnv map[string]string) (*core.Record, error) {
	appRec, err := m.pb.FindRecordById(collectionApps, appID)
	if err != nil {
		return nil, ErrNotInstalled
	}

	if existing, _ := m.FindActiveForApp(userRec.Id, appRec.Id); existing != nil {
		m.hotLaunchIfNeeded(existing, appRec, extraEnv)
		return existing, nil
	}

	sessionsCol, err := m.pb.FindCollectionByNameOrId(collectionSessions)
	if err != nil {
		return nil, err
	}

	rec := core.NewRecord(sessionsCol)
	rec.Set("user", userRec.Id)
	rec.Set("app", appRec.Id)
	rec.Set("status", string(StatusStarting))
	if err := m.pb.Save(rec); err != nil {
		// Save can hit the partial-unique index if a concurrent caller won the race.
		if existing, _ := m.FindActiveForApp(userRec.Id, appRec.Id); existing != nil {
			m.hotLaunchIfNeeded(existing, appRec, extraEnv)
			return existing, nil
		}

		return nil, fmt.Errorf("save session: %w", err)
	}

	go m.spawnAsync(rec.Id, appRec, userRec, extraEnv)
	return rec, nil
}

// hotLaunchIfNeeded dispatches a shortcut's launch command into an already-
// running container instead of restarting it. Best-effort: failures are logged
// and swallowed so the user still lands on the existing session.
func (m *Manager) hotLaunchIfNeeded(sessRec, appRec *core.Record, extraEnv map[string]string) {
	if m.shortcuts == nil || len(extraEnv) == 0 {
		return
	}

	if sessRec.GetString("status") != string(StatusReady) {
		// Container isn't fully up yet — the launchParams from the originally
		// scheduled spawn will be applied via env when it boots.
		return
	}

	cfg, err := m.readShortcutsFeature(appRec)
	if err != nil || cfg == nil {
		return
	}

	cmd := m.shortcuts.BuildHotLaunchCommand(cfg.Type, extraEnv)
	if cmd == nil {
		return
	}

	containerName := sessRec.GetString("containerName")
	if containerName == "" {
		return
	}

	logger := m.logger.With("session", sessRec.Id, "container", containerName, "cmd", cmd)
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := m.docker.ExecDetached(ctx, containerName, cmd, hotLaunchExecUser); err != nil {
			logger.Warn("hot launch exec failed", "err", err)
			return
		}

		logger.Info("hot launch dispatched")
	}()
}

// hotLaunchExecUser is the in-container username the exec runs as. LSIO Selkies
// images (the supported baseline) always create the `abc` user and run desktop
// processes under it — that's the only context where the steam:// IPC reaches
// the running session.
const hotLaunchExecUser = "abc"

func (m *Manager) spawnAsync(sessionID string, appRec, userRec *core.Record, extraEnv map[string]string) {
	bg := context.Background()
	logger := m.logger.With("session", sessionID, "app", appRec.GetString("slug"))

	rec, err := m.pb.FindRecordById(collectionSessions, sessionID)
	if err != nil {
		logger.Error("session record vanished", "err", err)
		return
	}

	spec, err := m.readSpec(appRec)
	if err != nil {
		m.markFailed(rec, FailureCodeBuildBinds, fmt.Sprintf("read spec: %v", err))
		return
	}

	binds, err := m.buildBinds(spec, userRec)
	if err != nil {
		m.markFailed(rec, FailureCodeBuildBinds, fmt.Sprintf("build binds: %v", err))
		return
	}

	// Docker SDK doesn't auto-pull; first-time launches of multi-GB images would
	// otherwise fail at ContainerCreate with "No such image".
	pullCtx, cancelPull := context.WithTimeout(bg, m.cfg.PullTimeout)
	defer cancelPull()
	logger.Info("ensuring image", "image", spec.Container.Image)
	onProgress := func(percent int) {
		m.progress.Set(rec.Id, percent)
	}
	if err := m.docker.EnsureImage(pullCtx, spec.Container.Image, logger, onProgress); err != nil {
		m.markFailed(rec, FailureCodePullImage, fmt.Sprintf("pull image: %v", err))
		return
	}

	m.progress.Clear(rec.Id)

	env := m.buildEnv(spec, rec.Id, extraEnv)
	spawnRes, err := m.docker.Spawn(bg, docker.SpawnOptions{
		SessionID:     rec.Id,
		UserID:        userRec.Id,
		AppSlug:       appRec.GetString("slug"),
		Image:         spec.Container.Image,
		Network:       m.dockerNetwork,
		Env:           env,
		Binds:         binds,
		ContainerPort: docker.DefaultSelkiesPort,
		GPU:           m.cfg.GPU,
	})
	if err != nil {
		m.markFailed(rec, FailureCodeSpawn, fmt.Sprintf("spawn: %v", err))
		return
	}

	rec.Set("containerName", spawnRes.ContainerName)
	_ = m.pb.Save(rec)

	ip, err := m.docker.InspectIP(bg, spawnRes.ContainerID, m.dockerNetwork)
	if err != nil {
		_ = m.docker.Stop(bg, spawnRes.ContainerID, stopGracePeriodSeconds*time.Second)
		m.markFailed(rec, FailureCodeInspectIP, fmt.Sprintf("inspect ip: %v", err))
		return
	}

	healthCtx, cancelHealth := context.WithTimeout(bg, m.cfg.SpawnTimeout)
	defer cancelHealth()
	if err := m.docker.WaitHealthy(healthCtx, ip, docker.DefaultSelkiesPort, m.cfg.SpawnTimeout); err != nil {
		// Capture container logs BEFORE Stop() — Stop() also removes the container,
		// so logs are gone after. Best-effort: empty string on failure.
		logs := m.docker.TailLogs(bg, spawnRes.ContainerID, 30)
		_ = m.docker.Stop(bg, spawnRes.ContainerID, stopGracePeriodSeconds*time.Second)
		m.markFailed(rec, FailureCodeWaitHealthy, withLogs(fmt.Sprintf("wait healthy: %v", err), logs))
		return
	}

	// LSIO nginx is up but selkies' Python signaling server boots later — without
	// this gate, the browser loads the page and sees "WebSocket disconnected" for
	// a few seconds while the WS proxy returns 502.
	wsPath := "/s/" + rec.Id + "/websocket"
	if err := m.docker.WaitWebSocketReady(healthCtx, ip, docker.DefaultSelkiesPort, wsPath); err != nil {
		logs := m.docker.TailLogs(bg, spawnRes.ContainerID, 30)
		_ = m.docker.Stop(bg, spawnRes.ContainerID, stopGracePeriodSeconds*time.Second)
		m.markFailed(rec, FailureCodeWaitWebSocket, withLogs(fmt.Sprintf("wait websocket: %v", err), logs))
		return
	}

	// Re-fetch before flipping to ready: a concurrent Stop() may have set status
	// to `stopping` while we were waiting on docker. Without this check, our stale
	// in-memory rec would overwrite that with `ready`, leaving the user looking at
	// a "running" session whose container is being torn down.
	fresh, err := m.pb.FindRecordById(collectionSessions, sessionID)
	if err != nil {
		logger.Error("reload session before ready", "err", err)
		_ = m.docker.Stop(bg, spawnRes.ContainerID, stopGracePeriodSeconds*time.Second)
		return
	}

	if fresh.GetString("status") != string(StatusStarting) {
		logger.Info("spawn canceled before ready", "status", fresh.GetString("status"))
		_ = m.docker.Stop(bg, spawnRes.ContainerID, stopGracePeriodSeconds*time.Second)
		return
	}

	fresh.Set("containerIp", ip)
	fresh.Set("port", docker.DefaultSelkiesPort)
	fresh.Set("status", string(StatusReady))
	fresh.Set("updated", time.Now().UTC().Format(pbDateLayout))
	if err := m.pb.Save(fresh); err != nil {
		logger.Error("save ready session", "err", err)
		return
	}

	m.startShortcutWatcher(appRec, userRec, logger)
	m.hotLaunchIfNeeded(fresh, appRec, extraEnv)

	logger.Info("session ready", "ip", ip)
}

// startShortcutWatcher launches the shortcuts watcher for this (user, app) pair
// if the app declares a shortcuts feature. Failures are logged and swallowed —
// shortcut sync is a non-critical enhancement, the session itself stays ready.
func (m *Manager) startShortcutWatcher(appRec, userRec *core.Record, logger *slog.Logger) {
	if err := m.rescanShortcuts(appRec, userRec); err != nil {
		if !errors.Is(err, errShortcutsFeatureDisabled) {
			logger.Warn("start shortcut watcher failed", "err", err)
		}
	}
}

var errShortcutsFeatureDisabled = errors.New("shortcuts feature not enabled")

// rescanShortcuts (re)starts the shortcuts watcher for (user, app) and runs an
// initial scan. Idempotent: calling it on an already-running watcher tears the
// old one down and replaces it.
func (m *Manager) rescanShortcuts(appRec, userRec *core.Record) error {
	if m.shortcuts == nil {
		return errors.New("shortcuts manager unavailable")
	}

	cfg, err := m.readShortcutsFeature(appRec)
	if err != nil {
		return fmt.Errorf("parse shortcuts feature: %w", err)
	}

	if cfg == nil {
		return errShortcutsFeatureDisabled
	}

	hostPath, err := m.resolveContainerPath(appRec, userRec, cfg.ContainerPath)
	if err != nil {
		return fmt.Errorf("resolve shortcut path: %w", err)
	}

	// fsnotify can't attach to a non-existent dir, and the container's launcher
	// writes the metadata file/dir lazily at runtime — well after the watcher
	// would try to attach. Pre-create the watcher's root with PUID/PGID so the
	// launcher can still write into it as the unprivileged container user.
	uid, gid := perUserOwner()
	for _, p := range m.shortcuts.WatchPaths(cfg.Type, hostPath, *cfg) {
		if err := m.ensurePerUserDir(p, uid, gid); err != nil {
			m.logger.Warn("ensure shortcut watch dir failed", "path", p, "err", err)
		}
	}

	key := shortcuts.WatchKey{UserID: userRec.Id, AppID: appRec.Id}
	return m.shortcuts.Start(key, cfg.Type, hostPath, *cfg)
}

// Stop flips the record to `stopping` synchronously so subscribers see the
// transition immediately; the docker stop+remove then runs in a goroutine and
// finalises the row to `stopped`.
func (m *Manager) Stop(_ context.Context, rec *core.Record) error {
	containerName := rec.GetString("containerName")
	rec.Set("status", string(StatusStopping))
	if err := m.pb.Save(rec); err != nil {
		return err
	}

	go m.stopAsync(rec.Id, containerName)
	return nil
}

func (m *Manager) stopAsync(sessionID, containerName string) {
	bg := context.Background()
	if containerName != "" {
		_ = m.docker.Stop(bg, containerName, stopGracePeriodSeconds*time.Second)
	}

	rec, err := m.pb.FindRecordById(collectionSessions, sessionID)
	if err != nil {
		return
	}

	if m.shortcuts != nil {
		// Final scan + watcher teardown. Most important checkpoint: the user
		// likely just installed/uninstalled something before closing.
		m.shortcuts.Stop(shortcuts.WatchKey{UserID: rec.GetString("user"), AppID: rec.GetString("app")})
	}

	rec.Set("status", string(StatusStopped))
	_ = m.pb.Save(rec)
}

// resolveContainerPath maps an in-container path to the equivalent host path
// by consulting the app's spec.volumes. Used by the shortcuts watcher to find
// the launcher's metadata directory on the filesystem Wisp itself can read.
// For grouped volumes, each effective sub-mount is checked individually so the
// shortcuts feature can target a path that lives inside a specific sub-mount.
//
// When multiple mounts could match (nested mounts — e.g. `/config` and
// `/config/.config/retroarch/roms` both contain `/config/.config/retroarch/roms`),
// the longest containerPath wins. That matches how Docker itself resolves
// overlapping mounts: the most specific one is the one actually visible at
// that path inside the container.
func (m *Manager) resolveContainerPath(appRec, userRec *core.Record, containerPath string) (string, error) {
	spec, err := m.readSpec(appRec)
	if err != nil {
		return "", err
	}

	target := filepath.Clean(containerPath)

	var (
		best       *catalog.Volume
		bestMount  catalog.EffectiveMount
		bestSuffix string
		bestLen    = -1
	)

	for i := range spec.Volumes {
		v := &spec.Volumes[i]
		for _, em := range v.Expand() {
			suffix, ok := containerSuffix(em.ContainerPath, target)
			if !ok {
				continue
			}

			cp := filepath.Clean(em.ContainerPath)
			if len(cp) <= bestLen {
				continue
			}

			best = v
			bestMount = em
			bestSuffix = suffix
			bestLen = len(cp)
		}
	}

	if best == nil {
		return "", fmt.Errorf("no volume contains %q", containerPath)
	}

	return m.resolveHostMount(best, bestMount, bestSuffix, userRec), nil
}

// resolveHostMount turns a single (volume, effective-mount, suffix) tuple into
// the absolute fs path readable by Wisp. The per-user rewrite uses cfg.DataRoot
// (Wisp's own view of the data dir, not the host view) because the shortcuts
// watcher reads files directly from inside the wisp container.
func (m *Manager) resolveHostMount(v *catalog.Volume, em catalog.EffectiveMount, suffix string, userRec *core.Record) string {
	host := substitute(em.HostPath, userRec)
	if v.Scope == "perUser" && !filepath.IsAbs(host) {
		return filepath.Join(m.cfg.DataRoot, "users", userRec.Id, host, suffix)
	}

	return filepath.Join(host, suffix)
}

// containerSuffix returns ("rest", true) if target equals prefix or sits
// directly under it. Avoids matching "/configfoo" against prefix "/config".
func containerSuffix(prefix, target string) (string, bool) {
	prefix = filepath.Clean(prefix)
	if target == prefix {
		return "", true
	}

	if !strings.HasPrefix(target, prefix+"/") {
		return "", false
	}

	return target[len(prefix)+1:], true
}

// MarkStopped flips a record to stopped without touching the container. Idempotent.
func (m *Manager) MarkStopped(rec *core.Record) {
	status := rec.GetString("status")
	if status == string(StatusStopped) || status == string(StatusFailed) {
		return
	}

	if m.shortcuts != nil {
		m.shortcuts.Stop(shortcuts.WatchKey{UserID: rec.GetString("user"), AppID: rec.GetString("app")})
	}

	rec.Set("status", string(StatusStopped))
	_ = m.pb.Save(rec)
}

func (m *Manager) ListIdle() ([]*core.Record, error) {
	cutoff := time.Now().Add(-m.cfg.IdleTimeout).UTC().Format(pbDateLayout)
	// keepAlive lives on user.hudPrefs (JSON). PB filter syntax composes relation
	// traversal with JSON path access, so user.hudPrefs.keepAlive resolves through
	// the relation join — null/missing values count as != true, which is exactly
	// what we want (users who never toggled the pref are subject to idle cleanup).
	return m.pb.FindRecordsByFilter(
		collectionSessions,
		"status = 'ready' && updated < {:cutoff} && user.hudPrefs.keepAlive != true",
		"+updated",
		100,
		0,
		map[string]any{"cutoff": cutoff},
	)
}

// PurgeTerminal deletes stopped/failed sessions older than `older`. Returns the
// number of rows removed. Terminal records carry no operational value past their
// brief use in the launch-error UI; keeping a short retention window leaves an
// audit trail without letting the table grow unbounded.
func (m *Manager) PurgeTerminal(older time.Duration) (int, error) {
	cutoff := time.Now().Add(-older).UTC().Format(pbDateLayout)
	records, err := m.pb.FindRecordsByFilter(
		collectionSessions,
		"(status = 'stopped' || status = 'failed') && updated < {:cutoff}",
		"+updated",
		500,
		0,
		map[string]any{"cutoff": cutoff},
	)
	if err != nil {
		return 0, err
	}

	n := 0
	for _, rec := range records {
		if err := m.pb.Delete(rec); err != nil {
			m.logger.Warn("purge terminal session: delete failed", "session", rec.Id, "err", err)
			continue
		}

		n++
	}
	return n, nil
}

func (m *Manager) ListNonTerminal() ([]*core.Record, error) {
	return m.pb.FindRecordsByFilter(
		collectionSessions,
		"status = 'starting' || status = 'ready'",
		"+created",
		1000,
		0,
		nil,
	)
}

func (m *Manager) ProxyTarget(rec *core.Record) (*url.URL, error) {
	ip := rec.GetString("containerIp")
	port := rec.GetInt("port")
	if ip == "" || port == 0 {
		return nil, fmt.Errorf("session %s has no upstream yet", rec.Id)
	}

	return url.Parse(fmt.Sprintf("http://%s:%d", ip, port))
}

// Failure codes surfaced to the UI so the client can translate the message.
// The raw `reason` is still stored for debugging in the PB admin.
const (
	FailureCodeBuildBinds    = "build_binds"
	FailureCodePullImage     = "pull_image"
	FailureCodeSpawn         = "spawn"
	FailureCodeInspectIP     = "inspect_ip"
	FailureCodeWaitHealthy   = "wait_healthy"
	FailureCodeWaitWebSocket = "wait_websocket"
)

// StreamContainerLogs opens a follow-mode log stream for the session's running
// container. The caller must close the returned ReadCloser; canceling ctx also
// stops the underlying docker request.
func (m *Manager) StreamContainerLogs(ctx context.Context, rec *core.Record, tailLines int) (io.ReadCloser, error) {
	name := rec.GetString("containerName")
	if name == "" {
		return nil, fmt.Errorf("session %s has no container", rec.Id)
	}

	return m.docker.StreamLogs(ctx, name, tailLines)
}

func withLogs(reason, logs string) string {
	if logs == "" {
		return reason
	}

	return reason + "\n\n--- container logs ---\n" + logs
}

func (m *Manager) markFailed(rec *core.Record, code, reason string) {
	m.progress.Clear(rec.Id)
	rec.Set("status", string(StatusFailed))
	rec.Set("failureCode", code)
	if reason != "" {
		rec.Set("failureReason", reason)
	}

	_ = m.pb.Save(rec)
}

// Progress exposes the underlying tracker so API handlers can subscribe.
func (m *Manager) Progress() *progress.Tracker {
	return m.progress
}

// LoadApp returns the app record by ID, or (nil, ErrAppNotFound) if missing.
func (m *Manager) LoadApp(appID string) (*core.Record, error) {
	rec, err := m.pb.FindRecordById(collectionApps, appID)
	if err != nil {
		return nil, ErrAppNotFound
	}

	return rec, nil
}

// UpdateApp kicks off a force-pull in the background and returns immediately.
// Progress is published to the tracker under AppProgressPrefix+appID; the
// channel is closed when the pull finishes so SSE subscribers disconnect.
func (m *Manager) UpdateApp(appRec *core.Record) {
	go m.updateAsync(appRec)
}

func (m *Manager) updateAsync(appRec *core.Record) {
	key := AppProgressPrefix + appRec.Id
	spec, err := m.readSpec(appRec)
	if err != nil {
		m.logger.Error("read spec for update", "app", appRec.GetString("slug"), "err", err)
		return
	}

	image := spec.Container.Image
	logger := m.logger.With("app", appRec.GetString("slug"), "image", image)

	// Flip the persisted status first so any reload mid-pull picks up the
	// in-progress state from the apps collection and re-subscribes to SSE.
	m.setImageStatus(appRec, ImageStatusPulling, "")

	bg := context.Background()
	pullCtx, cancel := context.WithTimeout(bg, m.cfg.PullTimeout)
	defer cancel()

	onProgress := func(percent int) { m.progress.Set(key, percent) }
	onProgress(0)
	if err := m.docker.PullImage(pullCtx, image, logger, onProgress); err != nil {
		logger.Error("app update pull failed", "err", err)
		m.setImageStatus(appRec, ImageStatusError, "")
		m.progress.Done(key)
		return
	}

	digest, err := m.docker.RemoteImageDigest(bg, image)
	if err != nil {
		logger.Warn("resolve digest after pull failed", "err", err)
		m.setImageStatus(appRec, ImageStatusError, "")
	} else {
		m.setImageStatus(appRec, ImageStatusUpToDate, digest)
	}
	m.progress.Done(key)
}

// setImageStatus persists the new status (and optionally a refreshed digest) on
// the app's state JSON, skipping the SQLite write when nothing changed so the
// live query doesn't churn.
func (m *Manager) setImageStatus(appRec *core.Record, status ImageStatus, digest string) {
	state := readState(appRec)
	changed := false
	if state.ImageStatus != status {
		state.ImageStatus = status
		changed = true
	}

	if digest != "" && state.ImageDigest != digest {
		state.ImageDigest = digest
		changed = true
	}

	if !changed {
		return
	}

	appRec.Set("state", encodeState(state))
	if err := m.pb.Save(appRec); err != nil {
		m.logger.Error("save imageStatus", "app", appRec.GetString("slug"), "err", err)
	}
}

// RefreshImageStatuses iterates every app, asks the registry for the current
// manifest digest, and reconciles imageStatus. Transient registry/network
// failures on a single app are logged but leave the existing status untouched
// so a flaky registry doesn't flip apps to "error" between sweeps.
func (m *Manager) RefreshImageStatuses(ctx context.Context) {
	records, err := m.pb.FindRecordsByFilter(collectionApps, "id != ''", "+created", 1000, 0, nil)
	if err != nil {
		m.logger.Error("list apps for status refresh", "err", err)
		return
	}

	for _, rec := range records {
		select {
		case <-ctx.Done():
			return
		default:
		}
		m.refreshOneStatus(ctx, rec)
	}
}

func (m *Manager) refreshOneStatus(ctx context.Context, appRec *core.Record) {
	state := readState(appRec)
	// Don't stomp on an active pull. If the tracker has no entry the pull is
	// gone (server restart killed it) and the record is stale — fall through
	// and reconcile from the digest comparison.
	if state.ImageStatus == ImageStatusPulling && m.progress.Has(AppProgressPrefix+appRec.Id) {
		return
	}

	spec, err := m.readSpec(appRec)
	if err != nil {
		m.logger.Warn("read spec for status refresh", "app", appRec.GetString("slug"), "err", err)
		return
	}

	appCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	remote, err := m.docker.RemoteImageDigest(appCtx, spec.Container.Image)
	if err != nil {
		m.logger.Warn("registry digest lookup failed", "app", appRec.GetString("slug"), "err", err)
		return
	}

	switch {
	case state.ImageDigest == "":
		m.setImageStatus(appRec, ImageStatusNotPulled, "")
	case state.ImageDigest == remote:
		m.setImageStatus(appRec, ImageStatusUpToDate, "")
	default:
		m.setImageStatus(appRec, ImageStatusOutdated, "")
	}
}

// StartImageStatusRefresher runs RefreshImageStatuses on a ticker until ctx is
// cancelled. The first sweep runs after a short startup delay so it doesn't
// race the boot-time session reconciler.
func (m *Manager) StartImageStatusRefresher(ctx context.Context, interval time.Duration) {
	go func() {
		select {
		case <-ctx.Done():
			return
		case <-time.After(15 * time.Second):
		}
		m.RefreshImageStatuses(ctx)

		t := time.NewTicker(interval)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				m.RefreshImageStatuses(ctx)
			}
		}
	}()
}

func (m *Manager) buildBinds(spec *catalog.Spec, userRec *core.Record) ([]string, error) {
	if len(spec.Volumes) == 0 {
		return nil, nil
	}

	uid, gid := perUserOwner()
	binds := make([]string, 0, len(spec.Volumes))
	for _, v := range spec.Volumes {
		out, err := m.expandVolume(&v, userRec, uid, gid)
		if err != nil {
			return nil, err
		}

		binds = append(binds, out...)
	}

	return binds, nil
}

// expandVolume turns a Volume (simple or grouped) into the Docker bind strings.
// For perUser scope, the per-user subdir is appended to the volume's root host
// path before sub-mount names — so a grouped perUser volume gets one user dir
// containing the sub-mount children. The fs / host path split mirrors the
// pre-grouped logic: Docker needs the host-side path, MkdirAll runs inside the
// wisp container's view.
func (m *Manager) expandVolume(v *catalog.Volume, userRec *core.Record, uid, gid int) ([]string, error) {
	rootSub := substitute(v.HostPath, userRec)
	var rootHost, rootFs string
	perUser := v.Scope == "perUser"
	switch v.Scope {
	case "shared":
		rootHost = rootSub
	case "perUser":
		if filepath.IsAbs(rootSub) {
			rootHost, rootFs = rootSub, rootSub
		} else {
			rootHost = filepath.Join(m.hostDataRoot, "users", userRec.Id, rootSub)
			rootFs = filepath.Join(m.cfg.DataRoot, "users", userRec.Id, rootSub)
		}
	default:
		return nil, fmt.Errorf("invalid scope %q on volume %q", v.Scope, v.ID)
	}

	defaultMode := "rw"
	if v.Scope == "shared" {
		defaultMode = "ro"
	}

	if !v.IsGrouped() {
		if perUser {
			if err := m.ensurePerUserDir(rootFs, uid, gid); err != nil {
				return nil, err
			}
		}

		return []string{fmt.Sprintf("%s:%s:%s", rootHost, v.ContainerPath, normaliseMode(v.Mode, defaultMode))}, nil
	}

	out := make([]string, 0, len(v.Mounts))
	for _, gm := range v.Mounts {
		host := gm.HostPath
		if host == "" {
			host = filepath.Join(rootHost, gm.Name)
		}

		container := gm.ContainerPath
		if container == "" {
			container = path.Join(v.ContainerPath, gm.Name)
		}

		if perUser {
			fsPath := host
			if gm.HostPath == "" && rootFs != "" {
				fsPath = filepath.Join(rootFs, gm.Name)
			}

			if err := m.ensurePerUserDir(fsPath, uid, gid); err != nil {
				return nil, err
			}
		}

		out = append(out, fmt.Sprintf("%s:%s:%s", host, container, normaliseMode(gm.Mode, defaultMode)))
	}

	return out, nil
}

func (m *Manager) ensurePerUserDir(fsPath string, uid, gid int) error {
	if err := os.MkdirAll(fsPath, 0o755); err != nil {
		return fmt.Errorf("create per-user dir %s: %w", fsPath, err)
	}

	// Chown to container PUID/PGID so the unprivileged user inside the container
	// can write to the bind-mounted dir. No-op when wisp already runs under the
	// same UID/GID; fails with EPERM when they differ and wisp is not root —
	// in that case the admin must align UIDs or pre-create the dir.
	if err := os.Chown(fsPath, uid, gid); err != nil {
		return fmt.Errorf("chown %s to %d:%d: %w (align wisp's UID/GID with PUID/PGID, run wisp as root, or pre-create the dir)", fsPath, uid, gid, err)
	}

	return nil
}

// perUserOwner returns the UID/GID the per-user bind-mount dirs should be
// owned by. PUID/PGID env vars take precedence (they're forwarded to the
// container as the runtime user); otherwise fall back to wisp's own UID/GID,
// which is also forwarded so the container matches.
func perUserOwner() (int, int) {
	uid := os.Getuid()
	gid := os.Getgid()
	if v := os.Getenv("PUID"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			uid = n
		}
	}
	if v := os.Getenv("PGID"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			gid = n
		}
	}
	return uid, gid
}

var forwardedEnvVars = []string{
	"TZ",
	"MAX_RESOLUTION",
	"SELKIES_MANUAL_WIDTH",
	"SELKIES_MANUAL_HEIGHT",
	"SELKIES_TURN_HOST",
	"SELKIES_TURN_PORT",
	"SELKIES_TURN_PROTOCOL",
	"SELKIES_TURN_TLS",
	"SELKIES_TURN_SHARED_SECRET",
}

func (m *Manager) buildEnv(spec *catalog.Spec, sessionID string, extraEnv map[string]string) map[string]string {
	// Wisp injects its own HUD iframe into the proxied page, so we suppress
	// Selkies' built-in sidebar to avoid showing two competing menus.
	// App-level env below can still override if a specific app needs it back.
	uid, gid := perUserOwner()
	env := map[string]string{
		"SELKIES_UI_SHOW_SIDEBAR": "False",
		"PUID":                    strconv.Itoa(uid),
		"PGID":                    strconv.Itoa(gid),
	}

	for _, key := range forwardedEnvVars {
		if v, ok := os.LookupEnv(key); ok && v != "" {
			env[key] = v
		}
	}

	switch m.cfg.GPU {
	case "nvidia":
			env["NVIDIA_VISIBLE_DEVICES"] = "all"
			env["NVIDIA_DRIVER_CAPABILITIES"] = "all"
			env["SELKIES_ENCODER"] = "nvh264enc"
	case "intel":
			env["SELKIES_ENCODER"] = "vah264lpenc"  // low-power, optimal sur iGPU Intel
	case "amd", "dri":
			env["SELKIES_ENCODER"] = "vah264enc"
	}

	for k, v := range spec.Container.Env {
		env[k] = v
	}

	// LinuxServer Selkies images read SUBFOLDER (with leading + trailing slash) to
	// emit prefixed asset/WebSocket URLs.
	env["SUBFOLDER"] = "/s/" + sessionID + "/"

	// extraEnv applied last so shortcut launch params (STEAM_APPID, etc.)
	// override anything the app's catalog entry set by default.
	for k, v := range extraEnv {
		env[k] = v
	}

	return env
}

func substitute(in string, userRec *core.Record) string {
	out := strings.ReplaceAll(in, "{user}", userRec.Id)
	out = strings.ReplaceAll(out, "{userId}", userRec.Id)
	if dn := userRec.GetString("name"); dn != "" {
		out = strings.ReplaceAll(out, "{displayName}", slugify(dn))
	}

	return out
}

func normaliseMode(mode, fallback string) string {
	switch mode {
	case "ro", "rw":
		return mode
	default:
		return fallback
	}
}

func slugify(in string) string {
	in = strings.ToLower(strings.TrimSpace(in))
	var b strings.Builder
	for _, r := range in {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
		case r == ' ', r == '-', r == '_':
			b.WriteByte('-')
		}
	}
	return strings.Trim(b.String(), "-")
}
