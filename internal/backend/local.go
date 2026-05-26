package backend

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"

	"github.com/NotHarshhaa/terraview/internal/engine"
)

// LocalBackend reads `terraform.tfstate` from disk. By default it looks in
// the working directory; an explicit `state_file` path takes precedence.
//
// It also walks `.terraform/` to discover state when a project uses a remote
// backend that caches state locally (e.g. some `terraform_remote_state`
// setups), so a freshly-cloned repo with cached state still works.
type LocalBackend struct {
	path string
}

// NewLocal resolves the path to the state file at construction time so any
// configuration error surfaces immediately, not on the first request.
func NewLocal(cfg Config) (*LocalBackend, error) {
	switch {
	case cfg.StateFile != "":
		abs, err := filepath.Abs(cfg.StateFile)
		if err != nil {
			return nil, fmt.Errorf("resolve state file: %w", err)
		}
		return &LocalBackend{path: abs}, nil

	case cfg.WorkingDir != "":
		abs, err := filepath.Abs(cfg.WorkingDir)
		if err != nil {
			return nil, fmt.Errorf("resolve working dir: %w", err)
		}
		// Prefer the canonical "terraform.tfstate" alongside the project; if
		// that's missing, fall back to "<dir>/.terraform/terraform.tfstate"
		// which some setups use for backend-cached state.
		candidates := []string{
			filepath.Join(abs, "terraform.tfstate"),
			filepath.Join(abs, ".terraform", "terraform.tfstate"),
		}
		for _, c := range candidates {
			if _, err := os.Stat(c); err == nil {
				return &LocalBackend{path: c}, nil
			}
		}
		// Resolve to the canonical path anyway so LoadState surfaces a
		// recognisable "not found" via the engine's sentinel.
		return &LocalBackend{path: candidates[0]}, nil

	default:
		return nil, fmt.Errorf("local backend requires either state_file or working_dir")
	}
}

func (l *LocalBackend) LoadState(ctx context.Context) (io.ReadCloser, error) {
	f, err := os.Open(l.path)
	if err != nil {
		if os.IsNotExist(err) {
			// Wrap with the engine sentinel so a missing state file is treated
			// as a non-fatal warning rather than a backend error.
			return nil, fmt.Errorf("%w: %s", engine.ErrStateNotFound, l.path)
		}
		return nil, err
	}
	return f, nil
}

func (l *LocalBackend) Name() string { return "local:" + l.path }
func (l *LocalBackend) Type() string { return "local" }
