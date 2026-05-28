package backend

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/NotHarshhaa/terraview/internal/models"
)

const DefaultWorkspace = "default"

// ListWorkspaces returns Terraform workspaces available for the configured backend.
func ListWorkspaces(ctx context.Context, cfg Config) ([]models.WorkspaceInfo, error) {
	cfg = cfg.withDefaultWorkspace()
	switch strings.ToLower(strings.TrimSpace(cfg.Type)) {
	case "", "local":
		return listLocalWorkspaces(cfg)
	case "tfc", "remote", "cloud":
		return listTFCWorkspaces(ctx, cfg)
	default:
		return listConfiguredWorkspaces(cfg), nil
	}
}

// NewForWorkspace clones the backend config for a specific Terraform workspace.
func NewForWorkspace(cfg Config, workspace string) (Backend, error) {
	cfg = cfg.withDefaultWorkspace()
	if workspace != "" {
		cfg.Workspace = workspace
	}
	return New(cfg)
}

func (c Config) withDefaultWorkspace() Config {
	if strings.TrimSpace(c.Workspace) == "" {
		c.Workspace = DefaultWorkspace
	}
	return c
}

func workspaceStateKey(baseKey, workspace string) string {
	if workspace == "" || workspace == DefaultWorkspace {
		return baseKey
	}
	if strings.HasPrefix(baseKey, "env:/") {
		return baseKey
	}
	return fmt.Sprintf("env:/%s/%s", workspace, baseKey)
}

func listConfiguredWorkspaces(cfg Config) []models.WorkspaceInfo {
	names := map[string]struct{}{DefaultWorkspace: {}}
	for _, w := range cfg.Workspaces {
		w = strings.TrimSpace(w)
		if w != "" {
			names[w] = struct{}{}
		}
	}
	out := make([]models.WorkspaceInfo, 0, len(names))
	for name := range names {
		out = append(out, models.WorkspaceInfo{
			Name:    name,
			Current: name == cfg.Workspace,
		})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Name == DefaultWorkspace {
			return true
		}
		if out[j].Name == DefaultWorkspace {
			return false
		}
		return out[i].Name < out[j].Name
	})
	return out
}

func listLocalWorkspaces(cfg Config) ([]models.WorkspaceInfo, error) {
	if cfg.StateFile != "" {
		return []models.WorkspaceInfo{{Name: DefaultWorkspace, Current: true}}, nil
	}
	if cfg.WorkingDir == "" {
		return nil, fmt.Errorf("local backend requires working_dir")
	}
	abs, err := filepath.Abs(cfg.WorkingDir)
	if err != nil {
		return nil, err
	}

	names := map[string]struct{}{DefaultWorkspace: {}}
	if entries, err := os.ReadDir(filepath.Join(abs, "terraform.tfstate.d")); err == nil {
		for _, e := range entries {
			if !e.IsDir() {
				continue
			}
			statePath := filepath.Join(abs, "terraform.tfstate.d", e.Name(), "terraform.tfstate")
			if _, err := os.Stat(statePath); err == nil {
				names[e.Name()] = struct{}{}
			}
		}
	}
	for _, w := range cfg.Workspaces {
		if w = strings.TrimSpace(w); w != "" {
			names[w] = struct{}{}
		}
	}

	out := make([]models.WorkspaceInfo, 0, len(names))
	for name := range names {
		out = append(out, models.WorkspaceInfo{
			Name:    name,
			Current: name == cfg.Workspace,
		})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Name == DefaultWorkspace {
			return true
		}
		if out[j].Name == DefaultWorkspace {
			return false
		}
		return out[i].Name < out[j].Name
	})
	return out, nil
}

func listTFCWorkspaces(ctx context.Context, cfg Config) ([]models.WorkspaceInfo, error) {
	if cfg.Organization == "" {
		return nil, fmt.Errorf("tfc backend requires organization")
	}
	token := cfg.Token
	if token == "" {
		token = os.Getenv("TFE_TOKEN")
	}
	if token == "" {
		return nil, fmt.Errorf("tfc backend requires token")
	}
	host := cfg.Hostname
	if host == "" {
		host = "app.terraform.io"
	}

	client := &http.Client{Timeout: 20 * time.Second}
	u := fmt.Sprintf("https://%s/api/v2/organizations/%s/workspaces?page[size]=100",
		host, url.PathEscape(cfg.Organization))

	type page struct {
		Data []struct {
			Attributes struct {
				Name string `json:"name"`
			} `json:"attributes"`
		} `json:"data"`
		Links struct {
			Next string `json:"next"`
		} `json:"links"`
	}

	var out []models.WorkspaceInfo
	for u != "" {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", "application/vnd.api+json")
		resp, err := client.Do(req)
		if err != nil {
			return nil, err
		}
		body, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("tfc list workspaces: %s: %s", resp.Status, strings.TrimSpace(string(body)))
		}
		var p page
		if err := json.Unmarshal(body, &p); err != nil {
			return nil, err
		}
		for _, item := range p.Data {
			name := strings.TrimSpace(item.Attributes.Name)
			if name == "" {
				continue
			}
			out = append(out, models.WorkspaceInfo{
				Name:    name,
				Current: name == cfg.Workspace,
			})
		}
		u = p.Links.Next
	}
	if len(out) == 0 {
		return listConfiguredWorkspaces(cfg), nil
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out, nil
}

func localStatePath(cfg Config) (string, error) {
	if cfg.StateFile != "" {
		return filepath.Abs(cfg.StateFile)
	}
	if cfg.WorkingDir == "" {
		return "", fmt.Errorf("local backend requires working_dir")
	}
	abs, err := filepath.Abs(cfg.WorkingDir)
	if err != nil {
		return "", err
	}
	ws := cfg.Workspace
	if ws == "" {
		ws = DefaultWorkspace
	}
	if ws == DefaultWorkspace {
		return filepath.Join(abs, "terraform.tfstate"), nil
	}
	return filepath.Join(abs, "terraform.tfstate.d", ws, "terraform.tfstate"), nil
}
