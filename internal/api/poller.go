// Package api hosts Terraview's HTTP layer: the server, route handlers and
// the background poller that periodically refreshes the snapshot the UI
// reads.
package api

import (
	"context"
	"log"
	"sync"
	"time"

	"github.com/NotHarshhaa/terraview/internal/engine"
	"github.com/NotHarshhaa/terraview/internal/models"
)

// Poller owns the latest models.Snapshot and refreshes it on a fixed
// interval. It also exposes a manual Refresh() so the UI can force an
// out-of-band reload.
//
// Concurrency model: a single goroutine writes to `current` under a Mutex;
// readers (HTTP handlers) take a read lock and copy the pointer out. The
// snapshot itself is treated as immutable once published — never mutate
// fields after assigning.
type Poller struct {
	engine  *engine.Engine
	options engine.Options
	period  time.Duration
	logger  *log.Logger

	mu       sync.RWMutex
	current  *models.Snapshot
	lastErr  error
	subs     map[chan struct{}]struct{}
	subsLock sync.Mutex
}

// NewPoller returns a poller that uses eng to produce snapshots based on
// opts every period. period is clamped to at least 5s to avoid hammering
// state backends.
func NewPoller(eng *engine.Engine, opts engine.Options, period time.Duration, logger *log.Logger) *Poller {
	if period < 5*time.Second {
		period = 5 * time.Second
	}
	if logger == nil {
		logger = log.Default()
	}
	return &Poller{
		engine:  eng,
		options: opts,
		period:  period,
		logger:  logger,
		subs:    map[chan struct{}]struct{}{},
	}
}

// Run blocks until ctx is cancelled, refreshing the snapshot on every tick.
// An initial refresh happens immediately so the API is usable from request 1.
func (p *Poller) Run(ctx context.Context) {
	p.refreshOnce(ctx)

	ticker := time.NewTicker(p.period)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			p.refreshOnce(ctx)
		}
	}
}

// Refresh forces an immediate refresh and returns the resulting snapshot.
// Useful for the "Refresh now" button in the UI.
func (p *Poller) Refresh(ctx context.Context) (*models.Snapshot, error) {
	return p.refreshOnce(ctx)
}

func (p *Poller) refreshOnce(ctx context.Context) (*models.Snapshot, error) {
	start := time.Now()
	snap, err := p.engine.Refresh(ctx, p.options)
	took := time.Since(start)

	p.mu.Lock()
	if err == nil {
		p.current = snap
		p.lastErr = nil
		p.logger.Printf("snapshot refreshed: %d resources in %s", snap.Summary.Total, took.Round(time.Millisecond))
	} else {
		p.lastErr = err
		p.logger.Printf("snapshot refresh failed in %s: %v", took.Round(time.Millisecond), err)
	}
	p.mu.Unlock()

	p.broadcast()
	return snap, err
}

// Snapshot returns the most recent snapshot and the most recent fatal error.
// The snapshot may be nil if the first refresh hasn't completed yet.
func (p *Poller) Snapshot() (*models.Snapshot, error) {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.current, p.lastErr
}

// Subscribe returns a channel that receives a struct{} every time the
// snapshot is refreshed. Unsubscribe via the returned cancel function. This
// is wired to the /api/events SSE endpoint so the UI can push-update instead
// of polling.
func (p *Poller) Subscribe() (<-chan struct{}, func()) {
	ch := make(chan struct{}, 1)
	p.subsLock.Lock()
	p.subs[ch] = struct{}{}
	p.subsLock.Unlock()
	cancel := func() {
		p.subsLock.Lock()
		delete(p.subs, ch)
		p.subsLock.Unlock()
		close(ch)
	}
	return ch, cancel
}

func (p *Poller) broadcast() {
	p.subsLock.Lock()
	defer p.subsLock.Unlock()
	for ch := range p.subs {
		select {
		case ch <- struct{}{}:
		default:
			// Drop if the subscriber is slow; they'll see the latest snapshot
			// on the next event anyway.
		}
	}
}
