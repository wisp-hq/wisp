package shortcuts

// Shortcut is the in-memory representation of a discovered launcher entry.
// It maps 1:1 to a row in the `app_shortcuts` collection.
type Shortcut struct {
	ExternalID string
	Name       string
	// Group is an optional sub-category within the parent app — for emulator
	// libraries it's the platform name ("SNES", "Mega Drive"), letting the UI
	// offer a second filter axis beneath the source/app filter.
	Group        string
	IconURLs     []IconURL
	LaunchParams map[string]string
	// Hashes carries the ROM checksums emitted by emulator launchers. They
	// drive the asynchronous artwork lookup against ScreenScraper — the
	// provider itself never resolves URLs, it only forwards the hashes.
	Hashes Hashes
}

// Hashes are the optional ROM checksums providers can attach to a shortcut.
// Any combination may be empty; the artwork resolver picks whichever the
// remote API understands best (CRC32 is fastest, SHA1 the most precise).
type Hashes struct {
	CRC32 string `json:"crc32,omitempty"`
	MD5   string `json:"md5,omitempty"`
	SHA1  string `json:"sha1,omitempty"`
}

// HasAny reports whether at least one checksum is set.
func (h Hashes) HasAny() bool {
	return h.CRC32 != "" || h.MD5 != "" || h.SHA1 != ""
}

// IconURL pairs a region code with a cover-art URL. Providers that only know
// one cover (e.g. Steam) return a single entry with Region="wor" (world); ROM
// libraries return one entry per region they have artwork for. The client
// picks the URL matching the user's preferred region, falling back to the
// first available entry.
type IconURL struct {
	Region string `json:"region"`
	URL    string `json:"url"`
}

// ProviderConfig is parsed from the parent app's spec.features.shortcuts blob.
// Type selects the provider implementation; ContainerPath is the path inside
// the container where the launcher's metadata lives. Wisp resolves it against
// the app's spec.volumes to find the equivalent host path for direct reads.
type ProviderConfig struct {
	Type          string `json:"provider"`
	ContainerPath string `json:"containerPath"`
}

// ScanInput is what providers receive to discover their shortcuts. Currently
// only HostRootDir + Config are populated — the manager keeps this as a struct
// so adding future inputs (e.g. a per-user override config) doesn't break
// existing provider signatures.
type ScanInput struct {
	HostRootDir string
	Config      ProviderConfig
}

// Provider knows how to read a launcher's metadata from the host filesystem
// and turn it into a list of Shortcuts. Implementations are pure: they don't
// touch the database or talk to Docker — that's the manager's job.
type Provider interface {
	// Type returns the identifier matching ProviderConfig.Type.
	Type() string
	// Scan reads from the host filesystem and returns the discovered
	// shortcuts. A nil error with an empty slice means "no shortcuts yet";
	// an error means scan failed and the caller should keep the previous
	// state.
	Scan(input ScanInput) ([]Shortcut, error)
	// WatchPaths returns the subdirectories within rootDir that should be
	// watched for changes. Watching only the metadata folder avoids burning
	// inotify slots on the launcher's content (game installs, ROM archives).
	WatchPaths(rootDir string, cfg ProviderConfig) []string
	// HotLaunchCommand returns the argv to execute inside an already-running
	// launcher container in order to start the shortcut identified by params.
	// Returns nil when the launcher offers no in-process trigger, in which
	// case the caller falls back to opening the existing session as-is.
	HotLaunchCommand(params map[string]string) []string
}
