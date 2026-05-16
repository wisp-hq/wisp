package libraryfile

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/KevinBonnoron/wisp/internal/shortcuts"
)

const sampleLibrary = `{
  "version": 1,
  "shortcuts": [
    {
      "externalId": "snes:Super Mario World.sfc",
      "name": "Super Mario World",
      "launchParams": {
        "RETROARCH_CORE": "snes9x",
        "SHORTCUT_PATH": "/roms/snes/Super Mario World.sfc"
      },
      "metadata": {
        "group": "snes",
        "crc32": "B19ED489",
        "md5": "CDD3C8C37322978CA8669B34BC89C804",
        "sha1": "6B47BB75D16514B6A476AA0C73A683A2A4C18765"
      }
    },
    {
      "externalId": "megadrive:Sonic.md",
      "name": "Sonic",
      "launchParams": {"RETROARCH_CORE": "genesis_plus_gx", "SHORTCUT_PATH": "/roms/megadrive/Sonic.md"},
      "metadata": {"group": "megadrive"}
    }
  ]
}`

func writeLibrary(t *testing.T, dir, content string) string {
	t.Helper()
	path := filepath.Join(dir, "library.json")
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}

	return path
}

func TestScan_ParsesShortcuts(t *testing.T) {
	dir := t.TempDir()
	path := writeLibrary(t, dir, sampleLibrary)

	out, err := New().Scan(shortcuts.ScanInput{HostRootDir: path})
	if err != nil {
		t.Fatalf("scan: %v", err)
	}

	if len(out) != 2 {
		t.Fatalf("got %d shortcuts, want 2: %v", len(out), out)
	}

	mario := out[0]
	if mario.Name != "Super Mario World" {
		t.Errorf("name: %q", mario.Name)
	}

	if mario.Group != "snes" {
		t.Errorf("group: %q", mario.Group)
	}

	if mario.Hashes.CRC32 != "B19ED489" || mario.Hashes.SHA1 == "" {
		t.Errorf("hashes lost in parse, got %+v", mario.Hashes)
	}

	if mario.LaunchParams["RETROARCH_CORE"] != "snes9x" {
		t.Errorf("core lost in parse, got %q", mario.LaunchParams["RETROARCH_CORE"])
	}
}

func TestScan_MissingFileIsNotAnError(t *testing.T) {
	out, err := New().Scan(shortcuts.ScanInput{HostRootDir: "/non/existent/library.json"})
	if err != nil {
		t.Fatalf("missing file should not error, got %v", err)
	}

	if out != nil {
		t.Errorf("expected nil, got %v", out)
	}
}

func TestScan_InvalidJSONReturnsError(t *testing.T) {
	dir := t.TempDir()
	path := writeLibrary(t, dir, "{not json")

	_, err := New().Scan(shortcuts.ScanInput{HostRootDir: path})
	if err == nil {
		t.Fatal("expected error for invalid JSON")
	}
}

func TestScan_SkipsMalformedEntries(t *testing.T) {
	dir := t.TempDir()
	path := writeLibrary(t, dir, `{
        "version": 1,
        "shortcuts": [
            {"externalId": "good", "name": "Good"},
            {"externalId": "", "name": "missing id"},
            {"externalId": "x", "name": ""}
        ]
    }`)

	out, err := New().Scan(shortcuts.ScanInput{HostRootDir: path})
	if err != nil {
		t.Fatalf("scan: %v", err)
	}

	if len(out) != 1 || out[0].Name != "Good" {
		t.Errorf("expected only the well-formed entry, got %v", out)
	}
}

func TestScan_EmptyPathErrors(t *testing.T) {
	_, err := New().Scan(shortcuts.ScanInput{HostRootDir: ""})
	if err == nil {
		t.Fatal("expected error when containerPath unset")
	}
}

func TestWatchPaths_ReturnsParentDir(t *testing.T) {
	p := New()
	paths := p.WatchPaths("/foo/bar/library.json", shortcuts.ProviderConfig{})
	if len(paths) != 1 || paths[0] != "/foo/bar" {
		t.Errorf("expected [/foo/bar], got %v", paths)
	}
}

func TestHotLaunchIsNil(t *testing.T) {
	if cmd := New().HotLaunchCommand(map[string]string{"X": "Y"}); cmd != nil {
		t.Errorf("expected nil hot-launch, got %v", cmd)
	}
}
