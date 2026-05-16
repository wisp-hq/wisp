// Package screenscraper resolves ROM artwork against the screenscraper.fr
// public API. Credentials are baked into the binary at link time via
// -ldflags="-X" — the build is the only place they live in cleartext, so the
// container env, command line and pb_data never see them.
package screenscraper

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/KevinBonnoron/wisp/internal/shortcuts"
)

// devID and devPassword are populated at link time:
//
//	go build -ldflags="-X github.com/KevinBonnoron/wisp/internal/screenscraper.devID=...
//	                   -X github.com/KevinBonnoron/wisp/internal/screenscraper.devPassword=..."
//
// Empty values mean the build did not embed credentials; the client then
// reports as disabled and the manager skips lookups silently.
var (
	devID       = ""
	devPassword = ""
)

const (
	softName    = "wisp"
	apiEndpoint = "https://api.screenscraper.fr/api2/jeuInfos.php"

	// Anonymous quota on screenscraper.fr is roughly one call per second.
	// Spacing requests on the client side keeps us under the bar and avoids
	// the 429 cliff that triggers temporary IP blocks.
	defaultInterval = 1100 * time.Millisecond
)

// ErrDisabled is returned by Lookup when the binary was built without
// credentials. Callers should treat it as a soft "skip" rather than a failure.
var ErrDisabled = errors.New("screenscraper: credentials not embedded at build time")

// ErrNotFound means screenscraper has no game matching the provided hashes.
// Distinguishing this from a transport error lets callers persist a negative
// cache instead of retrying forever.
var ErrNotFound = errors.New("screenscraper: game not found")

type Client struct {
	httpClient *http.Client
	logger     *slog.Logger

	mu      sync.Mutex
	nextOK  time.Time
	spacing time.Duration
}

// New returns a client wired to the package-level credentials. Pass a nil
// logger to inherit slog.Default.
func New(logger *slog.Logger) *Client {
	if logger == nil {
		logger = slog.Default()
	}

	return &Client{
		httpClient: &http.Client{Timeout: 15 * time.Second},
		logger:     logger,
		spacing:    defaultInterval,
	}
}

// Enabled reports whether credentials were embedded at build time. Manager
// uses this to avoid spawning enrichment goroutines when no API is reachable.
func (c *Client) Enabled() bool {
	return devID != "" && devPassword != ""
}

// Resolve looks the ROM up on screenscraper and returns the matching artwork.
// The call blocks long enough to respect the configured rate-limit; pass a
// deadline-bound context to bail out early.
//
// Signature matches shortcuts.ArtworkResolver so the client can be wired
// straight into the shortcut manager — no adapter layer.
func (c *Client) Resolve(ctx context.Context, q shortcuts.ArtworkQuery) ([]shortcuts.IconURL, error) {
	if !c.Enabled() {
		return nil, ErrDisabled
	}

	if !q.Hashes.HasAny() && q.RomName == "" {
		return nil, fmt.Errorf("screenscraper: nothing to match against (no hashes, no romname)")
	}

	if err := c.waitSlot(ctx); err != nil {
		return nil, err
	}

	params := url.Values{}
	params.Set("devid", devID)
	params.Set("devpassword", devPassword)
	params.Set("softname", softName)
	params.Set("output", "json")
	if q.Hashes.CRC32 != "" {
		params.Set("crc", strings.ToUpper(q.Hashes.CRC32))
	}

	if q.Hashes.MD5 != "" {
		params.Set("md5", strings.ToUpper(q.Hashes.MD5))
	}

	if q.Hashes.SHA1 != "" {
		params.Set("sha1", strings.ToUpper(q.Hashes.SHA1))
	}

	if q.RomName != "" {
		params.Set("romnom", q.RomName)
	}

	if sysID, ok := systemIDFor(q.System); ok {
		params.Set("systemeid", sysID)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, apiEndpoint+"?"+params.Encode(), nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("screenscraper request: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	// screenscraper returns 404 with a plain "Erreur" body when no match.
	if resp.StatusCode == http.StatusNotFound {
		return nil, ErrNotFound
	}

	if resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode == http.StatusForbidden {
		// Slow ourselves down for the rest of the process lifetime — quota
		// resets daily, but we have no way to know when, so doubling the
		// spacing on the next call is the safest reaction.
		c.backoff()
		return nil, fmt.Errorf("screenscraper quota hit (status %d)", resp.StatusCode)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("screenscraper status %d: %s", resp.StatusCode, truncate(string(body), 200))
	}

	var raw apiResponse
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, fmt.Errorf("screenscraper decode: %w", err)
	}

	if raw.Response.Game.ID == "" {
		return nil, ErrNotFound
	}

	return raw.Response.Game.toIconURLs(), nil
}

// New is the default constructor; callers that want logging customisation
// pass their own slogger. The returned *Client satisfies
// shortcuts.ArtworkResolver — wire it straight into shortcuts.NewManager.
var _ shortcuts.ArtworkResolver = (*Client)(nil)

func (c *Client) waitSlot(ctx context.Context) error {
	c.mu.Lock()
	now := time.Now()
	wait := time.Duration(0)
	if !c.nextOK.IsZero() && now.Before(c.nextOK) {
		wait = c.nextOK.Sub(now)
	}

	c.nextOK = now.Add(wait + c.spacing)
	c.mu.Unlock()

	if wait <= 0 {
		return nil
	}

	t := time.NewTimer(wait)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-t.C:
		return nil
	}
}

func (c *Client) backoff() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.spacing *= 2
	if c.spacing > 30*time.Second {
		c.spacing = 30 * time.Second
	}
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}

	return s[:n] + "…"
}
