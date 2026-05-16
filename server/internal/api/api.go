package api

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"

	"github.com/KevinBonnoron/wisp/internal/catalog"
	"github.com/KevinBonnoron/wisp/internal/participants"
	"github.com/KevinBonnoron/wisp/internal/registry"
	"github.com/KevinBonnoron/wisp/internal/sessions"
	"github.com/KevinBonnoron/wisp/internal/shortcuts"
)

func Register(se *core.ServeEvent, mgr *sessions.Manager, pmgr *participants.Manager, preg *participants.Registry, rmgr *registry.Manager, cmgr *catalog.Manager, smgr *shortcuts.Manager) {
	auth := apis.RequireAuth("users")

	se.Router.GET("/api/catalog", catalogList(cmgr)).Bind(auth)
	se.Router.GET("/api/catalog/sources", catalogSources(cmgr)).Bind(auth)

	se.Router.POST("/api/sessions", createSession(mgr, smgr)).Bind(auth)
	se.Router.GET("/api/sessions/active", listActive(mgr)).Bind(auth)
	// preg is unused here — the OnRecordUpdate hook fires on each pmgr.Revoke /
	// UpdateRole save and calls preg.Disconnect itself, so API handlers don't
	// need to kick connections explicitly.
	_ = preg
	se.Router.POST("/api/sessions/{id}/stop", stopSession(mgr, pmgr)).Bind(auth)
	// SSE: auth via ?token=<pb-jwt> query param because EventSource can't send headers.
	se.Router.GET("/api/sessions/{id}/progress", sseProgress(mgr))
	se.Router.GET("/api/sessions/{id}/logs", sseLogs(mgr))

	se.Router.GET("/api/sessions/{id}/participants", listParticipants(mgr, pmgr)).Bind(auth)
	se.Router.DELETE("/api/sessions/{id}/participants/{participantId}", revokeParticipant(mgr, pmgr)).Bind(auth)

	se.Router.GET("/api/sessions/{id}/invite", getInvite(mgr)).Bind(auth)
	se.Router.POST("/api/sessions/{id}/invite/rotate", rotateInvite(mgr)).Bind(auth)

	se.Router.GET("/api/invites/{token}", lookupInvite(mgr))
	se.Router.POST("/api/participants/claim", claimParticipant(mgr, pmgr))
	se.Router.POST("/api/participants/leave", leaveSession(pmgr))

	se.Router.POST("/api/apps/{id}/update", triggerAppUpdate(mgr)).Bind(auth)
	se.Router.GET("/api/apps/{id}/progress", sseAppProgress(mgr))

	se.Router.GET("/api/registry/search", registrySearch(rmgr)).Bind(auth)
	se.Router.GET("/api/registry/tags", registryTags(rmgr)).Bind(auth)
}

func catalogList(cmgr *catalog.Manager) func(*core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		apps, err := cmgr.List(e.Request.Context())
		if err != nil {
			return e.InternalServerError("catalog list failed", err)
		}

		return e.JSON(http.StatusOK, apps)
	}
}

func catalogSources(cmgr *catalog.Manager) func(*core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		sources, err := cmgr.ListSources(e.Request.Context())
		if err != nil {
			return e.InternalServerError("catalog sources failed", err)
		}

		return e.JSON(http.StatusOK, sources)
	}
}

func registrySearch(rmgr *registry.Manager) func(*core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		q := strings.TrimSpace(e.Request.URL.Query().Get("q"))
		limit, _ := strconv.Atoi(e.Request.URL.Query().Get("limit"))
		results, err := rmgr.Search(e.Request.Context(), q, limit)
		if err != nil {
			return e.InternalServerError("registry search failed", err)
		}

		return e.JSON(http.StatusOK, results)
	}
}

