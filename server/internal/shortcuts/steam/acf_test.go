package steam

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/KevinBonnoron/wisp/internal/shortcuts"
)

const sampleManifest = `"AppState"
{
	"appid"		"440"
	"Universe"		"1"
	"LauncherPath"		"/usr/bin/steam"
	"name"		"Team Fortress 2"
	"StateFlags"		"4"
	"installdir"		"Team Fortress 2"
	"InstalledDepots"
	{
		"441"
		{
			"manifest"		"123456"
		}
	}
}
`

func TestParseACF_TopLevelFields(t *testing.T) {
	m, err := parseACF(strings.NewReader(sampleManifest))
	if err != nil {
		t.Fatalf("parseACF: %v", err)
	}

	if m.AppID != "440" {
		t.Errorf("appid: got %q, want 440", m.AppID)
	}

	if m.Name != "Team Fortress 2" {
		t.Errorf("name: got %q, want Team Fortress 2", m.Name)
	}

	if m.StateFlags != "4" {
		t.Errorf("StateFlags: got %q, want 4", m.StateFlags)
	}
}

func TestParseACF_IgnoresNestedKeysWithSameName(t *testing.T) {
	manifest := `"AppState"
{
	"appid" "440"
	"name" "Outer Game"
	"StateFlags" "4"
	"InstalledDepots" {
		"441" {
			"name" "Inner Depot"
		}
	}
}`
	m, err := parseACF(strings.NewReader(manifest))
	if err != nil {
		t.Fatalf("parseACF: %v", err)
	}

	if m.Name != "Outer Game" {
		t.Errorf("got %q, want Outer Game", m.Name)
	}
}

func TestScan_FiltersUninstalled(t *testing.T) {
	dir := t.TempDir()

	mustWrite(t, dir, "appmanifest_111.acf", makeManifest("111", "Installed Game", "4"))
	mustWrite(t, dir, "appmanifest_222.acf", makeManifest("222", "Downloading Game", "1026"))
	mustWrite(t, dir, "appmanifest_333.acf", makeManifest("333", "Update Pending", "6"))
	mustWrite(t, dir, "random.txt", "ignore me")

	p := New()
	out, err := p.Scan(shortcuts.ScanInput{HostRootDir: dir, Config: shortcuts.ProviderConfig{Type: ProviderType}})
	if err != nil {
		t.Fatalf("scan: %v", err)
	}

	gotIDs := map[string]string{}
	for _, s := range out {
		gotIDs[s.ExternalID] = s.Name
	}

	if _, ok := gotIDs["111"]; !ok {
		t.Errorf("expected installed game 111 in results, got %v", gotIDs)
	}

	if _, ok := gotIDs["222"]; ok {
		t.Errorf("did not expect downloading game 222, got %v", gotIDs)
	}

	if name, ok := gotIDs["333"]; !ok || name != "Update Pending" {
		t.Errorf("expected game 333 (state 6 = installed+update) to appear, got %v", gotIDs)
	}
}

func TestScan_FiltersToolsAndRuntimes(t *testing.T) {
	dir := t.TempDir()

	mustWrite(t, dir, "appmanifest_440.acf", makeManifest("440", "Team Fortress 2", "4"))
	mustWrite(t, dir, "appmanifest_1493710.acf", makeManifest("1493710", "Proton Experimental", "4"))
	mustWrite(t, dir, "appmanifest_2348590.acf", makeManifest("2348590", "Proton 9.0 (Beta)", "4"))
	mustWrite(t, dir, "appmanifest_1391110.acf", makeManifest("1391110", "Steam Linux Runtime - Sniper", "4"))
	mustWrite(t, dir, "appmanifest_228980.acf", makeManifest("228980", "Steamworks Common Redistributables", "4"))
	mustWrite(t, dir, "appmanifest_4242.acf", makeManifest("4242", "Proton: A Game About Particles", "4"))

	p := New()
	out, err := p.Scan(shortcuts.ScanInput{HostRootDir: dir, Config: shortcuts.ProviderConfig{Type: ProviderType}})
	if err != nil {
		t.Fatalf("scan: %v", err)
	}

	gotNames := map[string]bool{}
	for _, s := range out {
		gotNames[s.Name] = true
	}

	want := []string{"Team Fortress 2", "Proton: A Game About Particles"}
	for _, n := range want {
		if !gotNames[n] {
			t.Errorf("expected %q in results, got %v", n, gotNames)
		}
	}

	notWant := []string{"Proton Experimental", "Proton 9.0 (Beta)", "Steam Linux Runtime - Sniper", "Steamworks Common Redistributables"}
	for _, n := range notWant {
		if gotNames[n] {
			t.Errorf("did not expect %q in results, got %v", n, gotNames)
		}
	}
}

func TestScan_EmptyDir(t *testing.T) {
	dir := t.TempDir()
	p := New()
	out, err := p.Scan(shortcuts.ScanInput{HostRootDir: dir, Config: shortcuts.ProviderConfig{Type: ProviderType}})
	if err != nil {
		t.Fatalf("scan empty: %v", err)
	}

	if len(out) != 0 {
		t.Errorf("expected 0 shortcuts, got %d", len(out))
	}
}

func TestScan_MissingDir(t *testing.T) {
	p := New()
	out, err := p.Scan(shortcuts.ScanInput{HostRootDir: "/this/path/does/not/exist", Config: shortcuts.ProviderConfig{Type: ProviderType}})
	if err != nil {
		t.Fatalf("scan missing: expected nil error, got %v", err)
	}

	if out != nil {
		t.Errorf("expected nil shortcuts, got %v", out)
	}
}

func mustWrite(t *testing.T, dir, name, content string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func makeManifest(appID, name, stateFlags string) string {
	return `"AppState"
{
	"appid" "` + appID + `"
	"name" "` + name + `"
	"StateFlags" "` + stateFlags + `"
}`
}
