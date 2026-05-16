package catalog

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"path"
	"regexp"
	"strings"
	"sync"
)

var (
	slugRe     = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{1,62}$`)
	entryRe    = regexp.MustCompile(`^[a-z0-9][a-z0-9/-]*[a-z0-9]$`)
	versionRe  = regexp.MustCompile(`^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$`)
	categoryRe = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,31}$`)
)

// supportedLocales lists the locale bundles the fetcher tries to load for each
// app. Missing bundles are silently skipped. Extending this list is the only
// step needed server-side to advertise a new locale; the catalog repo just
// ships the matching i18n/<locale>.json.
var supportedLocales = []string{"en", "fr"}

var errNotFound = errors.New("not found")

func fetchJSON(ctx context.Context, hc *http.Client, url string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}

	resp, err := hc.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return errNotFound
	}

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("GET %s: status %d", url, resp.StatusCode)
	}

	return json.NewDecoder(resp.Body).Decode(out)
}

// fetchManifest reads <base>/manifest.json and validates the schemaVersion. It
// is the source of truth for both the app list (consumed by fetchSource) and
// the source-level metadata exposed to the admin UI.
func fetchManifest(ctx context.Context, hc *http.Client, base string) (*manifest, error) {
	var man manifest
	if err := fetchJSON(ctx, hc, strings.TrimSuffix(base, "/")+"/manifest.json", &man); err != nil {
		return nil, fmt.Errorf("fetch manifest: %w", err)
	}

	if man.SchemaVersion != 1 {
		return nil, fmt.Errorf("unsupported manifest schemaVersion %d", man.SchemaVersion)
	}

	return &man, nil
}

func fetchSource(ctx context.Context, hc *http.Client, base string) ([]Entry, error) {
	base = strings.TrimSuffix(base, "/")

	man, err := fetchManifest(ctx, hc, base)
	if err != nil {
		return nil, err
	}

	out := make([]Entry, 0, len(man.Apps))
	var mu sync.Mutex
	var wg sync.WaitGroup
	for _, entryPath := range man.Apps {
		if !entryRe.MatchString(entryPath) || strings.Contains(entryPath, "//") {
			continue
		}

		entryPath := entryPath
		wg.Add(1)
		go func() {
			defer wg.Done()

			entry, err := fetchEntry(ctx, hc, base, entryPath)
			if err != nil {
				return
			}

			mu.Lock()
			out = append(out, *entry)
			mu.Unlock()
		}()
	}
	wg.Wait()

	return out, nil
}

func fetchEntry(ctx context.Context, hc *http.Client, base, entryPath string) (*Entry, error) {
	var spec Spec
	if err := fetchJSON(ctx, hc, fmt.Sprintf("%s/%s/wisp.json", base, entryPath), &spec); err != nil {
		return nil, err
	}

	if err := validateSpec(&spec, path.Base(entryPath)); err != nil {
		return nil, err
	}

	spec.I18n = fetchI18n(ctx, hc, base, entryPath)

	return &Entry{
		Slug:          spec.Slug,
		CatalogSource: base,
		CatalogPath:   entryPath,
		IconURL:       fmt.Sprintf("%s/%s/%s", base, entryPath, spec.Icon),
		Spec:          spec,
	}, nil
}

func fetchI18n(ctx context.Context, hc *http.Client, base, entryPath string) map[string]map[string]string {
	out := make(map[string]map[string]string)
	var mu sync.Mutex
	var wg sync.WaitGroup
	for _, loc := range supportedLocales {
		loc := loc
		wg.Add(1)
		go func() {
			defer wg.Done()
			var bundle map[string]string
			url := fmt.Sprintf("%s/%s/i18n/%s.json", base, entryPath, loc)
			if err := fetchJSON(ctx, hc, url, &bundle); err != nil {
				return
			}

			mu.Lock()
			out[loc] = bundle
			mu.Unlock()
		}()
	}
	wg.Wait()
	if len(out) == 0 {
		return nil
	}

	return out
}

func validateSpec(s *Spec, expectedSlug string) error {
	if s.SchemaVersion != 1 {
		return fmt.Errorf("unsupported schemaVersion %d", s.SchemaVersion)
	}

	if s.Slug != expectedSlug {
		return fmt.Errorf("slug mismatch: %q vs dir %q", s.Slug, expectedSlug)
	}

	if !slugRe.MatchString(s.Slug) {
		return errors.New("invalid slug")
	}

	if !versionRe.MatchString(s.Version) {
		return fmt.Errorf("invalid version %q", s.Version)
	}

	if s.Name == "" || s.Icon == "" {
		return errors.New("missing required field")
	}

	if s.Category != "" && !categoryRe.MatchString(s.Category) {
		return fmt.Errorf("invalid category %q", s.Category)
	}

	if s.Container.Image == "" {
		return errors.New("missing container.image")
	}

	if strings.Contains(s.Icon, "..") || strings.HasPrefix(s.Icon, "/") {
		return errors.New("invalid icon path")
	}

	for _, v := range s.Volumes {
		if err := validateVolume(&v); err != nil {
			return err
		}
	}

	return nil
}

func validateVolume(v *Volume) error {
	if v.ID == "" || v.HostPath == "" {
		return errors.New("invalid volume")
	}

	if v.Scope != "shared" && v.Scope != "perUser" {
		return errors.New("invalid volume scope")
	}

	if !strings.HasPrefix(v.ContainerPath, "/") {
		return errors.New("invalid container path")
	}

	if v.IsGrouped() {
		if v.Mode != "" {
			return errors.New("grouped volume must not carry a top-level mode")
		}

		for _, m := range v.Mounts {
			if m.Name == "" || strings.ContainsAny(m.Name, "/\\") {
				return errors.New("invalid grouped mount name")
			}

			if m.Mode != "ro" && m.Mode != "rw" {
				return errors.New("invalid grouped mount mode")
			}
		}

		return nil
	}

	if v.Mode != "ro" && v.Mode != "rw" {
		return errors.New("invalid mode")
	}

	return nil
}
