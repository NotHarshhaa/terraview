package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/NotHarshhaa/terraview/internal/models"
)

// writeJSON is a single source of truth for JSON responses. We always set
// Content-Type and CORS headers (the UI may run on a separate port during
// development), and we never panic on encoding errors — they're logged and
// produce a 500 instead.
func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(body)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

// handleHealth is the liveness probe. It returns 200 even before the first
// snapshot is ready so process supervisors don't kill the container during
// startup.
func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"status":  "ok",
		"version": s.version,
		"time":    time.Now().UTC(),
	})
}

// handleSummary returns just the aggregate counts — useful for badges and
// for thin clients that don't need the full resource list.
func (s *Server) handleSummary(w http.ResponseWriter, r *http.Request) {
	snap, err := s.poller.Snapshot()
	if snap == nil {
		writeError(w, http.StatusServiceUnavailable, errorMsgOrDefault(err, "snapshot not ready yet"))
		return
	}
	writeJSON(w, http.StatusOK, snap.Summary)
}

// handleResources returns the resource list. Supports a small set of query
// filters that mirror the UI's sidebar:
//
//	?status=created,pending_create  — comma-separated status whitelist
//	?provider=aws,gcp               — comma-separated provider whitelist
//	?module=//networking            — exact module match
//	?q=web                          — case-insensitive substring on name/type/address
//	?category=Compute               — exact service-family match
//	?tag=env=prod,owner             — tag key=value or key-only match
//	?address=aws_instance.web       — exact resource address
//	?limit=50&offset=0              — pagination
//
// Filtering happens server-side so a project with thousands of resources
// doesn't have to ship them all to the browser on every keystroke.
func (s *Server) handleResources(w http.ResponseWriter, r *http.Request) {
	snap, err := s.poller.Snapshot()
	if snap == nil {
		writeError(w, http.StatusServiceUnavailable, errorMsgOrDefault(err, "snapshot not ready yet"))
		return
	}

	f := ParseResourceFilter(r)
	all := FilterResources(snap.Resources, ResourceFilter{
		Statuses:   f.Statuses,
		Providers:  f.Providers,
		Modules:    f.Modules,
		Categories: f.Categories,
		Tags:       f.Tags,
		Search:     f.Search,
	})
	total := len(all)
	filtered := FilterResources(all, ResourceFilter{Limit: f.Limit, Offset: f.Offset})

	writeJSON(w, http.StatusOK, map[string]any{
		"generated_at": snap.GeneratedAt,
		"working_dir":  snap.WorkingDir,
		"backend_type": snap.BackendType,
		"resources":    filtered,
		"errors":       snap.Errors,
		"total":        total,
		"count":        len(filtered),
		"offset":       f.Offset,
		"limit":        f.Limit,
	})
}

// handleResource returns a single resource by exact address.
func (s *Server) handleResource(w http.ResponseWriter, r *http.Request) {
	address := strings.TrimSpace(r.URL.Query().Get("address"))
	if address == "" {
		writeError(w, http.StatusBadRequest, "address query parameter is required")
		return
	}

	snap, err := s.poller.Snapshot()
	if snap == nil {
		writeError(w, http.StatusServiceUnavailable, errorMsgOrDefault(err, "snapshot not ready yet"))
		return
	}

	for _, res := range snap.Resources {
		if res.Address == address {
			writeJSON(w, http.StatusOK, map[string]any{"resource": res})
			return
		}
	}
	writeError(w, http.StatusNotFound, "resource not found")
}

// handleFacets returns aggregated filter dimensions (providers, modules, tags, …).
func (s *Server) handleFacets(w http.ResponseWriter, r *http.Request) {
	snap, err := s.poller.Snapshot()
	if snap == nil {
		writeError(w, http.StatusServiceUnavailable, errorMsgOrDefault(err, "snapshot not ready yet"))
		return
	}

	f := ParseResourceFilter(r)
	// Allow pre-filtering facets with the same params except address/limit/offset.
	f.Address = ""
	f.Limit = 0
	f.Offset = 0
	resources := FilterResources(snap.Resources, f)

	writeJSON(w, http.StatusOK, map[string]any{
		"generated_at": snap.GeneratedAt,
		"total":        len(resources),
		"facets":       BuildFacets(resources),
	})
}

// handleStatus is a tiny shape designed for badges and CI status comments:
// just the counts and a human-readable headline.
func (s *Server) handleStatus(w http.ResponseWriter, r *http.Request) {
	snap, err := s.poller.Snapshot()
	if snap == nil {
		writeError(w, http.StatusServiceUnavailable, errorMsgOrDefault(err, "snapshot not ready yet"))
		return
	}

	headline := buildHeadline(snap.Summary)
	writeJSON(w, http.StatusOK, map[string]any{
		"generated_at":       snap.GeneratedAt,
		"backend_type":       snap.BackendType,
		"total":              snap.Summary.Total,
		"by_status":          snap.Summary.ByStatus,
		"by_provider":        snap.Summary.ByProvider,
		"total_monthly_cost": snap.Summary.TotalMonthlyCost,
		"headline":           headline,
	})
}