func registryTags(rmgr *registry.Manager) func(*core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		image := strings.TrimSpace(e.Request.URL.Query().Get("image"))
		if image == "" {
			return e.BadRequestError("image is required", nil)
		}

		filter := strings.TrimSpace(e.Request.URL.Query().Get("q"))
		limit, _ := strconv.Atoi(e.Request.URL.Query().Get("limit"))
		results, err := rmgr.Tags(e.Request.Context(), image, filter, limit)
		if err != nil {
			if err == registry.ErrUnsupportedHost {
				return e.BadRequestError("unsupported registry host", nil)
			}

			return e.InternalServerError("registry tags failed", err)
		}

		return e.JSON(http.StatusOK, results)
	}
}

type createSessionRequest struct {
	AppID      string `json:"appId"`
	ShortcutID string `json:"shortcutId"`
}

type sessionResponse struct {
	ID     string `json:"id"`
	Status string `json:"status"`
	URL    string `json:"url"`
	App    string `json:"app"`
}

func createSession(mgr *sessions.Manager, smgr *shortcuts.Manager) func(*core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		var body createSessionRequest
		if err := e.BindBody(&body); err != nil {
			return e.BadRequestError("invalid payload", err)
		}

		if e.Auth == nil {
			return e.UnauthorizedError("authentication required", nil)
		}

		appID := body.AppID
		var extraEnv map[string]string

		if body.ShortcutID != "" {
			shortcut, err := smgr.LoadShortcut(body.ShortcutID, e.Auth.Id)
			if err != nil {
				return e.NotFoundError("shortcut not found", nil)
			}

			appID = shortcut.GetString("app")
			if raw := shortcut.GetString("launchParams"); raw != "" {
				_ = json.Unmarshal([]byte(raw), &extraEnv)
			}
		}

		if appID == "" {
			return e.BadRequestError("appId or shortcutId is required", nil)
		}

		rec, err := mgr.Create(e.Request.Context(), e.Auth, appID, extraEnv)
		if err != nil {
			if err == sessions.ErrNotInstalled {
				return e.ForbiddenError("app not installed", nil)
			}

			return e.InternalServerError("create session failed", err)
		}

		return e.JSON(http.StatusOK, sessionResponse{
			ID:     rec.Id,
			Status: rec.GetString("status"),
			URL:    "/s/" + rec.Id + "/",
			App:    rec.GetString("app"),
		})
	}
}

func listActive(mgr *sessions.Manager) func(*core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return e.UnauthorizedError("authentication required", nil)
		}

		records, err := mgr.ListActiveForUser(e.Auth.Id)
		if err != nil {
			return e.InternalServerError("lookup failed", err)
		}

		out := make([]sessionResponse, 0, len(records))
		for _, rec := range records {
			out = append(out, sessionResponse{
				ID:     rec.Id,
				Status: rec.GetString("status"),
				URL:    "/s/" + rec.Id + "/",
				App:    rec.GetString("app"),
			})
		}
		return e.JSON(http.StatusOK, out)
	}
}

func stopSession(mgr *sessions.Manager, pmgr *participants.Manager) func(*core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return e.UnauthorizedError("authentication required", nil)
		}

		id := e.Request.PathValue("id")
		rec, err := mgr.LoadActive(id)
		if err != nil {
			return e.InternalServerError("lookup failed", err)
		}

		if rec == nil {
			return e.NotFoundError("session not found", nil)
		}

		if rec.GetString("user") != e.Auth.Id {
			return e.ForbiddenError("not your session", nil)
		}

		_ = pmgr.RevokeAllForSession(rec.Id)
		if err := mgr.Stop(e.Request.Context(), rec); err != nil {
			return e.InternalServerError("stop failed", err)
		}

		return e.JSON(http.StatusOK, map[string]any{"ok": true})
	}
}

type participantResponse struct {
	ID          string `json:"id"`
	Role        string `json:"role"`
	DisplayName string `json:"displayName"`
	User        string `json:"user"`
	Slot        int    `json:"slot"`
	LastSeenAt  string `json:"lastSeenAt"`
	Created     string `json:"created"`
}

