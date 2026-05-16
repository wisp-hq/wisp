package catalog

import (
	"context"
	"log/slog"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/pocketbase/pocketbase/core"
)

const (
	cacheTTL       = 15 * time.Minute
	cacheFailedTTL = 30 * time.Second
	httpTimeout    = 8 * time.Second
)

type Manager struct {
	hc     *http.Client
	app    core.App
	logger *slog.Logger

	mu      sync.Mutex
	apps    []Entry
	expires time.Time
}

func NewManager(app core.App, logger *slog.Logger) *Manager {
	if logger == nil {
		logger = slog.Default()
	}

	return &Manager{
		hc:     &http.Client{Timeout: httpTimeout},
		app:    app,
		logger: logger,
	}
}

func (m *Manager) Invalidate() {
	m.mu.Lock()
	m.apps = nil
	m.expires = time.Time{}
	m.mu.Unlock()
}

// ListSources returns each configured catalog source enriched with the
// upstream manifest metadata (name, description, homepage). Sources that
// fail to fetch are still returned with their FetchError populated so the
// admin can see what went wrong rather than silently dropping the row.
func (m *Manager) ListSources(ctx context.Context) ([]SourceInfo, error) {
	sources, err := m.allSources(m.app)
	if err != nil {
		return nil, err
	}

	out := make([]SourceInfo, 0, len(sources))
	for _, src := range sources {
		info := SourceInfo{
			ID:        src.ID,
			URL:       src.URL,
			LocalName: src.Name,
			Enabled:   src.Enabled,
		}

		man, err := fetchManifest(ctx, m.hc, src.URL)
		if err != nil {
			info.FetchError = err.Error()
		} else {
			info.ManifestName = man.Name
			info.Description = man.Description
			info.Homepage = man.Homepage
			info.Apps = man.Apps
		}

		out = append(out, info)
	}

	return out, nil
}

// Find looks up a single catalog entry by source URL + slug. Returns nil when
// no match is found in the cached list (and lazily refreshes via List).
func (m *Manager) Find(ctx context.Context, source, slug string) (*Entry, error) {
	entries, err := m.List(ctx)
	if err != nil {
		return nil, err
	}

	for i := range entries {
		if entries[i].CatalogSource == source && entries[i].Slug == slug {
			return &entries[i], nil
		}
	}

	return nil, nil
}

func (m *Manager) List(ctx context.Context) ([]Entry, error) {
	m.mu.Lock()
	if m.apps != nil && time.Now().Before(m.expires) {
		out := append([]Entry{}, m.apps...)
		m.mu.Unlock()
		return out, nil
	}
	m.mu.Unlock()

	sources, err := m.allSources(m.app)
	if err != nil {
		return nil, err
	}

	seen := make(map[string]bool)
	merged := []Entry{}
	anyFailed := false
	for _, src := range sources {
		if !src.Enabled {
			continue
		}

		entries, err := fetchSource(ctx, m.hc, src.URL)
		if err != nil {
			// Don't fail the whole catalog if one source is unreachable —
			// the user's typo or temporary outage shouldn't hide the rest.
			m.logger.Warn("catalog source fetch failed",
				"source", src.Name, "url", src.URL, "error", err)
			anyFailed = true
			continue
		}

		for _, a := range entries {
			if seen[a.Slug] {
				continue
			}

			seen[a.Slug] = true
			a.Source = src.ID
			merged = append(merged, a)
		}
	}

	sort.Slice(merged, func(i, j int) bool {
		return strings.ToLower(merged[i].Spec.Name) < strings.ToLower(merged[j].Spec.Name)
	})

	ttl := cacheTTL
	if anyFailed {
		// Don't pin an empty/partial result for 15 min after a transient outage
		// (e.g. GitHub raw timing out). Retry soon.
		ttl = cacheFailedTTL
	}

	m.mu.Lock()
	m.apps = merged
	m.expires = time.Now().Add(ttl)
	out := append([]Entry{}, m.apps...)
	m.mu.Unlock()

	return out, nil
}
