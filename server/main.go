package main

import (
	"context"
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"log/slog"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/plugins/migratecmd"

	"github.com/KevinBonnoron/wisp/internal/api"
	"github.com/KevinBonnoron/wisp/internal/catalog"
	"github.com/KevinBonnoron/wisp/internal/cleanup"
	"github.com/KevinBonnoron/wisp/internal/config"
	"github.com/KevinBonnoron/wisp/internal/docker"
	"github.com/KevinBonnoron/wisp/internal/logging"
	"github.com/KevinBonnoron/wisp/internal/participants"
	"github.com/KevinBonnoron/wisp/internal/progress"
	"github.com/KevinBonnoron/wisp/internal/proxy"
	"github.com/KevinBonnoron/wisp/internal/registry"
	"github.com/KevinBonnoron/wisp/internal/screenscraper"
	"github.com/KevinBonnoron/wisp/internal/sessions"
	"github.com/KevinBonnoron/wisp/internal/shortcuts"
	"github.com/KevinBonnoron/wisp/internal/shortcuts/libraryfile"
	"github.com/KevinBonnoron/wisp/internal/shortcuts/steam"
	"github.com/KevinBonnoron/wisp/internal/static"

	_ "github.com/KevinBonnoron/wisp/migrations"
)

//go:embed all:spa
var spaFS embed.FS

func main() {
	cfg := config.Load()
	logger := slog.New(logging.New(os.Stderr, slog.LevelInfo))
	slog.SetDefault(logger)
	logging.RedirectStdlib(logger)

	app := pocketbase.NewWithConfig(pocketbase.Config{
		DefaultDataDir: cfg.PocketBaseDir,
	})

	migratecmd.MustRegister(app, app.RootCmd, migratecmd.Config{
		// Migrations are committed Go files; never auto-generate new ones at runtime.
		Automigrate: false,
	})

	// In the kiosk model every user tile must expose enough info for the picker to
	// submit a working auth-with-password call (i.e. the email). Force-enable
	// emailVisibility on every users record, so admins don't have to remember the checkbox.
	// Also: the first user to sign up gets the admin role automatically; everyone after
	// is a player. The admin curates the global app catalog.
	app.OnRecordCreate("users").BindFunc(func(e *core.RecordEvent) error {
		e.Record.Set("emailVisibility", true)
		if e.Record.GetString("role") == "" {
			total, err := app.CountRecords("users")
			if err != nil {
				return err
			}

			if total == 0 {
				e.Record.Set("role", "admin")
			} else {

				e.Record.Set("role", "player")
			}
		}

		return e.Next()
	})
	app.OnRecordUpdate("users").BindFunc(func(e *core.RecordEvent) error {
		if !e.Record.GetBool("emailVisibility") {
			e.Record.Set("emailVisibility", true)
		}

		return e.Next()
	})

	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		if err := bootstrapSuperuser(se.App, cfg, logger); err != nil {
			return err
		}

		dk, err := docker.New()
		if err != nil {
			return fmt.Errorf("docker client init: %w", err)
		}

		shortcutsRegistry := shortcuts.NewRegistry()
		shortcutsRegistry.Register(steam.New())
		shortcutsRegistry.Register(libraryfile.New())
		artwork := screenscraper.New(logger)
		if !artwork.Enabled() {
			logger.Info("screenscraper artwork resolver disabled (no credentials baked into binary)")
		}

		smgr := shortcuts.NewManager(app, shortcutsRegistry, logger, artwork)

		cmgr := catalog.NewManager(app, logger)
		mgr := sessions.NewManager(app, dk, cfg, logger, progress.New(), smgr, cmgr)
		pmgr := participants.NewManager(app)
		preg := participants.NewRegistry()
		rmgr := registry.NewManager()
		cleaner := cleanup.New(cfg, mgr, dk, logger)

		// PB's UpdateRule lets the session host (createdBy) PATCH a participant row,
		// but PB has no field-level access control. Lock down immutable fields,
		// keep slot consistent with role on every save (auto-allocating on player
		// promotion), and kick active connections after role changes so the new
		// role takes effect immediately instead of on the next manual reconnect.
		app.OnRecordUpdate(participants.Collection).BindFunc(func(e *core.RecordEvent) error {
			original := e.Record.Original()
			for _, f := range []string{"token", "session", "createdBy", "user"} {
				if e.Record.Get(f) != original.Get(f) {
					e.Record.Set(f, original.Get(f))
				}
			}

			pmgr.ReconcileSlot(e.Record)

			roleChanged := e.Record.GetString("role") != original.GetString("role")
			slotChanged := e.Record.GetInt("slot") != original.GetInt("slot")
			revoked := e.Record.GetString("revokedAt") != "" && original.GetString("revokedAt") == ""

			if err := e.Next(); err != nil {
				return err
			}

			if roleChanged || slotChanged || revoked {
				preg.Disconnect(e.Record.Id)
			}

			return nil
		})

		api.Register(se, mgr, pmgr, preg, rmgr, cmgr, smgr)
		se.Router.GET(proxy.InjectScriptPath, proxy.InjectScriptHandler())
		se.Router.Any("/s/{sessionId}/{path...}", proxy.Handler(mgr, pmgr, preg))

		// Kick off the image pull as soon as an admin installs an app, so the user
		// sees real download progress on the new tile instead of an "update" badge.
		// Pre-marking the record `pulling` means the live-query push that follows
		// the save carries the in-progress state — no race with the goroutine.
		app.OnRecordCreate("apps").BindFunc(func(e *core.RecordEvent) error {
			state := sessions.AppState{ImageStatus: sessions.ImageStatusPulling}
			b, _ := json.Marshal(state)
			e.Record.Set("state", string(b))
			if err := e.Next(); err != nil {
				return err
			}

			mgr.UpdateApp(e.Record)
			return nil
		})

		app.OnRecordCreate(catalog.SourcesCollection).BindFunc(func(e *core.RecordEvent) error {
			normalized, err := catalog.NormalizeURL(e.Record.GetString("url"))
			if err != nil {
				return err
			}

			if err := cmgr.ProbeSource(context.Background(), normalized); err != nil {
				return err
			}

			e.Record.Set("url", normalized)
			if err := e.Next(); err != nil {
				return err
			}

			cmgr.Invalidate()
			return nil
		})
		app.OnRecordUpdate(catalog.SourcesCollection).BindFunc(func(e *core.RecordEvent) error {
			if err := e.Next(); err != nil {
				return err
			}

			cmgr.Invalidate()
			return nil
		})
		app.OnRecordDelete(catalog.SourcesCollection).BindFunc(func(e *core.RecordEvent) error {
			if err := e.Next(); err != nil {
				return err
			}

			cmgr.Invalidate()
			return nil
		})

		if cfg.DevMode {
			if err := static.MountViteProxy(se, cfg.ViteDevURL); err != nil {
				return err
			}
		} else {
			spa, err := fs.Sub(spaFS, "spa")
			if err != nil {
				return err
			}

			if err := static.Mount(se, spa); err != nil {
				return err
			}
		}

		ctx, cancel := context.WithCancel(context.Background())
		mgr.MigrateFlatVolumes(ctx)
		cleaner.ReconcileAtBoot(ctx)
		go cleaner.Start(ctx)
		mgr.StartImageStatusRefresher(ctx, 5*time.Minute)
		go waitForShutdown(cancel, logger)

		app.OnTerminate().BindFunc(func(te *core.TerminateEvent) error {
			drainCtx, drainCancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer drainCancel()
			logger.Info("draining spawned session containers")
			cleaner.DrainAll(drainCtx)
			smgr.StopAll()
			return te.Next()
		})

		logger.Info("wisp serving",
			"addr", cfg.HTTPAddr,
			"dataRoot", cfg.DataRoot,
			"dockerNet", cfg.DockerNetwork,
			"idleTimeout", cfg.IdleTimeout,
			"devMode", cfg.DevMode,
		)
		return se.Next()
	})

	// Default to `serve` when no subcommand was provided — most users just run the binary.
	ensureServeArgs(cfg.HTTPAddr)

	if err := app.Start(); err != nil {
		logger.Error("server exited with error", "err", err)
		os.Exit(1)
	}
}

