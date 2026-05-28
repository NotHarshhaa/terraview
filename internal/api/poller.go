// Package api hosts Terraview's HTTP layer: the server, route handlers and
// the background poller that periodically refreshes the snapshot the UI
// reads.
package api

import (
	"context"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/NotHarshhaa/terraview/internal/backend"
	"github.com/NotHarshhaa/terraview/internal/engine"
	"github.com/NotHarshhaa/terraview/internal/models"
)

// PollerConfig drives snapshot refresh for a Terraform project.
type PollerConfig struct {
	WorkingDir         string
	PlanPath           string
	Backend            backend.Config
	DriftAutoCheck     bool
	DriftCheckInterval time.Duration
	TerraformBin       string
}

// Poller owns workspace-scoped snapshots and refreshes the active workspace on
// a fixed interval. Cached snapshots allow instant workspace switching without
// restarting the server.
type Poller struct {
	engine     *engine.Engine
	baseOpts   engine.Options
	backendCfg backend.Config
	period     time.Duration
	logger     *log.Logger

	driftAutoCheck bool
	driftInterval  time.Duration
	terraformBin   string
	history        *engine.HistoryStore

	mu         sync.RWMutex
	refreshMu  sync.Mutex
	driftMu    sync.Mutex
	workspace  string
	workspaces []models.WorkspaceInfo
	cache      map[string]*models.Snapshot
	lastErr    error
	subs       map[chan struct{}]struct{}
	subsLock   sync.Mutex
}

// NewPoller returns a poller that uses eng to produce snapshots based on
// cfg every period. period is clamped to at least 5s to avoid hammering
// state backends.
func NewPoller(eng *engine.Engine, cfg PollerConfig, period time.Duration, logger *log.Logger) *Poller {
	if period < 5*time.Second {
		period = 5 * time.Second
	}
	driftInterval := cfg.DriftCheckInterval
	if driftInterval <= 0 {
		driftInterval = 5 * time.Minute
	}
	if logger == nil {
		logger = log.Default()
	}
	ws := strings.TrimSpace(cfg.Backend.Workspace)
	if ws == "" {
		ws = backend.DefaultWorkspace
	}
	cfg.Backend.Workspace = ws
	tfBin := strings.TrimSpace(cfg.TerraformBin)
	if tfBin == "" {
		tfBin = "terraform"
	}
	return &Poller{
		engine:         eng,
		baseOpts:       engine.Options{WorkingDir: cfg.WorkingDir, PlanPath: cfg.PlanPath},
		backendCfg:     cfg.Backend,
		period:         period,
		logger:         logger,
		driftAutoCheck: cfg.DriftAutoCheck,
		driftInterval:  driftInterval,
		terraformBin:   tfBin,
		history:        engine.NewHistoryStore(30),
		workspace:      ws,
		cache:          map[string]*models.Snapshot{},
		subs:           map[chan struct{}]struct{}{},
	}
}

// Run blocks until ctx is cancelled, refreshing the active workspace on every tick.
func (p *Poller) Run(ctx context.Context) {
	p.discoverWorkspaces(ctx)
	p.refreshOnce(ctx, p.workspace)

	ticker := time.NewTicker(p.period)
	defer ticker.Stop()

	var driftCh <-chan time.Time
	var driftTicker *time.Ticker
	if p.driftAutoCheck && p.baseOpts.PlanPath == "" {
		driftTicker = time.NewTicker(p.driftInterval)
		defer driftTicker.Stop()
		driftCh = driftTicker.C
	}

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			p.refreshOnce(ctx, p.CurrentWorkspace())
		case <-driftCh:
			p.driftCheckOnce(ctx, p.CurrentWorkspace())
		}
	}
}

// StateHistory returns recorded state versions for the active workspace.
func (p *Poller) StateHistory() []models.StateVersionInfo {
	p.mu.RLock()
	ws := p.workspace
	p.mu.RUnlock()
	return p.history.Versions(ws)
}

// ResourceHistory returns lifecycle events for a resource in the active workspace.
func (p *Poller) ResourceHistory(address string) []models.ResourceHistoryEvent {
	p.mu.RLock()
	ws := p.workspace
	p.mu.RUnlock()
	return p.history.ResourceTimeline(ws, address)
}

// CurrentWorkspace returns the active Terraform workspace name.
func (p *Poller) CurrentWorkspace() string {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.workspace
}

// Workspaces returns the last discovered workspace list with Current flags set.
func (p *Poller) Workspaces() []models.WorkspaceInfo {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return cloneWorkspaceList(p.workspaces, p.workspace)
}

// Refresh forces an immediate refresh of the active workspace.
func (p *Poller) Refresh(ctx context.Context) (*models.Snapshot, error) {
	return p.refreshOnce(ctx, p.CurrentWorkspace())
}

// SetWorkspace switches the active workspace. Returns a cached snapshot when
// available; otherwise refreshes from the backend before returning.
func (p *Poller) SetWorkspace(ctx context.Context, workspace string) (*models.Snapshot, error) {
	workspace = strings.TrimSpace(workspace)
	if workspace == "" {
		workspace = backend.DefaultWorkspace
	}

	p.mu.Lock()
	if workspace == p.workspace {
		snap := p.cache[workspace]
		p.mu.Unlock()
		if snap != nil {
			return p.decorate(snap), nil
		}
		return p.refreshOnce(ctx, workspace)
	}
	p.workspace = workspace
	p.backendCfg.Workspace = workspace
	cached := p.cache[workspace]
	p.mu.Unlock()

	if cached != nil {
		p.broadcast()
		return p.decorate(cached), nil
	}
	return p.refreshOnce(ctx, workspace)
}