// handleSnapshot returns the full snapshot in one payload. Used by the UI
// on initial load when it wants summary + resources atomically.
func (s *Server) handleSnapshot(w http.ResponseWriter, r *http.Request) {
	snap, err := s.poller.Snapshot()
	if snap == nil {
		writeError(w, http.StatusServiceUnavailable, errorMsgOrDefault(err, "snapshot not ready yet"))
		return
	}
	writeJSON(w, http.StatusOK, s.withUI(snap))
}

// handleWorkspaces lists Terraform workspaces Terraview can switch to.
func (s *Server) handleWorkspaces(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", "GET")
		writeError(w, http.StatusMethodNotAllowed, "use GET")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"current":     s.poller.CurrentWorkspace(),
		"workspaces":  s.poller.Workspaces(),
	})
}

// handleWorkspace switches the active Terraform workspace without restarting.
func (s *Server) handleWorkspace(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		writeError(w, http.StatusMethodNotAllowed, "use POST")
		return
	}
	var body struct {
		Workspace string `json:"workspace"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	ws := strings.TrimSpace(body.Workspace)
	if ws == "" {
		writeError(w, http.StatusBadRequest, "workspace is required")
		return
	}
	snap, err := s.poller.SetWorkspace(r.Context(), ws)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, s.withUI(snap))
}

// handleGraph returns the dependency graph for the active workspace snapshot.
func (s *Server) handleGraph(w http.ResponseWriter, r *http.Request) {
	snap, err := s.poller.Snapshot()
	if snap == nil {
		writeError(w, http.StatusServiceUnavailable, errorMsgOrDefault(err, "snapshot not ready yet"))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"generated_at":         snap.GeneratedAt,
		"terraform_workspace":  snap.TerraformWorkspace,
		"dependency_graph":     snap.DependencyGraph,
		"resource_count":       len(snap.Resources),
	})
}

// handleRefresh forces an out-of-band snapshot refresh. The caller blocks
// until the refresh completes, so a manual "Refresh" button feels
// synchronous from the user's point of view.
func (s *Server) handleRefresh(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		writeError(w, http.StatusMethodNotAllowed, "use POST")
		return
	}
	snap, err := s.poller.Refresh(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, s.withUI(snap))
}

// handleEvents is a tiny Server-Sent Events stream that pushes a "refreshed"
// event each time the poller publishes a new snapshot. The UI can use it to
// avoid client-side polling entirely.
func (s *Server) handleEvents(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, http.StatusInternalServerError, "streaming not supported")
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	ch, unsub := s.poller.Subscribe()
	defer unsub()

	// Send an initial hello so EventSource resolves onopen immediately.
	fmt.Fprintf(w, "event: hello\ndata: {}\n\n")
	flusher.Flush()

	heartbeat := time.NewTicker(20 * time.Second)
	defer heartbeat.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case <-ch:
			fmt.Fprintf(w, "event: refreshed\ndata: {\"ts\":\"%s\"}\n\n", time.Now().UTC().Format(time.RFC3339))
			flusher.Flush()
		case <-heartbeat.C:
			fmt.Fprintf(w, ": ping\n\n")
			flusher.Flush()
		}
	}
}

// matchesSearch performs a case-insensitive substring match against name,
// address, type and tag values.
func matchesSearch(r models.Resource, needle string) bool {
	if needle == "" {
		return true
	}
	if strings.Contains(strings.ToLower(r.Name), needle) {
		return true
	}
	if strings.Contains(strings.ToLower(r.Address), needle) {
		return true
	}
	if strings.Contains(strings.ToLower(r.Type), needle) {
		return true
	}
	for _, v := range r.Tags {
		if strings.Contains(strings.ToLower(v), needle) {
			return true
		}
	}
	return false
}

func moduleFilterValue(module string) string {
	if module == "" {
		return "(root)"
	}
	return module
}

func matchModuleFilter(module string, allowed map[string]bool) bool {
	if allowed[module] {
		return true
	}
	return allowed[moduleFilterValue(module)]
}

func splitCSVSet(s string) map[string]bool {
	if s == "" {
		return nil
	}
	out := map[string]bool{}
	for _, p := range strings.Split(s, ",") {
		p = strings.TrimSpace(p)
		if p != "" {
			out[p] = true
		}
	}
	return out
}

func errorMsgOrDefault(err error, def string) string {
	if err != nil {
		return err.Error()
	}
	return def
}

// buildHeadline crafts the human-readable one-liner used in CI comments:
// "47 created · 3 pending · 2 inactive · 1 drifted".
func buildHeadline(s models.Summary) string {
	parts := []string{}
	add := func(label string, statuses ...models.Status) {
		n := 0
		for _, st := range statuses {
			n += s.ByStatus[st]
		}
		if n > 0 {
			parts = append(parts, fmt.Sprintf("%d %s", n, label))
		}
	}
	add("created", models.StatusCreated)
	add("pending", models.StatusPendingCreate, models.StatusPendingUpdate, models.StatusPendingDestroy)
	add("inactive", models.StatusInactive)
	add("drifted", models.StatusDrifted)
	add("unmanaged", models.StatusUnmanaged)

	if len(parts) == 0 {
		return "No managed resources yet"
	}
	return strings.Join(parts, " · ")
}
