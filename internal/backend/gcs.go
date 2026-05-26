package backend

import (
	"context"
	"errors"
	"fmt"
	"io"

	"cloud.google.com/go/storage"
	"github.com/NotHarshhaa/terraview/internal/engine"
	"google.golang.org/api/option"
)

// GCSBackend reads a Terraform state file from a Google Cloud Storage bucket.
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

func (g *GCSBackend) LoadState(ctx context.Context) (io.ReadCloser, error) {
	client, err := storage.NewClient(ctx, option.WithScopes(storage.ScopeReadOnly))
	if err != nil {
		return nil, fmt.Errorf("gcs client: %w", err)
	}

	reader, err := client.Bucket(g.bucket).Object(g.object).NewReader(ctx)
	if err != nil {
		_ = client.Close()
		if errors.Is(err, storage.ErrObjectNotExist) {
			return nil, fmt.Errorf("%w: gs://%s/%s", engine.ErrStateNotFound, g.bucket, g.object)
		}
		return nil, fmt.Errorf("gcs read: %w", err)
	}
	return &gcsReadCloser{Reader: reader, client: client}, nil
}

type gcsReadCloser struct {
	*storage.Reader
	client *storage.Client
}

func (r *gcsReadCloser) Close() error {
	err := r.Reader.Close()
	_ = r.client.Close()
	return err
}

func (g *GCSBackend) Name() string { return fmt.Sprintf("gs://%s/%s", g.bucket, g.object) }
func (g *GCSBackend) Type() string { return "gcs" }
