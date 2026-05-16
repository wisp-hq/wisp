package shortcuts

import (
	"encoding/json"
	"fmt"
)

// Registry maps provider type identifiers to implementations.
type Registry struct {
	providers map[string]Provider
}

func NewRegistry() *Registry {
	return &Registry{providers: make(map[string]Provider)}
}

func (r *Registry) Register(p Provider) {
	r.providers[p.Type()] = p
}

func (r *Registry) Get(typ string) (Provider, bool) {
	p, ok := r.providers[typ]
	return p, ok
}

// ParseConfig extracts the ProviderConfig from a raw spec.features.shortcuts
// blob. Returns (nil, nil) when the blob is empty or the provider field is
// unset — both mean "this app has no shortcuts feature".
func ParseConfig(raw json.RawMessage) (*ProviderConfig, error) {
	if len(raw) == 0 || string(raw) == "null" {
		return nil, nil
	}

	var cfg ProviderConfig
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return nil, fmt.Errorf("parse shortcuts feature: %w", err)
	}

	if cfg.Type == "" {
		return nil, nil
	}

	return &cfg, nil
}
