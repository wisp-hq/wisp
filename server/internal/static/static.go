package static

import (
	"errors"
	"io/fs"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"

	"github.com/pocketbase/pocketbase/core"
)

// MountViteProxy reverse-proxies all unhandled paths to a running Vite dev server.
// httputil.ReverseProxy handles WebSocket upgrades natively, so Vite's HMR works
// without the bridging issues Vite's own /s/ proxy has with Selkies frames.
func MountViteProxy(se *core.ServeEvent, viteURL string) error {
	target, err := url.Parse(viteURL)
	if err != nil {
		return err
	}

	proxy := httputil.NewSingleHostReverseProxy(target)
	originalDirector := proxy.Director
	proxy.Director = func(r *http.Request) {
		originalDirector(r)
		r.Host = target.Host
	}

	se.Router.Any("/{path...}", func(e *core.RequestEvent) error {
		proxy.ServeHTTP(e.Response, e.Request)
		return nil
	})
	return nil
}

func Mount(se *core.ServeEvent, spa fs.FS) error {
	if spa == nil {
		mountNoSPA(se)
		return nil
	}

	if _, err := fs.Stat(spa, "index.html"); err != nil {
		mountNoSPA(se)
		return nil
	}

	fileServer := http.FileServer(http.FS(spa))
	// Any() instead of GET() so this catch-all's method scope matches /s/{sessionId}/{path...} —
	// Go's ServeMux refuses to coexist patterns where one is more specific in path and the
	// other in method.
	se.Router.Any("/{path...}", func(e *core.RequestEvent) error {
		p := strings.TrimPrefix(e.Request.URL.Path, "/")
		if p == "" {
			p = "index.html"
		}

		if _, err := fs.Stat(spa, p); errors.Is(err, fs.ErrNotExist) {
			e.Request.URL.Path = "/"
		}

		fileServer.ServeHTTP(e.Response, e.Request)
		return nil
	})
	return nil
}

func mountNoSPA(se *core.ServeEvent) {
	se.Router.Any("/{path...}", func(e *core.RequestEvent) error {
		path := e.Request.PathValue("path")
		if strings.HasPrefix(path, "api/") || strings.HasPrefix(path, "_/") || strings.HasPrefix(path, "s/") {
			return e.NotFoundError("not found", nil)
		}

		e.Response.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = e.Response.Write([]byte(noSPAHTML))
		return nil
	})
}

const noSPAHTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>wisp</title>
<style>body{font-family:system-ui;background:#0b0b0d;color:#eee;padding:2rem;max-width:48rem;margin:0 auto}code{background:#1a1a1f;padding:.15rem .35rem;border-radius:.3rem}</style>
</head><body>
<h1>wisp</h1>
<p>The SPA hasn't been embedded into this binary.</p>
<p>For development, run the Vite dev server alongside this Go server:</p>
<pre><code>cd client && bun run dev</code></pre>
<p>Then open <a href="http://localhost:5173">http://localhost:5173</a>.</p>
<p>For production, build the client with <code>bun run build</code> before <code>go build</code>.</p>
</body></html>`