func toParticipantResponse(rec *core.Record) participantResponse {
	return participantResponse{
		ID:          rec.Id,
		Role:        rec.GetString("role"),
		DisplayName: rec.GetString("displayName"),
		User:        rec.GetString("user"),
		Slot:        rec.GetInt("slot"),
		LastSeenAt:  rec.GetString("lastSeenAt"),
		Created:     rec.GetString("created"),
	}
}

type inviteResponse struct {
	Token string `json:"token"`
	Path  string `json:"path"`
}

func ownedSession(e *core.RequestEvent, mgr *sessions.Manager) (*core.Record, error) {
	id := e.Request.PathValue("id")
	rec, err := mgr.LoadActive(id)
	if err != nil {
		return nil, e.InternalServerError("lookup failed", err)
	}

	if rec == nil {
		return nil, e.NotFoundError("session not found", nil)
	}

	if rec.GetString("user") != e.Auth.Id {
		return nil, e.ForbiddenError("not your session", nil)
	}

	return rec, nil
}

func listParticipants(mgr *sessions.Manager, pmgr *participants.Manager) func(*core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return e.UnauthorizedError("authentication required", nil)
		}

		sess, err := ownedSession(e, mgr)
		if err != nil {
			return err
		}

		recs, lerr := pmgr.ListActiveForSession(sess.Id)
		if lerr != nil {
			return e.InternalServerError("list failed", lerr)
		}

		out := make([]participantResponse, 0, len(recs))
		for _, rec := range recs {
			out = append(out, toParticipantResponse(rec))
		}
		return e.JSON(http.StatusOK, out)
	}
}

func revokeParticipant(mgr *sessions.Manager, pmgr *participants.Manager) func(*core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return e.UnauthorizedError("authentication required", nil)
		}

		sess, err := ownedSession(e, mgr)
		if err != nil {
			return err
		}

		pid := e.Request.PathValue("participantId")
		rec, gerr := pmgr.Get(pid)
		if gerr != nil {
			return e.NotFoundError("participant not found", nil)
		}

		if rec.GetString("session") != sess.Id {
			return e.NotFoundError("participant not found", nil)
		}

		if err := pmgr.Revoke(pid); err != nil {
			return e.InternalServerError("revoke failed", err)
		}

		return e.JSON(http.StatusOK, map[string]any{"ok": true})
	}
}

func getInvite(mgr *sessions.Manager) func(*core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return e.UnauthorizedError("authentication required", nil)
		}

		sess, err := ownedSession(e, mgr)
		if err != nil {
			return err
		}

		tok, terr := mgr.EnsureInviteToken(sess)
		if terr != nil {
			return e.InternalServerError("ensure invite failed", terr)
		}

		return e.JSON(http.StatusOK, inviteResponse{Token: tok, Path: "/join/" + tok})
	}
}

func rotateInvite(mgr *sessions.Manager) func(*core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return e.UnauthorizedError("authentication required", nil)
		}

		sess, err := ownedSession(e, mgr)
		if err != nil {
			return err
		}

		tok, terr := mgr.RotateInviteToken(sess)
		if terr != nil {
			return e.InternalServerError("rotate failed", terr)
		}

		return e.JSON(http.StatusOK, inviteResponse{Token: tok, Path: "/join/" + tok})
	}
}

type inviteLookupResponse struct {
	SessionID string `json:"sessionId"`
	App       string `json:"app"`
}

func lookupInvite(mgr *sessions.Manager) func(*core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		token := e.Request.PathValue("token")
		sess, err := mgr.LookupByInviteToken(token)
		if err != nil {
			return e.InternalServerError("lookup failed", err)
		}

		if sess == nil {
			return e.NotFoundError("invite not found", nil)
		}

		return e.JSON(http.StatusOK, inviteLookupResponse{
			SessionID: sess.Id,
			App:       sess.GetString("app"),
		})
	}
}

const participantCookieName = "wisp_participant"

type claimRequest struct {
	InviteToken string `json:"inviteToken"`
	DisplayName string `json:"displayName"`
}

