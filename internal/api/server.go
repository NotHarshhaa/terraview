package api

import (
	"context"
	"crypto/subtle"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"
)

// Server wires the HTTP layer to the poller and optionally serves the static
// Next.js export at the root path. It owns no state of its own beyond the
// poller pointer and its config; constructed once at boot, reused for the
// process lifetime.
type Server struct {
	poller    *Poller
	version   string
	auth      AuthConfig
	uiHandler http.Handler // optional, may be nil for headless mode
	logger    *log.Logger
}

// AuthConfig drives the optional HTTP basic auth wrapper. When Enabled is
// false (the default), every request passes through untouched.
type AuthConfig struct {
	Enabled  bool
	Username string
	Password string
}

// Config bundles the bits the API layer doesn't read from the engine.
type Config struct {
	Version   string
	Auth      AuthConfig
	UIHandler http.Handler
	Logger    *log.Logger
}

// NewServer constructs a configured Server. Routes are registered via Handler().
func NewServer(p *Poller, cfg Config) *Server {
	logger := cfg.Logger
	if logger == nil {
		logger = log.Default()
	}
	return &Server{
		poller:    p,
		version:   cfg.Version,
		auth:      cfg.Auth,
		uiHandler: cfg.UIHandler,
		logger:    logger,
	}
}

// Handler returns the configured http.Handler. The shape is:
//
//	GET  /api/health           -> liveness probe
//	GET  /api/summary          -> Summary only
//	GET  /api/resources        -> filtered resource list
//	GET  /api/snapshot         -> full Snapshot
//	GET  /api/status           -> compact status payload for CI comments
//	POST /api/refresh          -> force an out-of-band refresh
//	GET  /api/events           -> SSE stream of refresh events
//	GET  /                     -> static UI (if uiHandler is configured)
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("/api/health", s.handleHealth)
	mux.HandleFunc("/api/summary", s.handleSummary)
	mux.HandleFunc("/api/resources", s.handleResources)
	mux.HandleFunc("/api/snapshot", s.handleSnapshot)
	mux.HandleFunc("/api/status", s.handleStatus)
	mux.HandleFunc("/api/refresh", s.handleRefresh)
	mux.HandleFunc("/api/events", s.handleEvents)

	if s.uiHandler != nil {
		mux.Handle("/", s.uiHandler)
	} else {
		mux.HandleFunc("/", s.handleRoot)
	}

	// Order: log → CORS → auth → mux. Auth wraps last so /api/health stays
	// behind auth if it's enabled (that's intentional — operators who turn on
	// auth probably don't want unauthenticated health probes either).
	var h http.Handler = mux
	if s.auth.Enabled {
		h = s.basicAuth(h)
	}
	h = s.cors(h)
	h = s.logRequests(h)
	return h
}

// handleRoot is the friendly fallback when no UI bundle is mounted (e.g.
// during `go run` before the UI is built). It tells the user where the API
// is and where to find the UI in dev mode.
func (s *Server) handleRoot(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`<!doctype html>
<html><head><meta charset="utf-8"><title>Terraview</title>
<style>body{font-family:ui-monospace,Menlo,Consolas,monospace;background:#0b0f14;color:#cdd6f4;padding:48px;line-height:1.6}a{color:#89b4fa}</style>
</head><body>
<h1>Terraview API is running</h1>
<p>No UI bundle is mounted on this server.</p>
<ul>
  <li>Run the dev UI: <code>cd ui && npm run dev</code> and open <a href="http://localhost:3000">http://localhost:3000</a></li>
  <li>Or build the UI: <code>npm --prefix ui run build</code></li>
</ul>
<p>API endpoints: <code>/api/snapshot</code>, <code>/api/resources</code>, <code>/api/summary</code>, <code>/api/status</code>, <code>/api/events</code></p>
</body></html>`))
}

// cors permits the dev UI on :3000 to talk to the API on :7777. The
// production build is served from the same origin so no preflight runs.
func (s *Server) cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// basicAuth is a constant-time HTTP basic auth wrapper. The whole API is
// gated, not just the mutating endpoints, because everything Terraview
// surfaces is potentially sensitive (resource names, tags, IP ranges).
func (s *Server) basicAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user, pass, ok := r.BasicAuth()
		userMatches := subtle.ConstantTimeCompare([]byte(user), []byte(s.auth.Username)) == 1
		passMatches := subtle.ConstantTimeCompare([]byte(pass), []byte(s.auth.Password)) == 1
		if !ok || !userMatches || !passMatches {
			w.Header().Set("WWW-Authenticate", `Basic realm="terraview"`)
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// logRequests writes one line per request in a format that's easy to grep.
// We intentionally skip /api/events because it's long-lived and would
// produce a single line per minute on a busy stream.
func (s *Server) logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/events") {
			next.ServeHTTP(w, r)
			return
		}
		start := time.Now()
		sw := &statusWriter{ResponseWriter: w, status: 200}
		next.ServeHTTP(sw, r)
		s.logger.Printf("%s %s %d %s", r.Method, r.URL.Path, sw.status, time.Since(start).Round(time.Millisecond))
	})
}

// statusWriter captures the status code so the logger can include it.
type statusWriter struct {
	http.ResponseWriter
	status int
	wrote  bool
}

func (s *statusWriter) WriteHeader(code int) {
	if s.wrote {
		return
	}
	s.status = code
	s.wrote = true
	s.ResponseWriter.WriteHeader(code)
}
func (s *statusWriter) Write(b []byte) (int, error) {
	if !s.wrote {
		s.wrote = true
	}
	return s.ResponseWriter.Write(b)
}

// Flush forwards to the wrapped ResponseWriter so SSE keeps streaming.
func (s *statusWriter) Flush() {
	if f, ok := s.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

// ListenAndServe runs the HTTP server on addr (":7777") until ctx is
// cancelled. It shuts down gracefully on cancel.
func (s *Server) ListenAndServe(ctx context.Context, addr string) error {
	srv := &http.Server{
		Addr:              addr,
		Handler:           s.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
		WriteTimeout:      0, // SSE needs unbounded writes
		IdleTimeout:       60 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		s.logger.Printf("terraview listening on http://localhost%s", normaliseAddr(addr))
		err := srv.ListenAndServe()
		if !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
			return
		}
		errCh <- nil
	}()

	select {
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = srv.Shutdown(shutdownCtx)
		return nil
	case err := <-errCh:
		return err
	}
}

func normaliseAddr(addr string) string {
	if strings.HasPrefix(addr, ":") {
		return addr
	}
	return addr
}
