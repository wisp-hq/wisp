package proxy

import (
	"bytes"
	"context"
	_ "embed"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httputil"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/core"

	"github.com/KevinBonnoron/wisp/internal/participants"
	"github.com/KevinBonnoron/wisp/internal/sessions"
)

//go:embed inject.js
var injectJS []byte

// Path the injected <script src> points at, also the path served by InjectScriptHandler.
const InjectScriptPath = "/wisp-inject.js"

// Strips Selkies' bundled manifest <link>. The session URL is ephemeral, so we
// don't want the browser to offer "Install as PWA" — a home-screen shortcut
// pointing at a session id that no longer exists would just 404 on launch.
var manifestLinkRe = regexp.MustCompile(`(?i)<link[^>]*\brel\s*=\s*["']?manifest["']?[^>]*>`)

const participantCookieName = "wisp_participant"

// While a proxied WebSocket is open, refresh Touch() on this interval so the
// idle sweep doesn't reap an actively-streaming session. Selkies pipes video +
// input over a single WS that holds open for the whole session, so the initial
// upgrade is the only HTTP request that would otherwise reach the proxy.
const wsTouchInterval = time.Minute

// Fallback page when someone hits /s/<id>/ before the launcher has flipped the session
// to ready (typically a deep-link or refresh during boot). The SPA's launching overlay
// is the primary UX; this only kicks in when the SPA is bypassed.
const waitingHTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>Starting…</title>
<meta http-equiv="refresh" content="2">
<style>body{font-family:system-ui;background:#0b0b0d;color:#eee;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}div{text-align:center}h1{font-weight:600;font-size:1.4rem}p{opacity:.6}</style>
</head><body><div><h1>Starting your session…</h1><p>This usually takes a few seconds.</p></div></body></html>`

// Selkies' React dashboard mounts before serverSettings arrives over WebSocket,
// so it flashes the sidebar for a frame even when SELKIES_UI_SHOW_SIDEBAR=False.
// Injected into <head> so it applies on first paint.
const sidebarHideCSS = `<style>.dashboard-overlay-container,.toggle-handle,.sidebar{display:none!important}</style>`

// Injected into every text/html response we proxy through. Pulls inject.js
// (mounts the HUD iframe, relays messages, remaps input, bounces to /
// on WebSocket disconnect). Served by InjectScriptHandler at InjectScriptPath.
var injectScriptTag = []byte(`<script src="` + InjectScriptPath + `"></script>`)

// InjectScriptHandler serves inject.js, the bundle referenced by the
// <script src> tag injected into every proxied Selkies page.
func InjectScriptHandler() func(*core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		e.Response.Header().Set("Content-Type", "application/javascript; charset=utf-8")
		// Re-validate every load so dev edits and prod redeploys ship immediately.
		// The file is ~15 KB embedded; we'd need a content hash in the URL to safely
		// long-cache it, which isn't worth the indirection.
		e.Response.Header().Set("Cache-Control", "no-cache")
		_, _ = e.Response.Write(injectJS)
		return nil
	}
}

// Handler must be bound to a path declaring {sessionId} and {path...} captures.
func Handler(mgr *sessions.Manager, pmgr *participants.Manager, preg *participants.Registry) func(*core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		sessionID := e.Request.PathValue("sessionId")
		if sessionID == "" {
			http.Redirect(e.Response, e.Request, "/", http.StatusFound)
			return nil
		}

		// Selkies' bundle hardcodes `fetch("manifest.json")` to set the tab title.
		// We strip <link rel="manifest"> from the HTML so the browser won't offer
		// "Install as PWA" (the URL is ephemeral), but we still answer the fetch
		// with a minimal JSON so the title can be set and the console stays clean.
		if isManifestRequest(e.Request.URL.Path) {
			serveManifest(e, mgr, sessionID)
			return nil
		}

		rec, err := mgr.LoadActive(sessionID)
		if err != nil {
			return e.InternalServerError("load session", err)
		}

		if rec == nil {
			http.Redirect(e.Response, e.Request, "/", http.StatusFound)
			return nil
		}

		if rec.GetString("status") == "starting" {
			e.Response.Header().Set("Content-Type", "text/html; charset=utf-8")
			e.Response.WriteHeader(http.StatusServiceUnavailable)
			_, _ = e.Response.Write([]byte(waitingHTML))
			return nil
		}

		target, err := mgr.ProxyTarget(rec)
		if err != nil {
			return e.InternalServerError("resolve upstream", err)
		}

		pctx := resolveParticipantContext(e.Request, pmgr, sessionID)
		if pctx.stale || pctx.kicked {
			// Clear on both the new session-scoped path and the legacy global
			// path so a residual cookie from before path-scoping is also dropped.
			for _, p := range []string{"/s/" + sessionID, "/"} {
				http.SetCookie(e.Response, &http.Cookie{
					Name:     participantCookieName,
					Value:    "",
					Path:     p,
					MaxAge:   -1,
					HttpOnly: true,
					SameSite: http.SameSiteLaxMode,
				})
			}
		}

		if pctx.kicked {
			http.Redirect(e.Response, e.Request, "/", http.StatusFound)
			return nil
		}

		mgr.Touch(sessionID)
		if pctx.participantID != "" {
			_ = pmgr.Touch(pctx.participantID)
		}

		// Strip any client-supplied role/slot before forwarding upstream — Selkies
		// builds those from the URL hash, which is user-controlled. Authoritative
		// values come from the cookie-bound participant record (or are absent for
		// owner/direct access, granting controller).
		enforceUpstreamQuery(e.Request, pctx)

		if isWebSocketUpgrade(e.Request) {
			// Wrap the request in a cancelable context so the host can kick
			// this connection via preg.Disconnect (called from the PB hook on
			// revoke / role / slot changes). httputil.ReverseProxy honors the
			// request context — cancelling closes the proxied WS cleanly.
			ctx, cancel := context.WithCancel(e.Request.Context())
			defer cancel()
			e.Request = e.Request.WithContext(ctx)

			untrack := preg.Track(pctx.participantID, cancel)
			defer untrack()

			stop := make(chan struct{})
			go keepTouching(mgr, pmgr, sessionID, pctx.participantID, stop)
			defer close(stop)
		}

		newReverseProxy(target, pctx).ServeHTTP(e.Response, e.Request)
		return nil
	}
}

// participantContext carries the wisp-authoritative role and slot for a request,
// resolved once per request from the wisp_participant cookie. An empty role
// means "no participant cookie" — i.e. the session owner, which Selkies treats
// as primary controller (no shared-mode query params, no fragment forced).
//   - stale=true: cookie unusable (unknown token / wrong session). Cleared on
//     response, otherwise treated as no cookie so the session owner isn't
//     silently downgraded by a leftover dev cookie.
//   - kicked=true: cookie pointed at a revoked participant. Cleared + the
//     handler short-circuits to a home redirect instead of proxying.
type participantContext struct {
	participantID string
	role          participants.Role
	slot          int
	stale         bool
	kicked        bool
}

func resolveParticipantContext(r *http.Request, pmgr *participants.Manager, sessionID string) participantContext {
	c, err := r.Cookie(participantCookieName)
	if err != nil || c.Value == "" {
		return participantContext{}
	}

	rec, lerr := pmgr.LookupByToken(c.Value)
	if lerr != nil {
		if lerr == participants.ErrRevoked || lerr == participants.ErrExpired {
			return participantContext{kicked: true}
		}
		// Unknown token (session deleted, manually-crafted cookie, etc.):
		// clear and treat as no cookie so a dev-leftover doesn't silently
		// downgrade the session owner to viewer.
		return participantContext{stale: true}
	}

	if rec.GetString("session") != sessionID {
		// Cookie belongs to a different session — same as stale.
		return participantContext{stale: true}
	}

	return participantContext{
		participantID: rec.Id,
		role:          participants.Role(rec.GetString("role")),
		slot:          rec.GetInt("slot"),
	}
}

// enforceUpstreamQuery normalizes ?role / ?slot on the request so Selkies gets
// the wisp-validated values, regardless of what the client tried to send.
func enforceUpstreamQuery(r *http.Request, pctx participantContext) {
	q := r.URL.Query()
	q.Del("role")
	q.Del("slot")

	switch pctx.role {
	case "":
		// Owner (no cookie) — Selkies default = primary controller.
	case participants.RolePlayer:
		q.Set("role", "viewer")
		if pctx.slot >= participants.MinPlayerSlot && pctx.slot <= participants.MaxPlayerSlot {
			q.Set("slot", strconv.Itoa(pctx.slot))
		}
	default:
		q.Set("role", "viewer")
	}

	r.URL.RawQuery = q.Encode()
}

func isWebSocketUpgrade(r *http.Request) bool {
	if !strings.EqualFold(r.Header.Get("Upgrade"), "websocket") {
		return false
	}

	for _, v := range r.Header.Values("Connection") {
		for tok := range strings.SplitSeq(v, ",") {
			if strings.EqualFold(strings.TrimSpace(tok), "upgrade") {
				return true
			}
		}
	}
	return false
}

func keepTouching(mgr *sessions.Manager, pmgr *participants.Manager, sessionID, participantID string, stop <-chan struct{}) {
	t := time.NewTicker(wsTouchInterval)
	defer t.Stop()
	for {
		select {
		case <-stop:
			return
		case <-t.C:
			mgr.Touch(sessionID)
			if participantID != "" {
				_ = pmgr.Touch(participantID)
			}
		}
	}
}

func isManifestRequest(path string) bool {
	base := path
	if i := strings.LastIndex(path, "/"); i >= 0 {
		base = path[i+1:]
	}

	return base == "manifest.json" || base == "manifest.webmanifest" || base == "site.webmanifest"
}

func serveManifest(e *core.RequestEvent, mgr *sessions.Manager, sessionID string) {
	name := "wisp"
	if rec, _ := mgr.LoadActive(sessionID); rec != nil {
		if appID := rec.GetString("app"); appID != "" {
			if app, err := e.App.FindRecordById("apps", appID); err == nil {
				if n := app.GetString("name"); n != "" {
					name = n
				}
			}
		}
	}

	body, _ := json.Marshal(map[string]string{"name": name})
	e.Response.Header().Set("Content-Type", "application/json; charset=utf-8")
	_, _ = e.Response.Write(body)
}

func newReverseProxy(target *url.URL, pctx participantContext) *httputil.ReverseProxy {
	rp := httputil.NewSingleHostReverseProxy(target)
	// httputil.ReverseProxy handles WebSocket upgrades natively since Go 1.12.
	originalDirector := rp.Director
	rp.Director = func(r *http.Request) {
		originalDirector(r)
		r.Host = target.Host
		// Force uncompressed responses so ModifyResponse can inject into HTML
		// without having to decode gzip/br.
		r.Header.Del("Accept-Encoding")
	}
	rp.ModifyResponse = injectHTMLAddons(pctx)
	return rp
}

func injectHTMLAddons(pctx participantContext) func(*http.Response) error {
	return func(resp *http.Response) error {
		if !strings.HasPrefix(resp.Header.Get("Content-Type"), "text/html") {
			return nil
		}

		if enc := resp.Header.Get("Content-Encoding"); enc != "" && enc != "identity" {
			return nil
		}

		body, err := io.ReadAll(resp.Body)
		if err != nil {
			return err
		}

		_ = resp.Body.Close()
		out := manifestLinkRe.ReplaceAll(body, nil)
		// Role-driven hash setter must run BEFORE the Selkies bundle reads
		// window.location.hash, so it lands right after the opening <head>.
		out = injectAfter(out, []byte("<head>"), roleHashSetterScript(pctx))
		out = injectBefore(out, []byte("</head>"), []byte(sidebarHideCSS))
		out = injectBefore(out, []byte("</head>"), injectScriptTag)
		resp.Body = io.NopCloser(bytes.NewReader(out))
		resp.ContentLength = int64(len(out))
		resp.Header.Set("Content-Length", strconv.Itoa(len(out)))
		return nil
	}
}

// roleHashSetterScript builds an inline <script> that rewrites window.location.hash
// to match the wisp-validated role before Selkies' bundle reads it. The hash is
// purely a UX hint at this point — the WebSocket query is already enforced by
// the proxy — but mismatched UI state (e.g. viewer with controller overlay)
// would be confusing.
func roleHashSetterScript(pctx participantContext) []byte {
	hash := ""
	switch pctx.role {
	case participants.RolePlayer:
		if pctx.slot >= participants.MinPlayerSlot && pctx.slot <= participants.MaxPlayerSlot {
			hash = "#player" + strconv.Itoa(pctx.slot)
		} else {
			hash = "#shared"
		}
	case participants.RoleViewer:
		hash = "#shared"
	}

	// Owner (empty role) keeps whatever hash the user navigated with — allows
	// #display2 for the legitimate second-screen flow. All other roles are forced.
	payload, _ := json.Marshal(map[string]any{
		"role": string(pctx.role),
		"slot": pctx.slot,
		"hash": hash,
	})

	return []byte(`<script>(function(){var w=` + string(payload) + `;window.__wisp=w;` +
		`if(w.hash&&window.location.hash!==w.hash){history.replaceState(null,'',window.location.pathname+window.location.search+w.hash);}` +
		`})();</script>`)
}

func injectBefore(html, marker, snippet []byte) []byte {
	idx := bytes.LastIndex(bytes.ToLower(html), marker)
	if idx < 0 {
		return append(html, snippet...)
	}

	out := make([]byte, 0, len(html)+len(snippet))
	out = append(out, html[:idx]...)
	out = append(out, snippet...)
	out = append(out, html[idx:]...)
	return out
}

func injectAfter(html, marker, snippet []byte) []byte {
	idx := bytes.Index(bytes.ToLower(html), bytes.ToLower(marker))
	if idx < 0 {
		out := make([]byte, 0, len(html)+len(snippet))
		out = append(out, snippet...)
		out = append(out, html...)
		return out
	}

	insertAt := idx + len(marker)
	out := make([]byte, 0, len(html)+len(snippet))
	out = append(out, html[:insertAt]...)
	out = append(out, snippet...)
	out = append(out, html[insertAt:]...)
	return out
}
