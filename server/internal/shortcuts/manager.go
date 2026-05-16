package shortcuts

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"path/filepath"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
	"github.com/pocketbase/pocketbase/core"
)

// ArtworkResolver enriches a shortcut with cover artwork URLs. The shortcuts
// package owns the call-site and ordering; the actual lookup (screenscraper,
// libretro thumbnails, …) lives in a separate package so it stays optional
// and easy to stub out in tests.
type ArtworkResolver interface {
	// Enabled reports whether the resolver is configured. When false the
	// manager skips it entirely instead of spawning useless goroutines.
	Enabled() bool
	// Resolve looks up a single ROM's artwork. The implementation is
	// expected to rate-limit itself.
	Resolve(ctx context.Context, q ArtworkQuery) ([]IconURL, error)
}

// ArtworkQuery is the resolver input. RomName is derived from the launcher's
// SHORTCUT_PATH when available, since the screenscraper match score improves
// when filename hints are present.
type ArtworkQuery struct {
	Hashes  Hashes
	RomName string
	System  string
}

const (
	collectionShortcuts = "app_shortcuts"

	// Debounce window: Steam fires hundreds of events during a game install.
	// 2s is long enough to coalesce a full install/uninstall transaction but
	// short enough that the UI feels reactive when the user is watching.
	debounceWindow = 2 * time.Second
)

type Manager struct {
	pb       core.App
	registry *Registry
	logger   *slog.Logger
	artwork  ArtworkResolver

	mu       sync.Mutex
	watchers map[string]*watcher

	// enrichInflight tracks the shortcut IDs currently being resolved so a
	// rapid sequence of reconciles (typical when an emulator rewrites its
	// library.json after every ROM scan) doesn't fan out N goroutines per
	// shortcut.
	enrichMu       sync.Mutex
	enrichInflight map[string]struct{}
}

// WatchKey identifies a (user, app) shortcut scope. Each scope owns one
// watcher goroutine and one slice of rows in app_shortcuts.
type WatchKey struct {
	UserID string
	AppID  string
}

func (k WatchKey) String() string { return k.UserID + ":" + k.AppID }

type watcher struct {
	key       WatchKey
	provider  Provider
	cfg       ProviderConfig
	rootDir   string
	fsw       *fsnotify.Watcher
	cancel    context.CancelFunc
	debouncer *time.Timer
	logger    *slog.Logger
}

func NewManager(pb core.App, registry *Registry, logger *slog.Logger, artwork ArtworkResolver) *Manager {
	if logger == nil {
		logger = slog.Default()
	}

	return &Manager{
		pb:             pb,
		registry:       registry,
		logger:         logger,
		artwork:        artwork,
		watchers:       make(map[string]*watcher),
		enrichInflight: make(map[string]struct{}),
	}
}

// Start (re)launches a watcher for the given scope and runs an initial scan.
// Idempotent: calling Start while a watcher already exists tears the old one
// down first. Returns nil quickly even when the initial scan fails — the
// watcher will retry on the next filesystem event.
func (m *Manager) Start(key WatchKey, source, hostRootDir string, cfg ProviderConfig) error {
	provider, ok := m.registry.Get(source)
	if !ok {
		return fmt.Errorf("unknown shortcut provider %q", source)
	}

	m.stopLocked(key)

	logger := m.logger.With("scope", key.String(), "source", source)
	logger.Info("shortcut watcher starting", "rootDir", hostRootDir, "containerPath", cfg.ContainerPath)

	fsw, err := fsnotify.NewWatcher()
	if err != nil {
		return fmt.Errorf("fsnotify watcher: %w", err)
	}

	for _, p := range provider.WatchPaths(hostRootDir, cfg) {
		if err := fsw.Add(p); err != nil {
			// Path might not exist yet (e.g. user just installed the launcher
			// and hasn't logged in). Watch goes through the parent dir below.
			logger.Warn("watch path not added", "path", p, "err", err)
		}
	}

	ctx, cancel := context.WithCancel(context.Background())
	w := &watcher{
		key:      key,
		provider: provider,
		cfg:      cfg,
		rootDir:  hostRootDir,
		fsw:      fsw,
		cancel:   cancel,
		logger:   logger,
	}

	m.mu.Lock()
	m.watchers[key.String()] = w
	m.mu.Unlock()

	// Initial scan — synchronous so the caller sees a populated library
	// immediately if the user has games installed from a previous session.
	if err := m.reconcile(w); err != nil {
		logger.Warn("initial scan failed", "err", err)
	}

	go m.run(ctx, w)
	return nil
}

// Stop terminates the watcher and runs one final scan. The final scan matters
// most for the cold-start scenario: user installs games then closes the
// launcher, no further filesystem events will come, but the catch-up scan
// captures the new state right before the watcher dies.
func (m *Manager) Stop(key WatchKey) {
	m.mu.Lock()
	w := m.watchers[key.String()]
	m.mu.Unlock()
	if w == nil {
		return
	}

	if err := m.reconcile(w); err != nil {
		w.logger.Warn("final scan failed", "err", err)
	}

	m.mu.Lock()
	m.stopLocked(key)
	m.mu.Unlock()
}

