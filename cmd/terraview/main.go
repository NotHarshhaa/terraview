// terraview is the CLI for the Terraview dashboard.
//
// Usage:
//
//	terraview serve [working-dir] [--config path] [--port 7777] [--ui dir]
//	terraview status [working-dir] [--config path]
//	terraview version
//
// `serve` boots the HTTP server + background poller. `status` does a single
// snapshot and prints a CI-friendly summary to stdout (used by the GitHub
// Action). `version` prints the build version.
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/NotHarshhaa/terraview/internal/api"
	"github.com/NotHarshhaa/terraview/internal/backend"
	"github.com/NotHarshhaa/terraview/internal/config"
	"github.com/NotHarshhaa/terraview/internal/engine"
)

// version is the build-time stamped version. Override via:
//
//	go build -ldflags "-X main.version=v0.1.0" ./cmd/terraview
var version = "dev"

func main() {
	if len(os.Args) < 2 {
		printUsage(os.Stderr)
		os.Exit(2)
	}

	// Pre-process so positional args (e.g. the working-dir) can appear in
	// any position. Go's flag package would otherwise stop parsing the
	// moment it sees a non-flag arg.
	flags, positional := splitArgs(os.Args[2:])

	switch os.Args[1] {
	case "serve":
		os.Exit(runServe(flags, positional))
	case "status":
		os.Exit(runStatus(flags, positional))
	case "version", "-v", "--version":
		fmt.Println("terraview", version)
	case "help", "-h", "--help":
		printUsage(os.Stdout)
	default:
		fmt.Fprintf(os.Stderr, "unknown command %q\n\n", os.Args[1])
		printUsage(os.Stderr)
		os.Exit(2)
	}
}

func printUsage(w *os.File) {
	fmt.Fprintln(w, `Terraview — Git-native dashboard for Terraform resource status.

Usage:
  terraview serve [working-dir] [flags]
  terraview status [working-dir] [flags]
  terraview version

Common flags:
  --config <path>     Path to .terraview.yaml (defaults to ./.terraview.yaml)
  --port <n>          HTTP port (default 7777, env TV_PORT)
  --poll <dur>        Poll interval, e.g. 30s (env TV_POLL_INTERVAL)
  --backend <kind>    local | s3 | gcs | azureblob | tfc (env TV_BACKEND)
  --state-file <p>    Path to a local terraform.tfstate (local backend)
  --plan-file <p>     Path to a 'terraform show -json' plan document
  --ui <dir>          Serve a Next.js static export from <dir>/out
  --no-ui             Run headless (API only)

Examples:
  terraview serve .                                # local backend, default port
  terraview serve ./infra --backend s3 --config .terraview.yaml
  terraview status ./infra > status.json           # CI mode`)
}

// splitArgs separates flag-style tokens ("--foo", "--foo=bar") from
// positional tokens so callers can pass them to flag.FlagSet in any order.
// It's a tiny, intentionally simple substitute for the way kingpin/cobra
// handle this — we don't have those deps and don't want them.
func splitArgs(args []string) (flags []string, positional []string) {
	i := 0
	for i < len(args) {
		a := args[i]
		switch {
		case a == "--":
			positional = append(positional, args[i+1:]...)
			return
		case strings.HasPrefix(a, "--") || strings.HasPrefix(a, "-"):
			flags = append(flags, a)
			// If the next token isn't a flag and the current flag doesn't
			// already contain "=", treat the next token as its value.
			if !strings.Contains(a, "=") && i+1 < len(args) {
				next := args[i+1]
				if !strings.HasPrefix(next, "-") {
					flags = append(flags, next)
					i++
				}
			}
		default:
			positional = append(positional, a)
		}
		i++
	}
	return
}

