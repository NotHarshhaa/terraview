package backend

import (
	"context"
	"errors"
	"fmt"
	"io"
)

// AzureBlobBackend reads a Terraform state file from an Azure Blob Storage
// container. The README labels this as 🚧 in progress; the constructor
// validates config and the LoadState stub points at exactly where to plug in
// github.com/Azure/azure-sdk-for-go/sdk/storage/azblob.
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
	return &AzureBlobBackend{
		account:   cfg.StorageAccount,
		container: cfg.Container,
		blob:      key,
	}, nil
}

func (a *AzureBlobBackend) LoadState(ctx context.Context) (io.ReadCloser, error) {
	return nil, fmt.Errorf("azureblob backend not yet implemented: wire azblob.NewClient for https://%s.blob.core.windows.net/%s/%s", a.account, a.container, a.blob)
}

func (a *AzureBlobBackend) Name() string {
	return fmt.Sprintf("azureblob://%s/%s/%s", a.account, a.container, a.blob)
}
func (a *AzureBlobBackend) Type() string { return "azureblob" }