func (m *Manager) stopLocked(key WatchKey) {
	w := m.watchers[key.String()]
	if w == nil {
		return
	}

	w.cancel()
	_ = w.fsw.Close()
	if w.debouncer != nil {
		w.debouncer.Stop()
	}

	delete(m.watchers, key.String())
}

// StopAll terminates every active watcher without final scans. Used at
// shutdown — the OS is going away, no point hitting the DB.
func (m *Manager) StopAll() {
	m.mu.Lock()
	defer m.mu.Unlock()
	for k := range m.watchers {
		w := m.watchers[k]
		w.cancel()
		_ = w.fsw.Close()
		if w.debouncer != nil {
			w.debouncer.Stop()
		}
	}

	m.watchers = make(map[string]*watcher)
}

func (m *Manager) run(ctx context.Context, w *watcher) {
	trigger := func() {
		w.logger.Debug("debounce fired, reconciling")
		if err := m.reconcile(w); err != nil {
			w.logger.Warn("reconcile failed", "err", err)
		}
	}

	for {
		select {
		case <-ctx.Done():
			return
		case ev, ok := <-w.fsw.Events:
			if !ok {
				return
			}

			// Coarse filter: only re-scan on events that could change the
			// metadata file set. We could be smarter but it doesn't matter
			// — the scan itself is cheap.
			if ev.Op&(fsnotify.Create|fsnotify.Write|fsnotify.Remove|fsnotify.Rename) == 0 {
				continue
			}

			if w.debouncer == nil {
				w.debouncer = time.AfterFunc(debounceWindow, trigger)
			} else {
				w.debouncer.Reset(debounceWindow)
			}
		case err, ok := <-w.fsw.Errors:
			if !ok {
				return
			}

			w.logger.Warn("fsnotify error", "err", err)
		}
	}
}

// reconcile runs one scan and diffs against the rows currently in
// app_shortcuts for this scope. New entries are inserted, updated entries
// touched, missing entries deleted. Each row mutation is independent so a
// single failure (unique violation, validation) doesn't poison the rest.
func (m *Manager) reconcile(w *watcher) error {
	scanned, err := w.provider.Scan(ScanInput{
		HostRootDir: w.rootDir,
		Config:      w.cfg,
	})
	if err != nil {
		return fmt.Errorf("scan: %w", err)
	}

	existing, err := m.pb.FindRecordsByFilter(
		collectionShortcuts,
		"user = {:user} && app = {:app}",
		"+name",
		1000,
		0,
		map[string]any{"user": w.key.UserID, "app": w.key.AppID},
	)
	if err != nil {
		return fmt.Errorf("load existing: %w", err)
	}

	byExternalID := make(map[string]*core.Record, len(existing))
	for _, rec := range existing {
		byExternalID[rec.GetString("externalId")] = rec
	}

	col, err := m.pb.FindCollectionByNameOrId(collectionShortcuts)
	if err != nil {
		return fmt.Errorf("find collection: %w", err)
	}

	created, updated := 0, 0
	seen := make(map[string]struct{}, len(scanned))
	var pendingEnrichment []enrichJob
	for _, s := range scanned {
		seen[s.ExternalID] = struct{}{}
		paramsJSON, _ := json.Marshal(s.LaunchParams)
		rec, exists := byExternalID[s.ExternalID]
		if !exists {
			rec = core.NewRecord(col)
			rec.Set("user", w.key.UserID)
			rec.Set("app", w.key.AppID)
			rec.Set("externalId", s.ExternalID)
		}

		rec.Set("name", s.Name)
		rec.Set("group", s.Group)
		rec.Set("launchParams", string(paramsJSON))
		// iconUrls precedence: fresh scan > existing record. The scan only
		// carries URLs when the provider already resolves them (e.g. Steam);
		// emulator libraries leave it empty and rely on async enrichment, so
		// we must preserve any previously-cached value rather than wiping it.
		if len(s.IconURLs) > 0 {
			iconsJSON, _ := json.Marshal(s.IconURLs)
			rec.Set("iconUrls", string(iconsJSON))
		}

		if err := m.pb.Save(rec); err != nil {
			// Don't abort — a single bad row shouldn't block the rest.
			w.logger.Warn("save shortcut failed", "externalId", s.ExternalID, "err", err)
			continue
		}

		if exists {
			updated++
		} else {
			created++
		}

		if shouldEnrich(rec, s) {
			pendingEnrichment = append(pendingEnrichment, enrichJob{
				recordID: rec.Id,
				query: ArtworkQuery{
					Hashes:  s.Hashes,
					RomName: romNameFromParams(s.LaunchParams),
					System:  s.Group,
				},
			})
		}
	}

	deleted := 0
	for extID, rec := range byExternalID {
		if _, kept := seen[extID]; kept {
			continue
		}

		if err := m.pb.Delete(rec); err != nil {
			w.logger.Warn("delete stale shortcut failed", "externalId", extID, "err", err)
			continue
		}

		deleted++
	}

	w.logger.Info("shortcut reconcile",
		"rootDir", w.rootDir,
		"scanned", len(scanned),
		"created", created,
		"updated", updated,
		"deleted", deleted,
		"enrichQueued", len(pendingEnrichment),
	)

	for _, job := range pendingEnrichment {
		m.scheduleEnrichment(w.logger, job)
	}

	return nil
}