// runServe parses serve-specific flags, builds the engine + poller + server
// and blocks until the process is signalled. Returns an exit code.
func runServe(args, positional []string) int {
	fs := flag.NewFlagSet("serve", flag.ContinueOnError)
	configPath := fs.String("config", "", "path to .terraview.yaml")
	port := fs.Int("port", 0, "override port")
	poll := fs.Duration("poll", 0, "override poll interval")
	backendKind := fs.String("backend", "", "override backend type")
	stateFile := fs.String("state-file", "", "override local state file")
	planFile := fs.String("plan-file", "", "override plan file")
	uiDir := fs.String("ui", "", "directory containing the Next.js static export (defaults to ./ui/out if present)")
	noUI := fs.Bool("no-ui", false, "run headless (API only)")

	if err := fs.Parse(args); err != nil {
		return 2
	}

	workingDir := "."
	if len(positional) > 0 {
		workingDir = positional[0]
	}

	cfg, err := config.Load(*configPath)
	if err != nil {
		fmt.Fprintln(os.Stderr, "config:", err)
		return 1
	}

	if cfg.WorkingDir == "" || cfg.WorkingDir == "." {
		cfg.WorkingDir = workingDir
	}
	if *port != 0 {
		cfg.Port = *port
	}
	if *poll != 0 {
		cfg.PollInterval = *poll
	}
	if *backendKind != "" {
		cfg.Backend.Type = *backendKind
	}
	if *stateFile != "" {
		cfg.Backend.StateFile = *stateFile
		if cfg.Backend.Type == "" {
			cfg.Backend.Type = "local"
		}
	}
	if *planFile != "" {
		cfg.PlanFile = *planFile
	}
	if cfg.Backend.Type == "local" && cfg.Backend.WorkingDir == "" {
		cfg.Backend.WorkingDir = cfg.WorkingDir
	}

	logger := log.New(os.Stdout, "[terraview] ", log.LstdFlags|log.Lmsgprefix)

	be, err := backend.New(cfg.Backend)
	if err != nil {
		fmt.Fprintln(os.Stderr, "backend:", err)
		return 1
	}
	logger.Printf("backend: %s", be.Name())

	eng := engine.New()
	poller := api.NewPoller(eng, engine.Options{
		WorkingDir: cfg.WorkingDir,
		Backend:    be,
		PlanPath:   cfg.PlanFile,
	}, cfg.PollInterval, logger)

	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	go poller.Run(ctx)

	uiHandler := resolveUIHandler(*uiDir, *noUI, logger)

	server := api.NewServer(poller, api.Config{
		Version: version,
		Auth: api.AuthConfig{
			Enabled:  cfg.Auth.Enabled,
			Username: cfg.Auth.Username,
			Password: cfg.Auth.Password,
		},
		UIHandler: uiHandler,
		Logger:    logger,
	})

	addr := fmt.Sprintf(":%d", cfg.Port)
	if err := server.ListenAndServe(ctx, addr); err != nil {
		fmt.Fprintln(os.Stderr, "server:", err)
		return 1
	}
	logger.Print("shutting down cleanly")
	return 0
}

