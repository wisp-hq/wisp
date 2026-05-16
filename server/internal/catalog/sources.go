package catalog

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"strings"

	"github.com/pocketbase/pocketbase/core"
)

const (
	SourcesCollection = "catalog_sources"
	BuiltinSourceID   = "builtin"
	BuiltinSourceURL  = "https://raw.githubusercontent.com/wisp-hq/apps/main"
	BuiltinSourceName = "wisp-hq/apps"
)

type Source struct {
	ID      string `json:"id"`
	URL     string `json:"url"`
	Name    string `json:"name"`
	Enabled bool   `json:"enabled"`
}

var (
	ErrInvalidURL    = errors.New("invalid source URL")
	ErrInvalidSource = errors.New("source does not expose a valid manifest")
)

// NormalizeURL accepts a github.com repo URL or a raw.githubusercontent base URL
// and returns the raw base used by the fetcher.
func NormalizeURL(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	raw = strings.TrimSuffix(raw, "/")
	if raw == "" {
		return "", ErrInvalidURL
	}

	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.Host == "" {
		return "", ErrInvalidURL
	}

	if u.Host == "github.com" {
		parts := strings.Split(strings.Trim(u.Path, "/"), "/")
		if len(parts) < 2 {
			return "", ErrInvalidURL
		}

		owner, repo := parts[0], parts[1]
		branch := "main"
		if len(parts) >= 4 && parts[2] == "tree" {
			branch = parts[3]
		}

		return fmt.Sprintf("https://raw.githubusercontent.com/%s/%s/%s", owner, repo, branch), nil
	}

	return raw, nil
}

// ProbeSource verifies the URL exposes a valid v1 manifest with at least one app.
func (m *Manager) ProbeSource(ctx context.Context, base string) error {
	apps, err := fetchSource(ctx, m.hc, base)
	if err != nil {
		return fmt.Errorf("%w: %v", ErrInvalidSource, err)
	}

	if len(apps) == 0 {
		return fmt.Errorf("%w: manifest has zero valid apps", ErrInvalidSource)
	}

	return nil
}

func (m *Manager) allSources(app core.App) ([]Source, error) {
	out := []Source{{
		ID:      BuiltinSourceID,
		URL:     BuiltinSourceURL,
		Name:    BuiltinSourceName,
		Enabled: true,
	}}

	records, err := app.FindAllRecords(SourcesCollection)
	if err != nil {
		return nil, err
	}

	for _, rec := range records {
		out = append(out, Source{
			ID:      rec.Id,
			URL:     rec.GetString("url"),
			Name:    rec.GetString("name"),
			Enabled: rec.GetBool("enabled"),
		})
	}

	return out, nil
}
