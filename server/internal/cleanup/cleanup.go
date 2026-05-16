package cleanup

import (
	"context"
	"log/slog"
	"time"

	"github.com/KevinBonnoron/wisp/internal/config"
	"github.com/KevinBonnoron/wisp/internal/docker"
	"github.com/KevinBonnoron/wisp/internal/sessions"
)

type Runner struct {
	cfg    config.Config
	mgr    *sessions.Manager
	docker *docker.Client
	logger *slog.Logger
}

func New(cfg config.Config, mgr *sessions.Manager, dk *docker.Client, logger *slog.Logger) *Runner {
	return &Runner{cfg: cfg, mgr: mgr, docker: dk, logger: logger}
}

// ReconcileAtBoot kills every container tagged with our session label — they
// are orphans from a previous wisp process. PB records are flipped to stopped.
func (r *Runner) ReconcileAtBoot(ctx context.Context) {
	containers, err := r.docker.ListLauncherSessions(ctx)
	if err != nil {
		r.logger.Warn("boot reconcile: docker list failed", "err", err)
		return
	}

	for sid, containerID := range containers {
		r.logger.Info("boot reconcile: removing orphan container", "session", sid, "container", containerID)
		_ = r.docker.Stop(ctx, containerID, 5*time.Second)
		if rec, _ := r.mgr.LoadActive(sid); rec != nil {
			r.mgr.MarkStopped(rec)
		}
	}
}

// DrainAll stops every active session container synchronously.
func (r *Runner) DrainAll(ctx context.Context) {
	containers, err := r.docker.ListLauncherSessions(ctx)
	if err != nil {
		r.logger.Warn("drain: docker list failed", "err", err)
		return
	}

	for sid, containerID := range containers {
		r.logger.Info("drain: stopping session container", "session", sid, "container", containerID)
		_ = r.docker.Stop(ctx, containerID, 5*time.Second)
		if rec, _ := r.mgr.LoadActive(sid); rec != nil {
			r.mgr.MarkStopped(rec)
		}
	}
}

func (r *Runner) Start(ctx context.Context) {
	ticker := time.NewTicker(r.cfg.CleanupInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			r.logger.Info("cleanup loop exiting")
			return
		case <-ticker.C:
			r.tick(ctx)
		}
	}
}

func (r *Runner) tick(ctx context.Context) {
	// Flush buffered touches BEFORE the idle scan so freshly-touched sessions don't
	// look stale to the filter.
	r.mgr.Flush(ctx)

	idle, err := r.mgr.ListIdle()
	if err != nil {
		r.logger.Warn("cleanup: list idle failed", "err", err)
	} else {

		for _, rec := range idle {
			r.logger.Info("cleanup: stopping idle session", "session", rec.Id)
			if err := r.mgr.Stop(ctx, rec); err != nil {
				r.logger.Warn("cleanup: stop failed", "session", rec.Id, "err", err)
			}
		}
	}

	if r.cfg.SessionRetention > 0 {
		n, err := r.mgr.PurgeTerminal(r.cfg.SessionRetention)
		if err != nil {
			r.logger.Warn("cleanup: purge terminal failed", "err", err)
		} else if n > 0 {

			r.logger.Info("cleanup: purged terminal sessions", "count", n)
		}
	}
}
