package backend

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"

	"github.com/NotHarshhaa/terraview/internal/engine"
)

// LocalBackend reads `terraform.tfstate` from disk. By default it looks in
// the working directory; an explicit `state_file` path takes precedence.
//
// It also walks `.terraform/` to discover state when a project uses a remote
// backend that caches state locally (e.g. some `terraform_remote_state`
// setups), so a freshly-cloned repo with cached state still works.
type LocalBackend struct {
	path      string
	workspace string
}

// NewLocal resolves the path to the state file at construction time so any
// configuration error surfaces immediately, not on the first request.
func NewLocal(cfg Config) (*LocalBackend, error) {
	path, err := localStatePath(cfg.withDefaultWorkspace())
	if err != nil {
		return nil, err
	}

	// If default workspace state is missing, fall back to .terraform cache once.
	if cfg.StateFile == "" && (cfg.Workspace == "" || cfg.Workspace == DefaultWorkspace) {
		if _, err := os.Stat(path); os.IsNotExist(err) && cfg.WorkingDir != "" {
			abs, _ := filepath.Abs(cfg.WorkingDir)
			alt := filepath.Join(abs, ".terraform", "terraform.tfstate")
			if _, err := os.Stat(alt); err == nil {
				path = alt
			}
		}
	}

	ws := cfg.Workspace
	if ws == "" {
		ws = DefaultWorkspace
	}
	return &LocalBackend{path: path, workspace: ws}, nil
}

func (l *LocalBackend) LoadState(ctx context.Context) (io.ReadCloser, error) {
	f, err := os.Open(l.path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("%w: %s", engine.ErrStateNotFound, l.path)
		}
		return nil, err
	}
	return f, nil
}

func (l *LocalBackend) StateModifiedAt(ctx context.Context) (time.Time, bool) {
	info, err := os.Stat(l.path)
	if err != nil {
		return time.Time{}, false
	}
	return info.ModTime().UTC(), true
}

func (l *LocalBackend) Name() string { return "local:" + l.path }
func (l *LocalBackend) Type() string { return "local" }
