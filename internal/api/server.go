package api

import (
	"context"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/NotHarshhaa/terraview/internal/models"
)

// Server wires the HTTP layer to the poller and optionally serves the static
// Next.js export at the root path. It owns no state of its own beyond the
// poller pointer and its config; constructed once at boot, reused for the
// process lifetime.
type Server struct {
	poller    *Poller
	version   string
	auth      AuthConfig
	ui        UIConfig
	sessions  *sessionStore
	uiHandler http.Handler // optional, may be nil for headless mode
	logger    *log.Logger
}

// AuthConfig drives the optional HTTP auth wrapper. When Enabled is false
// (the default), every request passes through untouched.
type AuthConfig struct {
	Enabled     bool
	Username    string
	Password    string
	AccessToken string // static token for Bearer / ?access_token= (SSE-friendly)
}

// UIConfig is forwarded to the dashboard via snapshot.ui.
type UIConfig struct {
	Title          string
	ShowCostColumn bool
	DefaultFilter  string
}

// Config bundles the bits the API layer doesn't read from the engine.
type Config struct {
	Version   string
	Auth      AuthConfig
	UI        UIConfig
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
		ui:        cfg.UI,
		sessions:  newSessionStore(),
		uiHandler: cfg.UIHandler,
		logger:    logger,
	}
}

// Handler returns the configured http.Handler. The shape is:
//
//	GET  /api/health           -> liveness probe
//	GET  /api/summary          -> Summary only
//	GET  /api/resources        -> filtered resource list
//	GET  /api/resource         -> single resource by address
//	GET  /api/facets           -> filter facet counts
//	GET  /api/snapshot         -> full Snapshot
//	GET  /api/workspaces       -> list Terraform workspaces
//	POST /api/workspace        -> switch active workspace
//	GET  /api/graph            -> dependency graph for active workspace
//	GET  /api/history          -> state version history for active workspace
//	GET  /api/resource/history -> lifecycle timeline for one resource
//	GET  /api/drift/alerts     -> drift alerts from refresh-only scan
//	GET  /api/status           -> compact status payload for CI comments
//	POST /api/refresh          -> force an out-of-band refresh
//	POST /api/login           -> exchange credentials for session token
//	GET  /api/events           -> SSE stream of refresh events
//	GET  /                     -> static UI (if uiHandler is configured)
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("/api/health", s.handleHealth)
	mux.HandleFunc("/api/summary", s.handleSummary)
	mux.HandleFunc("/api/resources", s.handleResources)
	mux.HandleFunc("/api/resource", s.handleResource)
	mux.HandleFunc("/api/facets", s.handleFacets)
	mux.HandleFunc("/api/snapshot", s.handleSnapshot)
	mux.HandleFunc("/api/workspaces", s.handleWorkspaces)
	mux.HandleFunc("/api/workspace", s.handleWorkspace)
	mux.HandleFunc("/api/graph", s.handleGraph)
	mux.HandleFunc("/api/history", s.handleHistory)
	mux.HandleFunc("/api/resource/history", s.handleResourceHistory)
	mux.HandleFunc("/api/drift/alerts", s.handleDriftAlerts)
	mux.HandleFunc("/api/status", s.handleStatus)
	mux.HandleFunc("/api/refresh", s.handleRefresh)
	mux.HandleFunc("/api/login", s.handleLogin)
	mux.HandleFunc("/api/events", s.handleEvents)

	if s.uiHandler != nil {
		mux.Handle("/", s.uiHandler)
	} else {
		mux.HandleFunc("/", s.handleRoot)
	}

	// Order: log → CORS → auth → mux.
	var h http.Handler = mux
	if s.auth.Enabled {
		h = s.authMiddleware(h)
	}
	h = s.cors(h)
	h = s.logRequests(h)
	return h
}

func (s *Server) uiSettings() *models.UISettings {
	return &models.UISettings{
		Title:          s.ui.Title,
		ShowCostColumn: s.ui.ShowCostColumn,
		DefaultFilter:  s.ui.DefaultFilter,
		AuthRequired:   s.auth.Enabled,
	}
}

func (s *Server) withUI(snap *models.Snapshot) *models.Snapshot {
	if snap == nil {
		return nil
	}
	out := *snap
	out.UI = s.uiSettings()
	return &out
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
<p>API endpoints: <code>/api/snapshot</code>, <code>/api/resources</code>, <code>/api/resource</code>, <code>/api/facets</code>, <code>/api/summary</code>, <code>/api/status</code>, <code>/api/events</code></p>
</body></html>`))
}

// cors permits the dev UI on :3000 to talk to the API on :7777. When the
// browser sends an Origin header we echo it back (required for credentialed
// requests); wildcard "*" is only used for non-browser clients.
func (s *Server) cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if origin := r.Header.Get("Origin"); origin != "" && allowedCORSOrigin(origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Vary", "Origin")
		} else {
			w.Header().Set("Access-Control-Allow-Origin", "*")
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func allowedCORSOrigin(origin string) bool {
	for _, prefix := range []string{
		"http://localhost:",
		"http://127.0.0.1:",
		"https://localhost:",
		"https://127.0.0.1:",
	} {
		if strings.HasPrefix(origin, prefix) {
			return true
		}
	}
	return false
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