// runStatus does exactly one refresh and prints the snapshot to stdout. The
// GitHub Action shells out to this to build the PR comment. The exit code
// is 0 for "all good or just informational", 2 if the snapshot reports
// drifted resources (CI-friendly), 1 for fatal errors.
func runStatus(args, positional []string) int {
	fs := flag.NewFlagSet("status", flag.ContinueOnError)
	configPath := fs.String("config", "", "path to .terraview.yaml")
	backendKind := fs.String("backend", "", "override backend type")
	stateFile := fs.String("state-file", "", "override local state file")
	planFile := fs.String("plan-file", "", "override plan file")
	format := fs.String("format", "json", "json | markdown")
	if err := fs.Parse(args); err != nil {
		return 2
	}

	workingDir := "."
	if len(positional) > 0 {
		workingDir = positional[0]
	}

	cfg, err := config.Load(*configPath)
	if err != nil {
		fmt.Fprintln(os.Stderr, "config:", err)
		return 1
	}
	if cfg.WorkingDir == "" || cfg.WorkingDir == "." {
		cfg.WorkingDir = workingDir
	}
	if *backendKind != "" {
		cfg.Backend.Type = *backendKind
	}
	if *stateFile != "" {
		cfg.Backend.StateFile = *stateFile
		if cfg.Backend.Type == "" {
			cfg.Backend.Type = "local"
		}
	}
	if *planFile != "" {
		cfg.PlanFile = *planFile
	}
	if cfg.Backend.Type == "local" && cfg.Backend.WorkingDir == "" {
		cfg.Backend.WorkingDir = cfg.WorkingDir
	}

	be, err := backend.New(cfg.Backend)
	if err != nil {
		fmt.Fprintln(os.Stderr, "backend:", err)
		return 1
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	snap, err := engine.New().Refresh(ctx, engine.Options{
		WorkingDir: cfg.WorkingDir,
		Backend:    be,
		PlanPath:   cfg.PlanFile,
	})
	if err != nil {
		fmt.Fprintln(os.Stderr, "refresh:", err)
		return 1
	}

	switch strings.ToLower(*format) {
	case "markdown", "md":
		printMarkdownStatus(snap)
	default:
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		_ = enc.Encode(snap)
	}

	for _, r := range snap.Resources {
		if r.Status == "drifted" {
			return 2
		}
	}
	return 0
}

// printMarkdownStatus emits the table that the GitHub Action posts as a PR
// comment. The format matches the README example.
func printMarkdownStatus(snap any) {
	type res = struct {
		Address      string `json:"address"`
		Name         string `json:"name"`
		Type         string `json:"type"`
		Module       string `json:"module"`
		Status       string `json:"status"`
		StatusReason string `json:"status_reason,omitempty"`
		LastChanged  string `json:"last_changed,omitempty"`
	}
	// Re-encode through JSON so this helper doesn't need to know the model
	// package layout — keeps the markdown writer pluggable.
	raw, _ := json.Marshal(snap)
	var s struct {
		GeneratedAt time.Time `json:"generated_at"`
		Resources   []res     `json:"resources"`
		Summary     struct {
			Total    int            `json:"total"`
			ByStatus map[string]int `json:"by_status"`
		} `json:"summary"`
	}
	_ = json.Unmarshal(raw, &s)

	fmt.Println("## Terraview — Infrastructure Status")
	fmt.Println()
	fmt.Printf("_%d resources_ · ", s.Summary.Total)
	parts := []string{}
	for _, status := range []string{"created", "pending_create", "pending_update", "pending_destroy", "inactive", "drifted", "unmanaged"} {
		if n := s.Summary.ByStatus[status]; n > 0 {
			parts = append(parts, fmt.Sprintf("%s: %d", status, n))
		}
	}
	fmt.Println(strings.Join(parts, " · "))
	fmt.Println()
	fmt.Println("| Resource | Type | Module | Status | Last Changed |")
	fmt.Println("|---|---|---|---|---|")
	for _, r := range s.Resources {
		fmt.Printf("| `%s` | `%s` | `%s` | %s | %s |\n",
			r.Name, r.Type, defaultStr(r.Module, "root"),
			r.Status, formatLastChanged(r.LastChanged))
	}
}

func defaultStr(s, def string) string {
	if s == "" {
		return def
	}
	return s
}

// formatLastChanged renders the last-changed RFC3339 timestamp, collapsing
// Go's zero-value time ("0001-01-01T00:00:00Z") into a friendly dash.
func formatLastChanged(s string) string {
	if s == "" || strings.HasPrefix(s, "0001-01-01") {
		return "—"
	}
	if ts, err := time.Parse(time.RFC3339, s); err == nil {
		return ts.UTC().Format("2006-01-02")
	}
	return s
}

// resolveUIHandler returns an http.Handler that serves the Next.js static
// export, or nil for headless mode. We probe ./ui/out by default because
// `npm run build` + `next export` writes there.
func resolveUIHandler(uiDir string, noUI bool, logger *log.Logger) http.Handler {
	if noUI {
		return nil
	}
	candidates := []string{}
	if uiDir != "" {
		candidates = append(candidates, uiDir, filepath.Join(uiDir, "out"))
	}
	candidates = append(candidates,
		"ui/out",
		"out",
	)
	for _, c := range candidates {
		if info, err := os.Stat(c); err == nil && info.IsDir() {
			abs, _ := filepath.Abs(c)
			logger.Printf("serving UI from %s", abs)
			return uiFileServer(abs)
		}
	}
	logger.Print("no UI bundle found; visit /api/* directly or run `npm --prefix ui run dev`")
	return nil
}

// uiFileServer serves a directory containing a Next.js static export. It
// falls back to index.html for unknown paths so client-side routing works.
func uiFileServer(root string) http.Handler {
	fs := http.FileServer(http.Dir(root))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// /api/* is handled by the mux higher up; everything else goes here.
		path := filepath.Join(root, filepath.FromSlash(r.URL.Path))
		if info, err := os.Stat(path); err == nil && !info.IsDir() {
			fs.ServeHTTP(w, r)
			return
		}
		// Try with .html appended (Next exports app routes as `/foo.html`).
		if r.URL.Path != "/" {
			candidate := filepath.Join(root, filepath.FromSlash(r.URL.Path)+".html")
			if _, err := os.Stat(candidate); err == nil {
				http.ServeFile(w, r, candidate)
				return
			}
		}
		index := filepath.Join(root, "index.html")
		if _, err := os.Stat(index); err == nil {
			http.ServeFile(w, r, index)
			return
		}
		fs.ServeHTTP(w, r)
	})
}
