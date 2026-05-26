package engine

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/NotHarshhaa/terraview/internal/models"
)

// StateLoader is the slim interface the engine needs from a backend. The
// engine itself doesn't care whether the bytes came from a local file, S3 or
// a Terraform Cloud API call — it just needs a Reader and a name for error
// messages.
type StateLoader interface {
	// LoadState returns the raw JSON contents of the latest state file. The
	// returned ReadCloser is owned by the caller.
	LoadState(ctx context.Context) (io.ReadCloser, error)

	// Name describes the backend in user-facing messages (e.g. "local",
	// "s3://my-bucket/key").
	Name() string

	// Type returns the canonical backend kind ("local", "s3", "gcs", ...).
	Type() string
}

// Options controls how the engine refreshes a snapshot.
type Options struct {
	WorkingDir string      // Terraform project root (where .tf files live).
	Backend    StateLoader // Where to read state from.

	// PlanPath, when non-empty, points at a `terraform show -json plan.tfplan`
	// file Terraview should ingest to know what's pending. The GitHub Actions
	// mode wires this up from the CI plan output.
	PlanPath string
}

// Engine produces Snapshots from the inputs available at refresh time. It
// holds no state itself; each Refresh call is independent and idempotent.
type Engine struct{}

// New constructs a zero-config engine.
func New() *Engine {
	return &Engine{}
}

// Refresh produces a fresh Snapshot using the inputs in opts. Non-fatal
// errors (missing plan file, single .tf file that won't parse) are surfaced
// inside the returned Snapshot.Errors so the UI can render a partial view
// rather than a fatal page.
func (e *Engine) Refresh(ctx context.Context, opts Options) (*models.Snapshot, error) {
	if opts.WorkingDir == "" {
		return nil, errors.New("working directory is required")
	}

	snap := &models.Snapshot{
		GeneratedAt: time.Now().UTC(),
		WorkingDir:  opts.WorkingDir,
		Summary: models.Summary{
			ByStatus:   map[models.Status]int{},
			ByProvider: map[string]int{},
			ByCategory: map[string]int{},
		},
	}
	if opts.Backend != nil {
		snap.BackendType = opts.Backend.Type()
	}

	hcl := ParseHCLDir(opts.WorkingDir)
	for _, err := range hcl.Errors {
		snap.Errors = append(snap.Errors, models.SnapshotError{
			Source:  "hcl",
			Message: err.Error(),
		})
	}

	var stateResources []StateResource
	if opts.Backend != nil {
		rc, err := opts.Backend.LoadState(ctx)
		switch {
		case err == nil:
			defer rc.Close()
			parsed, perr := ParseStateJSON(rc)
			if perr != nil {
				snap.Errors = append(snap.Errors, models.SnapshotError{
					Source:  "state",
					Message: perr.Error(),
				})
			}
			stateResources = parsed
		case isStateNotFound(err):
			// A missing state file is normal for a freshly cloned repo; we
			// surface it as a warning rather than a hard failure.
			snap.Errors = append(snap.Errors, models.SnapshotError{
				Source:  "state",
				Message: "no state file found (project may not be applied yet)",
			})
		default:
			snap.Errors = append(snap.Errors, models.SnapshotError{
				Source:  "backend",
				Message: err.Error(),
			})
		}
	}

	var planResources []PlanResource
	var driftByAddr map[string]DriftInfo
	if opts.PlanPath != "" {
		if pr, drift, perr := loadPlanFile(opts.PlanPath); perr != nil {
			snap.Errors = append(snap.Errors, models.SnapshotError{
				Source:  "plan",
				Message: perr.Error(),
			})
		} else {
			planResources = pr
			driftByAddr = drift
		}
	}
	applyDriftToState(stateResources, driftByAddr)

	resources := mergeAndClassify(hcl.Resources, stateResources, planResources)
	snap.Resources = resources
	snap.Summary = summarise(resources)
	return snap, nil
}

