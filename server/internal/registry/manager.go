package registry

import (
	"context"
	"net/http"
	"strings"
	"sync"
	"time"
)

const (
	cacheTTL       = 5 * time.Minute
	defaultTimeout = 8 * time.Second
)

type Manager struct {
	hc *http.Client

	mu    sync.Mutex
	cache map[string]cacheEntry
}

type cacheEntry struct {
	expires time.Time
	value   any
}

func NewManager() *Manager {
	return &Manager{
		hc: &http.Client{
			Timeout: defaultTimeout,
		},
		cache: make(map[string]cacheEntry),
	}
}

func (m *Manager) get(key string) (any, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()

	e, ok := m.cache[key]
	if !ok || time.Now().After(e.expires) {
		if ok {
			delete(m.cache, key)
		}

		return nil, false
	}

	return e.value, true
}

func (m *Manager) set(key string, value any) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.cache[key] = cacheEntry{expires: time.Now().Add(cacheTTL), value: value}
}

func (m *Manager) Search(ctx context.Context, query string, limit int) ([]ImageMatch, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return []ImageMatch{}, nil
	}

	key := "search:" + query
	if v, ok := m.get(key); ok {
		return v.([]ImageMatch), nil
	}

	res, err := searchDockerHub(ctx, m.hc, query, limit)
	if err != nil {
		return nil, err
	}

	if res == nil {
		res = []ImageMatch{}
	}

	m.set(key, res)
	return res, nil
}

func (m *Manager) Tags(ctx context.Context, image, filter string, limit int) ([]TagMatch, error) {
	ref, err := ParseImageRef(image)
	if err != nil {
		return nil, err
	}

	key := "tags:" + ref.Host + "/" + ref.Repo + ":" + filter
	if v, ok := m.get(key); ok {
		return v.([]TagMatch), nil
	}

	var tags []TagMatch
	switch ref.Host {
	case "docker.io":
		tags, err = tagsDockerHub(ctx, m.hc, ref.Repo, filter, limit)
	case "ghcr.io":
		tags, err = tagsGHCR(ctx, m.hc, ref.Repo, filter, limit)
	default:
		return nil, ErrUnsupportedHost
	}

	if err != nil {
		return nil, err
	}

	if tags == nil {
		tags = []TagMatch{}
	}

	m.set(key, tags)
	return tags, nil
}

func containsFold(s, substr string) bool {
	return strings.Contains(strings.ToLower(s), strings.ToLower(substr))
}
