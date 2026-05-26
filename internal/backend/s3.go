package backend

import (
	"context"
	"errors"
	"fmt"
	"io"
)

// S3Backend reads a Terraform state file from an S3 bucket, optionally
// honouring a DynamoDB lock table for the canonical state path lookup.
//
// The actual AWS SDK calls are not wired up in this skeleton to keep the
// dependency footprint minimal. The struct + constructor exist so the wiring
// in api/cmd is complete and the SDK can be dropped in here without touching
// any caller. The TODO below explains exactly what to add.
type S3Backend struct {
	bucket   string
	key      string
	region   string
	endpoint string // optional override (S3-compatible stores)
	lockTbl  string
}

// NewS3 validates the config and returns a configured (but un-implemented)
// S3 backend. We deliberately error out on LoadState rather than at
// construction so dashboards relying on `terraview serve` can still come up
// in read-only mode and report a clear status in the UI.
func NewS3(cfg Config) (*S3Backend, error) {
	if cfg.Bucket == "" {
		return nil, errors.New("s3 backend requires bucket")
	}
	if cfg.Key == "" {
		return nil, errors.New("s3 backend requires key")
	}
	return &S3Backend{
		bucket:   cfg.Bucket,
		key:      cfg.Key,
		region:   cfg.Region,
		endpoint: cfg.Endpoint,
		lockTbl:  cfg.DynamoDBTable,
	}, nil
}

// LoadState is a stub. The production implementation should:
//  1. Build an aws-sdk-go-v2 config honouring the standard credential chain
//     (env vars, shared profile, IRSA, IMDS, AssumeRole via `AWS_PROFILE`).
//  2. Optionally probe the DynamoDB lock table to detect an active apply and
//     surface that in the snapshot (so the UI can show "🔒 Apply in
//     progress").
//  3. s3:GetObject the configured bucket/key and return the body verbatim.
func (s *S3Backend) LoadState(ctx context.Context) (io.ReadCloser, error) {
	return nil, fmt.Errorf("s3 backend not yet implemented: configure aws-sdk-go-v2 and wire s3:GetObject for s3://%s/%s", s.bucket, s.key)
}

func (s *S3Backend) Name() string { return fmt.Sprintf("s3://%s/%s", s.bucket, s.key) }
func (s *S3Backend) Type() string { return "s3" }