// Snapshot returns the most recent snapshot for the active workspace.
func (p *Poller) Snapshot() (*models.Snapshot, error) {
	p.mu.RLock()
	ws := p.workspace
	snap := p.cache[ws]
	err := p.lastErr
	p.mu.RUnlock()
	if snap == nil {
		return nil, err
	}
	return p.decorate(snap), err
}

// Subscribe returns a channel notified on each successful refresh.
func (p *Poller) Subscribe() (<-chan struct{}, func()) {
	ch := make(chan struct{}, 1)
	p.subsLock.Lock()
	p.subs[ch] = struct{}{}
	p.subsLock.Unlock()
	cancel := func() {
		p.subsLock.Lock()
		delete(p.subs, ch)
		p.subsLock.Unlock()
	}
	return ch, cancel
}

func (p *Poller) discoverWorkspaces(ctx context.Context) {
	list, err := backend.ListWorkspaces(ctx, p.backendCfg)
	if err != nil {
		p.logger.Printf("list workspaces: %v", err)
		list = []models.WorkspaceInfo{{Name: p.workspace, Current: true}}
	}
	p.mu.Lock()
	p.workspaces = list
	p.mu.Unlock()
}

func (p *Poller) refreshOnce(ctx context.Context, workspace string) (*models.Snapshot, error) {
	p.refreshMu.Lock()
	defer p.refreshMu.Unlock()

	start := time.Now()
	be, err := backend.NewForWorkspace(p.backendCfg, workspace)
	if err != nil {
		p.mu.Lock()
		p.lastErr = err
		p.mu.Unlock()
		p.logger.Printf("workspace %q backend: %v", workspace, err)
		return nil, err
	}

	opts := p.baseOpts
	opts.Backend = be
	opts.Workspace = workspace

	snap, err := p.engine.Refresh(ctx, opts)
	took := time.Since(start)

	p.mu.Lock()
	if err == nil {
		snap.StateHistory = p.history.Record(workspace, snap.StateSerial, snap.Resources)
		p.cache[workspace] = snap
		if workspace == p.workspace {
			p.lastErr = nil
		}
		p.logger.Printf("snapshot refreshed (%s): %d resources in %s", workspace, snap.Summary.Total, took.Round(time.Millisecond))
	} else if workspace == p.workspace {
		p.lastErr = err
		p.logger.Printf("snapshot refresh failed (%s) in %s: %v", workspace, took.Round(time.Millisecond), err)
	}
	p.mu.Unlock()

	if err == nil {
		p.discoverWorkspaces(ctx)
		p.broadcast()
		return p.decorate(snap), nil
	}
	return nil, err
}

func (p *Poller) driftCheckOnce(ctx context.Context, workspace string) {
	if p.baseOpts.PlanPath != "" {
		return
	}
	p.driftMu.Lock()
	defer p.driftMu.Unlock()

	checkCtx, cancel := context.WithTimeout(ctx, 15*time.Minute)
	defer cancel()

	res, err := engine.RunDriftCheck(checkCtx, engine.DriftCheckOptions{
		WorkingDir:   p.baseOpts.WorkingDir,
		Workspace:    workspace,
		TerraformBin: p.terraformBin,
	})
	if res.SkipReason != "" {
		p.logger.Printf("drift check skipped (%s): %s", workspace, res.SkipReason)
		p.touchDriftCheckedAt(workspace, res.CheckedAt)
		return
	}
	if err != nil {
		p.logger.Printf("drift check failed (%s): %v", workspace, err)
		return
	}

	p.mu.Lock()
	snap := p.cache[workspace]
	if snap != nil {
		updated := *snap
		updated.DriftAlerts = nil
		engine.ApplyDriftAlerts(&updated, res.Drift, res.CheckedAt)
		p.cache[workspace] = &updated
		active := workspace == p.workspace
		p.mu.Unlock()
		if active {
			p.broadcast()
		}
		p.logger.Printf("drift check (%s): %d alert(s)", workspace, len(res.Drift))
		return
	}
	p.mu.Unlock()
}

func (p *Poller) touchDriftCheckedAt(workspace string, at time.Time) {
	p.mu.Lock()
	defer p.mu.Unlock()
	snap := p.cache[workspace]
	if snap == nil {
		return
	}
	updated := *snap
	t := at.UTC()
	updated.DriftCheckedAt = &t
	p.cache[workspace] = &updated
}

func (p *Poller) decorate(snap *models.Snapshot) *models.Snapshot {
	if snap == nil {
		return nil
	}
	p.mu.RLock()
	ws := p.workspace
	workspaces := cloneWorkspaceList(p.workspaces, ws)
	p.mu.RUnlock()

	out := *snap
	out.TerraformWorkspace = ws
	out.AvailableWorkspaces = workspaces
	if len(out.StateHistory) == 0 {
		out.StateHistory = p.history.Versions(ws)
	}
	return &out
}

func cloneWorkspaceList(list []models.WorkspaceInfo, current string) []models.WorkspaceInfo {
	if len(list) == 0 {
		return []models.WorkspaceInfo{{Name: current, Current: true}}
	}
	out := make([]models.WorkspaceInfo, len(list))
	for i, w := range list {
		out[i] = models.WorkspaceInfo{
			Name:    w.Name,
			Current: w.Name == current,
		}
	}
	return out
}

func (p *Poller) broadcast() {
	p.subsLock.Lock()
	defer p.subsLock.Unlock()
	for ch := range p.subs {
		select {
		case ch <- struct{}{}:
		default:
		}
	}
}