type enrichJob struct {
	recordID string
	query    ArtworkQuery
}

// shouldEnrich decides whether a shortcut needs an artwork lookup. We skip
// when the provider already gave us URLs, when nothing in the metadata lets
// us match a remote game, or when the cached record already has artwork.
func shouldEnrich(rec *core.Record, s Shortcut) bool {
	if len(s.IconURLs) > 0 {
		return false
	}

	if !s.Hashes.HasAny() {
		return false
	}

	if cached := rec.GetString("iconUrls"); cached != "" && cached != "null" && cached != "[]" {
		return false
	}

	return true
}

// romNameFromParams extracts the base filename from SHORTCUT_PATH (or any
// equivalent launcher param). Sending it to screenscraper sharpens fuzzy
// matches when several ROMs share a CRC (homebrew, hacks).
func romNameFromParams(params map[string]string) string {
	if params == nil {
		return ""
	}

	for _, key := range []string{"SHORTCUT_PATH", "ROM_PATH", "GAME_PATH"} {
		if v, ok := params[key]; ok && v != "" {
			return filepath.Base(v)
		}
	}

	return ""
}

// scheduleEnrichment hands a single lookup to the resolver in a goroutine and
// persists the result back onto the record. The inflight set deduplicates so
// a debounced storm of fsnotify events doesn't queue the same lookup twice.
func (m *Manager) scheduleEnrichment(logger *slog.Logger, job enrichJob) {
	if m.artwork == nil || !m.artwork.Enabled() {
		return
	}

	m.enrichMu.Lock()
	if _, busy := m.enrichInflight[job.recordID]; busy {
		m.enrichMu.Unlock()
		return
	}

	m.enrichInflight[job.recordID] = struct{}{}
	m.enrichMu.Unlock()

	go func() {
		defer func() {
			m.enrichMu.Lock()
			delete(m.enrichInflight, job.recordID)
			m.enrichMu.Unlock()
		}()

		// Generous ceiling — the resolver does its own rate-limiting so the
		// goroutine may sit idle for seconds before sending the request.
		ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
		defer cancel()

		icons, err := m.artwork.Resolve(ctx, job.query)
		if err != nil {
			logger.Debug("artwork lookup failed", "recordID", job.recordID, "err", err)
			return
		}

		if len(icons) == 0 {
			return
		}

		rec, err := m.pb.FindRecordById(collectionShortcuts, job.recordID)
		if err != nil {
			// Record was deleted while we were looking up. No-op.
			return
		}

		iconsJSON, _ := json.Marshal(icons)
		rec.Set("iconUrls", string(iconsJSON))
		if err := m.pb.Save(rec); err != nil {
			logger.Warn("save enriched iconUrls failed", "recordID", job.recordID, "err", err)
		}
	}()
}

// BuildHotLaunchCommand returns the argv to inject into an already-running
// container in order to start the shortcut described by params. Returns nil
// when the provider is unknown or the launcher doesn't support hot-launching.
func (m *Manager) BuildHotLaunchCommand(source string, params map[string]string) []string {
	p, ok := m.registry.Get(source)
	if !ok {
		return nil
	}

	return p.HotLaunchCommand(params)
}

// WatchPaths returns the directories the provider wants to watch. Used by the
// sessions manager to pre-create them with the right ownership before fsnotify
// attaches — providers that point at a path created lazily by the launcher
// (e.g. library-file) would otherwise lose every event up to first write.
func (m *Manager) WatchPaths(source, rootDir string, cfg ProviderConfig) []string {
	p, ok := m.registry.Get(source)
	if !ok {
		return nil
	}

	return p.WatchPaths(rootDir, cfg)
}

// LoadShortcut fetches a single shortcut by ID and confirms ownership. Returns
// (nil, nil) when the row is missing — callers translate that to 404.
var ErrShortcutNotFound = errors.New("shortcut not found")

func (m *Manager) LoadShortcut(id, userID string) (*core.Record, error) {
	rec, err := m.pb.FindRecordById(collectionShortcuts, id)
	if err != nil {
		return nil, ErrShortcutNotFound
	}

	if rec.GetString("user") != userID {
		return nil, ErrShortcutNotFound
	}

	return rec, nil
}

