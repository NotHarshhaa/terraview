package backend

import (
	"context"
	"errors"
	"fmt"
	"io"

	"github.com/NotHarshhaa/terraview/internal/engine"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
)

// S3Backend reads a Terraform state file from an S3 bucket.
type S3Backend struct {
	bucket    string
	key       string
	baseKey   string
	workspace string
	region    string
	endpoint  string // optional override (S3-compatible stores)
	lockTbl   string
}

// NewS3 validates the config and returns a configured S3 backend.
func NewS3(cfg Config) (*S3Backend, error) {
	if cfg.Bucket == "" {
		return nil, errors.New("s3 backend requires bucket")
	}
	if cfg.Key == "" {
		return nil, errors.New("s3 backend requires key")
	}
	ws := cfg.Workspace
	if ws == "" {
		ws = DefaultWorkspace
	}
	return &S3Backend{
		bucket:    cfg.Bucket,
		key:       workspaceStateKey(cfg.Key, ws),
		baseKey:   cfg.Key,
		workspace: ws,
		region:    cfg.Region,
		endpoint:  cfg.Endpoint,
		lockTbl:   cfg.DynamoDBTable,
	}, nil
}

func (s *S3Backend) LoadState(ctx context.Context) (io.ReadCloser, error) {
	loadOpts := []func(*config.LoadOptions) error{}
	if s.region != "" {
		loadOpts = append(loadOpts, config.WithRegion(s.region))
	}
	awsCfg, err := config.LoadDefaultConfig(ctx, loadOpts...)
	if err != nil {
		return nil, fmt.Errorf("aws config: %w", err)
	}

	client := s3.NewFromConfig(awsCfg, func(o *s3.Options) {
		if s.endpoint != "" {
			o.BaseEndpoint = aws.String(s.endpoint)
			o.UsePathStyle = true
		}
	})

	out, err := client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(s.key),
	})
	if err != nil {
		var nsk *types.NoSuchKey
		var nsb *types.NoSuchBucket
		if errors.As(err, &nsk) || errors.As(err, &nsb) {
			return nil, fmt.Errorf("%w: s3://%s/%s", engine.ErrStateNotFound, s.bucket, s.key)
		}
		return nil, fmt.Errorf("s3 get object: %w", err)
	}
	return out.Body, nil
}

func (s *S3Backend) Name() string { return fmt.Sprintf("s3://%s/%s", s.bucket, s.key) }
func (s *S3Backend) Type() string { return "s3" }
