package catalog

import (
	"encoding/json"
	"path"
)

// Spec is the in-memory representation of a wisp.json manifest, enriched with
// the i18n bundle resolved from the catalog source. It mirrors the JSON Schema
// in the apps repo (schemaVersion 1) and is stored verbatim in apps.spec when
// the admin installs the app.
type Spec struct {
	SchemaVersion int                          `json:"schemaVersion"`
	Slug          string                       `json:"slug"`
	Version       string                       `json:"version"`
	Name          string                       `json:"name"`
	Description   string                       `json:"description,omitempty"`
	Icon          string                       `json:"icon"`
	DefaultLocale string                       `json:"defaultLocale,omitempty"`
	// Category groups apps in the home-page filter (e.g. "emulator",
	// "streaming"). Optional — apps without a category fall under the
	// implicit "all" bucket. The value is a free-form slug, not a closed
	// enum, so catalogs can coin new categories without server changes.
	Category  string                       `json:"category,omitempty"`
	Container Container                    `json:"container"`
	Volumes   []Volume                     `json:"volumes,omitempty"`
	Features  map[string]json.RawMessage   `json:"features,omitempty"`
	I18n      map[string]map[string]string `json:"i18n,omitempty"`
}

type Container struct {
	Image string            `json:"image"`
	Env   map[string]string `json:"env,omitempty"`
}

// Volume holds both the "simple" and "grouped" manifest shapes:
//   - Simple:  Mode set, Mounts empty.
//   - Grouped: Mounts non-empty, Mode ignored (each sub-mount carries its own).
type Volume struct {
	ID            string         `json:"id"`
	Label         string         `json:"label,omitempty"`
	Scope         string         `json:"scope"`
	HostPath      string         `json:"hostPath"`
	ContainerPath string         `json:"containerPath"`
	Mode          string         `json:"mode,omitempty"`
	Mounts        []GroupedMount `json:"mounts,omitempty"`
}

// GroupedMount is one sub-mount of a grouped volume. Name is the leaf appended
// to both the host and container roots. HostPath/ContainerPath are admin-side
// overrides written by the Wisp wizard when the user diverges from the default
// "{root}/{name}" layout; the catalog schema doesn't surface them, but the
// runtime tolerates and respects them.
type GroupedMount struct {
	Name          string `json:"name"`
	Mode          string `json:"mode"`
	HostPath      string `json:"hostPath,omitempty"`
	ContainerPath string `json:"containerPath,omitempty"`
}

func (v *Volume) IsGrouped() bool { return len(v.Mounts) > 0 }

// EffectiveMount is a (host, container, mode) triple after expansion of a
// grouped volume — or a 1-element slice for a simple volume. Path overrides on
// GroupedMount entries win over the default "{root}/{name}" composition.
type EffectiveMount struct {
	HostPath      string
	ContainerPath string
	Mode          string
}

// Expand returns the per-mount effective triples for a volume, without
// substituting templates ({user}, etc.) or applying the perUser host-root
// rewrite — the sessions manager handles those.
func (v *Volume) Expand() []EffectiveMount {
	if !v.IsGrouped() {
		return []EffectiveMount{{HostPath: v.HostPath, ContainerPath: v.ContainerPath, Mode: v.Mode}}
	}

	out := make([]EffectiveMount, 0, len(v.Mounts))
	for _, m := range v.Mounts {
		host := m.HostPath
		if host == "" {
			host = path.Join(v.HostPath, m.Name)
		}

		container := m.ContainerPath
		if container == "" {
			container = path.Join(v.ContainerPath, m.Name)
		}

		out = append(out, EffectiveMount{HostPath: host, ContainerPath: container, Mode: m.Mode})
	}

	return out
}

// FeatureShortcuts is the typed shape of `features.shortcuts`. Other features
// stay as raw JSON until something needs them.
type FeatureShortcuts struct {
	Provider      string `json:"provider"`
	ContainerPath string `json:"containerPath"`
}

// Entry is what the HTTP catalog endpoint returns to the client: an installable
// app, with its source URL and full spec. Icon is rewritten to an absolute URL
// the browser can fetch directly.
type Entry struct {
	Slug          string `json:"slug"`
	CatalogSource string `json:"catalogSource"`
	CatalogPath   string `json:"catalogPath"`
	Source        string `json:"source"`
	IconURL       string `json:"iconUrl"`
	Spec          Spec   `json:"spec"`
}

type manifest struct {
	SchemaVersion int      `json:"schemaVersion"`
	Name          string   `json:"name"`
	Description   string   `json:"description"`
	Homepage      string   `json:"homepage"`
	Apps          []string `json:"apps"`
}

// SourceInfo enriches a catalog Source with the manifest-level metadata the
// upstream repo advertises (name, description, homepage). Populated by the
// catalog Manager when the source's manifest.json is fetched; nil when the
// fetch failed.
type SourceInfo struct {
	ID            string   `json:"id"`
	URL           string   `json:"url"`
	LocalName     string   `json:"localName"`
	Enabled       bool     `json:"enabled"`
	ManifestName  string   `json:"manifestName,omitempty"`
	Description   string   `json:"description,omitempty"`
	Homepage      string   `json:"homepage,omitempty"`
	Apps          []string `json:"apps,omitempty"`
	FetchError    string   `json:"fetchError,omitempty"`
}