type claimResponse struct {
	SessionID       string `json:"sessionId"`
	ParticipantToken string `json:"participantToken"`
}

func claimParticipant(mgr *sessions.Manager, pmgr *participants.Manager) func(*core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		var body claimRequest
		if err := e.BindBody(&body); err != nil {
			return e.BadRequestError("invalid payload", err)
		}

		displayName := strings.TrimSpace(body.DisplayName)
		if displayName == "" {
			return e.BadRequestError("displayName required", nil)
		}

		if len(displayName) > 64 {
			displayName = displayName[:64]
		}

		sess, lerr := mgr.LookupByInviteToken(body.InviteToken)
		if lerr != nil {
			return e.InternalServerError("lookup failed", lerr)
		}

		if sess == nil {
			return e.NotFoundError("invite not found", nil)
		}

		// Everyone joins as viewer. The host promotes via PB API after the
		// participant has connected — the proxy enforces role from the cookie
		// on every request, and the hash setter follows on next refresh.
		rec, cerr := pmgr.Create(sess.Id, sess.GetString("user"), participants.RoleViewer, displayName)
		if cerr != nil {
			return e.InternalServerError("create participant failed", cerr)
		}

		token := rec.GetString("token")

		// Path-scoped to /s/<sessionId> so the cookie never leaks to other
		// sessions in the same browser and the owner of *this* session never
		// has a stale participant cookie downgrading them.
		http.SetCookie(e.Response, &http.Cookie{
			Name:     participantCookieName,
			Value:    token,
			Path:     "/s/" + sess.Id,
			HttpOnly: true,
			SameSite: http.SameSiteLaxMode,
			Secure:   e.Request.TLS != nil,
		})

		// Returned to the client so it can call /api/participants/leave with
		// the token (the path-scoped cookie isn't sent to /api/).
		return e.JSON(http.StatusOK, claimResponse{
			SessionID:        sess.Id,
			ParticipantToken: token,
		})
	}
}

type leaveRequest struct {
	ParticipantToken string `json:"participantToken"`
}

func leaveSession(pmgr *participants.Manager) func(*core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		// The participant cookie is path-scoped to /s/<sessionId> and therefore
		// not sent to /api/, so the client passes the token in the body.
		var body leaveRequest
		_ = e.BindBody(&body)

		if body.ParticipantToken != "" {
			if rec, lerr := pmgr.LookupByToken(body.ParticipantToken); lerr == nil {
				_ = pmgr.ReleaseSlot(rec.Id)
			}
		}

		return e.JSON(http.StatusOK, map[string]any{"ok": true})
	}
}

func triggerAppUpdate(mgr *sessions.Manager) func(*core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return e.UnauthorizedError("authentication required", nil)
		}

		if e.Auth.GetString("role") != "admin" {
			return e.ForbiddenError("admin role required", nil)
		}

		id := e.Request.PathValue("id")
		rec, err := mgr.LoadApp(id)
		if err != nil || rec == nil {
			return e.NotFoundError("app not found", nil)
		}

		mgr.UpdateApp(rec)
		return e.JSON(http.StatusAccepted, map[string]any{"ok": true})
	}
}

func sseAppProgress(mgr *sessions.Manager) func(*core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		token := e.Request.URL.Query().Get("token")
		authRec, err := e.App.FindAuthRecordByToken(token, core.TokenTypeAuth)
		if err != nil || authRec == nil {
			return e.UnauthorizedError("invalid token", nil)
		}

		appID := e.Request.PathValue("id")
		rec, err := mgr.LoadApp(appID)
		if err != nil || rec == nil {
			return e.NotFoundError("app not found", nil)
		}

		flusher, ok := e.Response.(http.Flusher)
		if !ok {
			return e.InternalServerError("streaming not supported", nil)
		}

		e.Response.Header().Set("Content-Type", "text/event-stream")
		e.Response.Header().Set("Cache-Control", "no-cache")
		e.Response.Header().Set("X-Accel-Buffering", "no")
		e.Response.WriteHeader(http.StatusOK)
		flusher.Flush()

		ch, unsubscribe := mgr.Progress().Subscribe(sessions.AppProgressPrefix + appID)
		defer unsubscribe()

		ctx := e.Request.Context()
		for {
			select {
			case <-ctx.Done():
				return nil
			case percent, open := <-ch:
				if !open {
					return nil
				}

				if _, err := fmt.Fprintf(e.Response, "data: %d\n\n", percent); err != nil {
					return nil
				}

				flusher.Flush()
			}
		}
	}
}