// mergeAndClassify aligns declared, state and plan entries by address and
// emits one models.Resource per logical resource. The merge is left-outer in
// both directions: every declared resource is emitted (so unmanaged shows
// up), and every state resource is emitted (so resources no longer in HCL
// but still in state are visible too).
func mergeAndClassify(decls []DeclaredResource, states []StateResource, plans []PlanResource) []models.Resource {
	declByAddr := make(map[string]*DeclaredResource, len(decls))
	for i := range decls {
		d := decls[i]
		declByAddr[d.Address()] = &d
	}

	stateByAddr := make(map[string]*StateResource, len(states))
	for i := range states {
		s := states[i]
		stateByAddr[s.Address] = &s
	}

	planByAddr := make(map[string]*PlanResource, len(plans))
	for i := range plans {
		p := plans[i]
		planByAddr[p.Address] = &p
	}

	addrSet := make(map[string]struct{}, len(decls)+len(states)+len(plans))
	for k := range declByAddr {
		addrSet[k] = struct{}{}
	}
	for k := range stateByAddr {
		addrSet[k] = struct{}{}
	}
	for k := range planByAddr {
		addrSet[k] = struct{}{}
	}

	out := make([]models.Resource, 0, len(addrSet))
	for addr := range addrSet {
		decl := declByAddr[addr]
		state := stateByAddr[addr]
		plan := planByAddr[addr]

		t, name, module, provider := metaFromAny(addr, decl, state, plan)
		status, reason := Classify(decl, state, plan)

		r := models.Resource{
			Address:      addr,
			Name:         name,
			Type:         t,
			Provider:     provider,
			Module:       module,
			Category:     Categorize(t),
			Status:       status,
			StatusReason: reason,
		}
		if state != nil {
			r.Attributes = pickAttributes(state.Attributes)
			r.Tags = state.Tags
			r.LastChanged = state.LastChanged
		}
		out = append(out, r)
	}

	sort.Slice(out, func(i, j int) bool {
		if out[i].Category.Provider != out[j].Category.Provider {
			return out[i].Category.Provider < out[j].Category.Provider
		}
		if out[i].Category.Service != out[j].Category.Service {
			return out[i].Category.Service < out[j].Category.Service
		}
		return out[i].Address < out[j].Address
	})
	return out
}

// metaFromAny pulls type/name/module/provider out of whichever input has it.
// State wins because it's the most authoritative source for resources that
// actually exist; declarations fill in for unmanaged or pending_create cases.
func metaFromAny(addr string, d *DeclaredResource, s *StateResource, p *PlanResource) (t, name, module, provider string) {
	switch {
	case s != nil:
		provider := s.Provider
		if provider == "" {
			provider = providerFromType(s.Type)
		}
		return s.Type, s.Name, s.Module, provider
	case d != nil:
		return d.Type, d.Name, d.Module, d.Provider
	case p != nil:
		return p.Type, p.Name, moduleFromAddress(addr), providerFromType(p.Type)
	}
	return "", addr, "", ""
}

func moduleFromAddress(addr string) string {
	if !strings.HasPrefix(addr, "module.") {
		return ""
	}
	parts := strings.Split(addr, ".")
	var names []string
	for i := 0; i < len(parts); i++ {
		if parts[i] == "module" && i+1 < len(parts) {
			names = append(names, parts[i+1])
			i++
		}
	}
	if len(names) == 0 {
		return ""
	}
	return "//" + strings.Join(names, "/")
}

// pickAttributes selects a small whitelist of attributes worth showing in the
// resource grid. The full attribute bag is huge, schema-dependent and often
// contains secrets — we only forward a curated, safe subset.
func pickAttributes(attrs map[string]any) map[string]string {
	if attrs == nil {
		return nil
	}
	wanted := []string{
		"instance_type", "ami", "region", "availability_zone",
		"engine", "engine_version", "instance_class", "allocated_storage",
		"machine_type", "tier",
		"bucket", "name",
		"cidr_block",
		"runtime", "handler",
		"namespace",
		"image", "image_id",
	}
	out := map[string]string{}
	for _, k := range wanted {
		if v, ok := attrs[k]; ok {
			switch typed := v.(type) {
			case string:
				if typed != "" {
					out[k] = typed
				}
			case float64:
				out[k] = fmt.Sprintf("%v", typed)
			case bool:
				out[k] = fmt.Sprintf("%v", typed)
			}
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

// summarise pre-aggregates totals so the UI can render the status bar
// without iterating the resource list itself.
func summarise(rs []models.Resource) models.Summary {
	s := models.Summary{
		ByStatus:   map[models.Status]int{},
		ByProvider: map[string]int{},
		ByCategory: map[string]int{},
	}
	for _, r := range rs {
		s.Total++
		s.ByStatus[r.Status]++
		if r.Category.Provider != "" {
			s.ByProvider[r.Category.Provider]++
			s.ByCategory[r.Category.String()]++
		}
		s.TotalMonthlyCost += r.MonthlyCost
	}
	return s
}

func loadPlanFile(path string) ([]PlanResource, map[string]DriftInfo, error) {
	abs, _ := filepath.Abs(path)
	f, err := os.Open(abs)
	if err != nil {
		return nil, nil, err
	}
	defer f.Close()
	res, err := ParsePlanFull(f)
	if err != nil {
		return nil, nil, err
	}
	return res.Changes, res.Drift, nil
}

func applyDriftToState(states []StateResource, drift map[string]DriftInfo) {
	if len(drift) == 0 {
		return
	}
	for i := range states {
		if d, ok := drift[states[i].Address]; ok {
			states[i].Drifted = true
			states[i].DriftReason = d.Reason
		}
	}
}

// isStateNotFound is true for the typed sentinel each backend wraps a missing
// state in. We use errors.Is so backends can return os.ErrNotExist or their
// own typed error.
func isStateNotFound(err error) bool {
	return errors.Is(err, os.ErrNotExist) || errors.Is(err, ErrStateNotFound)
}

// ErrStateNotFound is the canonical "no state yet" sentinel.
var ErrStateNotFound = errors.New("state file not found")
