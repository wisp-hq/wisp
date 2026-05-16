package libraryfile

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"github.com/KevinBonnoron/wisp/internal/shortcuts"
)

// ProviderType is the value the wisp.json must set for `features.shortcuts.provider`.
const ProviderType = "library-file"

// library is the on-disk format we expect at ContainerPath. It is intentionally
// a thin serialisation of the in-memory shortcuts.Shortcut slice so launcher
// images can generate it with a one-liner from any scripting language — the
// only contract is "valid JSON, version: 1, shortcuts: [...]".
type library struct {
	Version   int    `json:"version"`
	Shortcuts []item `json:"shortcuts"`
}

type item struct {
	ExternalID   string            `json:"externalId"`
	Name         string            `json:"name"`
	LaunchParams map[string]string `json:"launchParams,omitempty"`
	Metadata     metadata          `json:"metadata,omitempty"`
}

type metadata struct {
	Group string `json:"group,omitempty"`
	CRC32 string `json:"crc32,omitempty"`
	MD5   string `json:"md5,omitempty"`
	SHA1  string `json:"sha1,omitempty"`
}

// Provider reads a library file (JSON) produced by the launcher container and
// turns it into Wisp shortcuts. The container is the source of truth: it
// owns the per-launcher knowledge (which ROM extensions belong to which
// system, where thumbnails live, etc.) and produces the file at every start.
// Wisp's role is reduced to parsing — no docker exec, no per-launcher config
// in wisp.json, no system tables in our codebase.
type Provider struct{}

func New() *Provider { return &Provider{} }

func (p *Provider) Type() string { return ProviderType }

// WatchPaths returns the directory holding the library file. fsnotify can't
// watch a single file reliably (atomic renames break the watch), so we watch
// the parent dir and the reconciler filters events to the file we care about
// — that's enough; the manager re-scans on every event anyway.
func (p *Provider) WatchPaths(rootDir string, cfg shortcuts.ProviderConfig) []string {
	if rootDir == "" {
		return nil
	}

	return []string{filepath.Dir(rootDir)}
}

// HotLaunchCommand returns nil. No generic way for Wisp to ask an arbitrary
// launcher to switch content — the launch path is cold-start only, with
// RETROARCH_* (or equivalent) env vars set from launchParams.
func (p *Provider) HotLaunchCommand(_ map[string]string) []string {
	return nil
}

func (p *Provider) Scan(input shortcuts.ScanInput) ([]shortcuts.Shortcut, error) {
	path := input.HostRootDir
	if path == "" {
		return nil, errors.New("library-file: containerPath must point at the library JSON")
	}

	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			// First-run case: the container hasn't generated the library yet.
			// Not an error — the next reconcile (after the container writes
			// the file) will pick it up via fsnotify.
			return nil, nil
		}

		return nil, fmt.Errorf("read library file: %w", err)
	}

	var lib library
	if err := json.Unmarshal(data, &lib); err != nil {
		return nil, fmt.Errorf("parse library file: %w", err)
	}

	out := make([]shortcuts.Shortcut, 0, len(lib.Shortcuts))
	for _, it := range lib.Shortcuts {
		if it.ExternalID == "" || it.Name == "" {
			// Skip malformed entries rather than abort the whole import. The
			// container script may be in mid-write or have a buggy row.
			continue
		}

		out = append(out, shortcuts.Shortcut{
			ExternalID:   it.ExternalID,
			Name:         it.Name,
			Group:        it.Metadata.Group,
			LaunchParams: it.LaunchParams,
			Hashes: shortcuts.Hashes{
				CRC32: it.Metadata.CRC32,
				MD5:   it.Metadata.MD5,
				SHA1:  it.Metadata.SHA1,
			},
		})
	}

	return out, nil
}

// Compile-time check.
var _ shortcuts.Provider = (*Provider)(nil)