func ensureServeArgs(httpAddr string) {
	// Three cases:
	//   1. no subcommand               → inject "serve --http=<addr>"
	//   2. subcommand "serve" no --http → inject --http=<addr> after it
	//   3. anything else (migrate, superuser, …) or --http already set → leave alone
	if len(os.Args) < 2 {
		os.Args = []string{os.Args[0], "serve", "--http=" + httpAddr}
		return
	}

	if os.Args[1] != "serve" {
		return
	}

	for _, a := range os.Args[2:] {
		if strings.HasPrefix(a, "--http") {
			return
		}
	}
	rest := append([]string{"--http=" + httpAddr}, os.Args[2:]...)
	os.Args = append([]string{os.Args[0], "serve"}, rest...)
}

func bootstrapSuperuser(app core.App, cfg config.Config, logger *slog.Logger) error {
	if cfg.SuperuserEmail == "" || cfg.SuperuserPassword == "" {
		return nil
	}

	col, err := app.FindCachedCollectionByNameOrId(core.CollectionNameSuperusers)
	if err != nil {
		return fmt.Errorf("fetch superusers collection: %w", err)
	}

	record, err := app.FindAuthRecordByEmail(col, cfg.SuperuserEmail)
	created := false
	if err != nil {
		record = core.NewRecord(col)
		created = true
	}

	record.SetEmail(cfg.SuperuserEmail)
	record.SetPassword(cfg.SuperuserPassword)

	if err := app.Save(record); err != nil {
		return fmt.Errorf("upsert superuser: %w", err)
	}

	if created {
		logger.Info("superuser created", "email", cfg.SuperuserEmail)
	} else {
		logger.Info("superuser refreshed", "email", cfg.SuperuserEmail)
	}

	return nil
}

func waitForShutdown(cancel context.CancelFunc, logger *slog.Logger) {
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, os.Interrupt, syscall.SIGTERM)
	<-sig
	logger.Info("shutdown signal received")
	cancel()
}
