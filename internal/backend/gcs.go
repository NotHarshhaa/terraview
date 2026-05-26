package backend

import (
	"context"
	"errors"
	"fmt"
	"io"
)

// GCSBackend reads a Terraform state file from a Google Cloud Storage bucket.
//
// Like the S3 adapter, the actual cloud SDK calls are left as a stub so the
// project stays dependency-light by default. Drop in cloud.google.com/go/storage
// and use Application Default Credentials.
type GCSBackend struct {
	bucket string
	object string
}

func NewGCS(cfg Config) (*GCSBackend, error) {
	if cfg.Bucket == "" {
		return nil, errors.New("gcs backend requires bucket")
	}
	key := cfg.Key
	if key == "" {
		key = "default.tfstate"
	}
	return &GCSBackend{bucket: cfg.Bucket, object: key}, nil
}

// LoadState is a stub. The production implementation should:
//  1. storage.NewClient(ctx) — picks up ADC (GOOGLE_APPLICATION_CREDENTIALS or
//     Workload Identity).
//  2. client.Bucket(b.bucket).Object(b.object).NewReader(ctx).
func (g *GCSBackend) LoadState(ctx context.Context) (io.ReadCloser, error) {
	return nil, fmt.Errorf("gcs backend not yet implemented: wire cloud.google.com/go/storage for gs://%s/%s", g.bucket, g.object)
}

func (g *GCSBackend) Name() string { return fmt.Sprintf("gs://%s/%s", g.bucket, g.object) }
func (g *GCSBackend) Type() string { return "gcs" }
