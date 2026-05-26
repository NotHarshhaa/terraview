package backend

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

// TFCBackend fetches the current state version from a Terraform Cloud / HCP
// Terraform workspace. Unlike S3/GCS, this one is a thin enough HTTP
// integration that we can ship a working implementation without pulling in
// any SDK.
//
// The flow is the documented one:
//  1. GET /api/v2/organizations/{org}/workspaces/{ws} → workspace ID.
//  2. GET /api/v2/workspaces/{id}/current-state-version → state download URL.
//  3. GET <download URL> → the state JSON.
//
// All calls use the workspace's `Bearer` token.
type TFCBackend struct {
	hostname string
	org      string
	ws       string
	token    string
	http     *http.Client
}

func NewTFC(cfg Config) (*TFCBackend, error) {
	if cfg.Organization == "" || cfg.Workspace == "" {
		return nil, errors.New("tfc backend requires organization and workspace")
	}
	token := cfg.Token
	if token == "" {
		token = os.Getenv("TFE_TOKEN")
	}
	if token == "" {
		return nil, errors.New("tfc backend requires token (TFE_TOKEN env or config)")
	}
	host := cfg.Hostname
	if host == "" {
		host = "app.terraform.io"
	}
	return &TFCBackend{
		hostname: host,
		org:      cfg.Organization,
		ws:       cfg.Workspace,
		token:    token,
		http:     &http.Client{Timeout: 20 * time.Second},
	}, nil
}

func (t *TFCBackend) LoadState(ctx context.Context) (io.ReadCloser, error) {
	wsID, err := t.workspaceID(ctx)
	if err != nil {
		return nil, fmt.Errorf("tfc: look up workspace: %w", err)
	}
	downloadURL, err := t.currentStateDownloadURL(ctx, wsID)
	if err != nil {
		return nil, fmt.Errorf("tfc: resolve state download url: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, downloadURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+t.token)
	resp, err := t.http.Do(req)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		return nil, fmt.Errorf("tfc: download state: %s: %s", resp.Status, strings.TrimSpace(string(body)))
	}
	return resp.Body, nil
}

func (t *TFCBackend) workspaceID(ctx context.Context) (string, error) {
	u := fmt.Sprintf("https://%s/api/v2/organizations/%s/workspaces/%s",
		t.hostname, url.PathEscape(t.org), url.PathEscape(t.ws))
	var resp struct {
		Data struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := t.getJSON(ctx, u, &resp); err != nil {
		return "", err
	}
	if resp.Data.ID == "" {
		return "", errors.New("workspace id missing in response")
	}
	return resp.Data.ID, nil
}

func (t *TFCBackend) currentStateDownloadURL(ctx context.Context, wsID string) (string, error) {
	u := fmt.Sprintf("https://%s/api/v2/workspaces/%s/current-state-version", t.hostname, url.PathEscape(wsID))
	var resp struct {
		Data struct {
			Attributes struct {
				HostedStateDownloadURL string `json:"hosted-state-download-url"`
			} `json:"attributes"`
		} `json:"data"`
	}
	if err := t.getJSON(ctx, u, &resp); err != nil {
		return "", err
	}
	if resp.Data.Attributes.HostedStateDownloadURL == "" {
		return "", errors.New("hosted-state-download-url missing in response")
	}
	return resp.Data.Attributes.HostedStateDownloadURL, nil
}

func (t *TFCBackend) getJSON(ctx context.Context, u string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+t.token)
	req.Header.Set("Content-Type", "application/vnd.api+json")
	resp, err := t.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("%s: %s", resp.Status, strings.TrimSpace(string(body)))
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

func (t *TFCBackend) Name() string {
	return fmt.Sprintf("tfc:%s/%s/%s", t.hostname, t.org, t.ws)
}
func (t *TFCBackend) Type() string { return "tfc" }
