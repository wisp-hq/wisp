package steam

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/KevinBonnoron/wisp/internal/shortcuts"
)

const (
	ProviderType = "steam"

	// Steam game state flag indicating the game is fully installed (not just
	// downloading, updating, uninstalling, etc.). We only surface installed
	// games as shortcuts.
	stateFlagInstalled = 4
)

// nonGameNamePattern matches Steam tools and runtimes that have appmanifest
// files but aren't games: Proton variants, Steam Linux Runtime, and the
// Steamworks Common Redistributables shim. The trailing `(\s|$)` on "Proton"
// avoids false positives on real games whose title starts with the word
// (e.g. a hypothetical "Proton: <subtitle>").
var nonGameNamePattern = regexp.MustCompile(`^(Proton(\s|$)|Steam Linux Runtime|Steamworks Common Redistributables)`)

type Provider struct{}

func New() *Provider { return &Provider{} }

func (p *Provider) Type() string { return ProviderType }

// WatchPaths is just the root: appmanifest_*.acf files sit directly in
// steamapps/, no recursion needed.
func (p *Provider) WatchPaths(rootDir string, _ shortcuts.ProviderConfig) []string {
	return []string{rootDir}
}

// HotLaunchCommand asks an already-running Steam instance to start a specific
// game. The steam:// URL handler routes the request through Steam's IPC so the
// running process picks it up — no need to spawn a second Steam.
func (p *Provider) HotLaunchCommand(params map[string]string) []string {
	appID := params["STEAM_APPID"]
	if appID == "" {
		return nil
	}

	return []string{"steam", "steam://rungameid/" + appID}
}

func (p *Provider) Scan(input shortcuts.ScanInput) ([]shortcuts.Shortcut, error) {
	rootDir := input.HostRootDir
	entries, err := os.ReadDir(rootDir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}

		return nil, fmt.Errorf("read steamapps: %w", err)
	}

	out := make([]shortcuts.Shortcut, 0, len(entries))
	for _, e := range entries {
		name := e.Name()
		if !strings.HasPrefix(name, "appmanifest_") || !strings.HasSuffix(name, ".acf") {
			continue
		}

		f, err := os.Open(filepath.Join(rootDir, name))
		if err != nil {
			continue
		}

		manifest, err := parseACF(f)
		_ = f.Close()
		if err != nil || manifest.AppID == "" || manifest.Name == "" {
			continue
		}

		if !installed(manifest.StateFlags) {
			continue
		}

		if nonGameNamePattern.MatchString(manifest.Name) {
			continue
		}

		out = append(out, shortcuts.Shortcut{
			ExternalID: manifest.AppID,
			Name:       manifest.Name,
			IconURLs: []shortcuts.IconURL{
				{Region: "wor", URL: fmt.Sprintf("https://cdn.cloudflare.steamstatic.com/steam/apps/%s/library_600x900.jpg", manifest.AppID)},
			},
			LaunchParams: map[string]string{
				"STEAM_APPID": manifest.AppID,
			},
		})
	}

	return out, nil
}

// installed checks the StateFlags bitfield. flag 4 = StateFullyInstalled; we
// accept any value that has it set so games being updated (which also have
// other flags) still appear once they were installed at least once.
func installed(raw string) bool {
	if raw == "" {
		return false
	}

	var n int
	for _, c := range raw {
		if c < '0' || c > '9' {
			return false
		}

		n = n*10 + int(c-'0')
	}

	return n&stateFlagInstalled != 0
}