func sseLogs(mgr *sessions.Manager) func(*core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		token := e.Request.URL.Query().Get("token")
		authRec, err := e.App.FindAuthRecordByToken(token, core.TokenTypeAuth)
		if err != nil || authRec == nil {
			return e.UnauthorizedError("invalid token", nil)
		}

		sessionID := e.Request.PathValue("id")
		rec, err := mgr.LoadActive(sessionID)
		if err != nil || rec == nil {
			return e.NotFoundError("session not found", nil)
		}

		if rec.GetString("user") != authRec.Id {
			return e.ForbiddenError("not your session", nil)
		}

		flusher, ok := e.Response.(http.Flusher)
		if !ok {
			return e.InternalServerError("streaming not supported", nil)
		}

		tail := 200
		if t, err := strconv.Atoi(e.Request.URL.Query().Get("tail")); err == nil && t > 0 && t <= 2000 {
			tail = t
		}

		stream, err := mgr.StreamContainerLogs(e.Request.Context(), rec, tail)
		if err != nil {
			return e.InternalServerError("logs unavailable", err)
		}
		defer stream.Close()

		e.Response.Header().Set("Content-Type", "text/event-stream")
		e.Response.Header().Set("Cache-Control", "no-cache")
		e.Response.Header().Set("X-Accel-Buffering", "no")
		e.Response.WriteHeader(http.StatusOK)
		flusher.Flush()

		scanner := bufio.NewScanner(stream)
		// Logs lines from desktops (browser URLs, stack traces) can exceed bufio's
		// 64KB default. Bump the limit before scanning to avoid silent truncation.
		scanner.Buffer(make([]byte, 64*1024), 1024*1024)
		for scanner.Scan() {
			if _, err := fmt.Fprintf(e.Response, "data: %s\n\n", scanner.Text()); err != nil {
				return nil
			}

			flusher.Flush()
		}

		return nil
	}
}

func sseProgress(mgr *sessions.Manager) func(*core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		token := e.Request.URL.Query().Get("token")
		authRec, err := e.App.FindAuthRecordByToken(token, core.TokenTypeAuth)
		if err != nil || authRec == nil {
			return e.UnauthorizedError("invalid token", nil)
		}

		sessionID := e.Request.PathValue("id")
		rec, err := mgr.LoadActive(sessionID)
		if err != nil || rec == nil {
			return e.NotFoundError("session not found", nil)
		}

		if rec.GetString("user") != authRec.Id {
			return e.ForbiddenError("not your session", nil)
		}

		flusher, ok := e.Response.(http.Flusher)
		if !ok {
			return e.InternalServerError("streaming not supported", nil)
		}

		e.Response.Header().Set("Content-Type", "text/event-stream")
		e.Response.Header().Set("Cache-Control", "no-cache")
		e.Response.Header().Set("X-Accel-Buffering", "no") // disable reverse-proxy buffering
		e.Response.WriteHeader(http.StatusOK)
		flusher.Flush()

		ch, unsubscribe := mgr.Progress().Subscribe(sessionID)
		defer unsubscribe()

		ctx := e.Request.Context()
		for {
			select {
			case <-ctx.Done():
				return nil
			case percent, open := <-ch:
				if !open {
					return nil
				}

				if _, err := fmt.Fprintf(e.Response, "data: %d\n\n", percent); err != nil {
					return nil
				}

				flusher.Flush()
			}
		}
	}
}
