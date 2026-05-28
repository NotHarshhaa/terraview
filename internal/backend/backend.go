// Package backend hosts the adapters that fetch a Terraform state file from
// wherever a project keeps it: local disk, S3, GCS, Azure Blob, Terraform
// Cloud, ... All adapters satisfy engine.StateLoader, but to keep the
// package boundary clean we redeclare the interface here (and the engine
// imports nothing from backend).
package backend

import (
	"context"
	"fmt"
	"io"
	"strings"
)

// Backend reads the latest Terraform state from somewhere.
type Backend interface {
	// LoadState returns the raw JSON contents of the latest state file.
	LoadState(ctx context.Context) (io.ReadCloser, error)

	// Name is a human-readable description used in the UI status bar
	// (e.g. "local:/path/to/terraform.tfstate", "s3://bucket/key").
	Name() string

	// Type returns the canonical kind ("local", "s3", "gcs", "azureblob", "tfc").
	Type() string
}

// Config is the union of every backend's configuration. Only the fields that
// apply to the chosen Type need to be set.
type Config struct {
	Type string `yaml:"type" json:"type"`

	// Local
	StateFile  string `yaml:"state_file" json:"state_file"`
	WorkingDir string `yaml:"working_dir" json:"working_dir"`

	// S3 / GCS
	Bucket         string `yaml:"bucket" json:"bucket"`
	Key            string `yaml:"key" json:"key"`
	Region         string `yaml:"region" json:"region"`
	DynamoDBTable  string `yaml:"dynamodb_table" json:"dynamodb_table"`
	Endpoint       string `yaml:"endpoint" json:"endpoint"`

	// Azure Blob
	StorageAccount string `yaml:"storage_account" json:"storage_account"`
	Container      string `yaml:"container" json:"container"`

	// Terraform Cloud / HCP Terraform
	Organization string `yaml:"organization" json:"organization"`
	Workspace    string `yaml:"workspace" json:"workspace"`
	Workspaces   []string `yaml:"workspaces" json:"workspaces"` // optional explicit list (remote backends)
	Token        string `yaml:"token" json:"token"`
	Hostname     string `yaml:"hostname" json:"hostname"` // defaults to app.terraform.io
}

// New constructs the right Backend for the given config. Returns a clear
// error for kinds that are recognised but not yet implemented so the CLI
// can surface a useful hint instead of crashing.
func New(cfg Config) (Backend, error) {
	switch strings.ToLower(strings.TrimSpace(cfg.Type)) {
	case "", "local":
		return NewLocal(cfg)
	case "s3":
		return NewS3(cfg)
	case "gcs":
		return NewGCS(cfg)
	case "azureblob", "azurerm":
		return NewAzureBlob(cfg)
	case "tfc", "remote", "cloud":
		return NewTFC(cfg)
	default:
		return nil, fmt.Errorf("unknown backend type %q (supported: local, s3, gcs, azureblob, tfc)", cfg.Type)
	}
}
