package backend

import (
	"context"
	"errors"
	"fmt"
	"io"

	"github.com/Azure/azure-sdk-for-go/sdk/azcore"
	"github.com/Azure/azure-sdk-for-go/sdk/azidentity"
	"github.com/Azure/azure-sdk-for-go/sdk/storage/azblob"
	"github.com/NotHarshhaa/terraview/internal/engine"
)

// AzureBlobBackend reads a Terraform state file from an Azure Blob Storage
// container.
type AzureBlobBackend struct {
	account   string
	container string
	blob      string
}

func NewAzureBlob(cfg Config) (*AzureBlobBackend, error) {
	if cfg.StorageAccount == "" {
		return nil, errors.New("azureblob backend requires storage_account")
	}
	if cfg.Container == "" {
		return nil, errors.New("azureblob backend requires container")
	}
	key := cfg.Key
	if key == "" {
		key = "terraform.tfstate"
	}
	ws := cfg.Workspace
	if ws == "" {
		ws = DefaultWorkspace
	}
	return &AzureBlobBackend{
		account:   cfg.StorageAccount,
		container: cfg.Container,
		blob:      workspaceStateKey(key, ws),
	}, nil
}

func (a *AzureBlobBackend) LoadState(ctx context.Context) (io.ReadCloser, error) {
	serviceURL := fmt.Sprintf("https://%s.blob.core.windows.net/", a.account)
	cred, err := azidentity.NewDefaultAzureCredential(nil)
	if err != nil {
		return nil, fmt.Errorf("azure credentials: %w", err)
	}

	client, err := azblob.NewClient(serviceURL, cred, nil)
	if err != nil {
		return nil, fmt.Errorf("azure blob client: %w", err)
	}

	resp, err := client.DownloadStream(ctx, a.container, a.blob, nil)
	if err != nil {
		var respErr *azcore.ResponseError
		if errors.As(err, &respErr) && respErr.StatusCode == 404 {
			return nil, fmt.Errorf("%w: azureblob://%s/%s/%s", engine.ErrStateNotFound, a.account, a.container, a.blob)
		}
		return nil, fmt.Errorf("azure blob download: %w", err)
	}
	return resp.Body, nil
}

func (a *AzureBlobBackend) Name() string {
	return fmt.Sprintf("azureblob://%s/%s/%s", a.account, a.container, a.blob)
}
func (a *AzureBlobBackend) Type() string { return "azureblob" }
