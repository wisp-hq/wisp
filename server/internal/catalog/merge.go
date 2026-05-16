package catalog

import "encoding/json"

// Overrides is the stored shape of apps.spec for catalog-installed apps: a
// subset of Spec carrying only the fields the wizard collected from the user.
type Overrides struct {
	Container *Container                 `json:"container,omitempty"`
	Volumes   []Volume                   `json:"volumes,omitempty"`
	Features  map[string]json.RawMessage `json:"features,omitempty"`
}

// Merge folds overrides into a base Spec, producing the effective spec a
// session should use. The base must be non-nil; overrides may be nil.
func Merge(base Spec, overrides *Overrides) Spec {
	if overrides == nil {
		return base
	}

	out := base
	if overrides.Container != nil {
		c := base.Container
		if overrides.Container.Image != "" {
			c.Image = overrides.Container.Image
		}

		if len(overrides.Container.Env) > 0 {
			merged := make(map[string]string, len(base.Container.Env)+len(overrides.Container.Env))
			for k, v := range base.Container.Env {
				merged[k] = v
			}

			for k, v := range overrides.Container.Env {
				merged[k] = v
			}

			c.Env = merged
		}

		out.Container = c
	}

	if len(overrides.Volumes) > 0 {
		byID := make(map[string]int, len(base.Volumes))
		for i, v := range base.Volumes {
			byID[v.ID] = i
		}

		merged := append([]Volume(nil), base.Volumes...)
		for _, v := range overrides.Volumes {
			if idx, ok := byID[v.ID]; ok {
				merged[idx] = v
				continue
			}

			byID[v.ID] = len(merged)
			merged = append(merged, v)
		}

		out.Volumes = merged
	}

	if len(overrides.Features) > 0 {
		merged := make(map[string]json.RawMessage, len(base.Features)+len(overrides.Features))
		for k, v := range base.Features {
			merged[k] = v
		}

		for k, v := range overrides.Features {
			merged[k] = v
		}

		out.Features = merged
	}

	return out
}
