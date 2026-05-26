package engine_test

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/NotHarshhaa/terraview/internal/backend"
	"github.com/NotHarshhaa/terraview/internal/engine"
	"github.com/NotHarshhaa/terraview/internal/models"
)

// TestSampleProject is the integration safety net: it walks the testdata
// project through the entire pipeline (HCL → state → classifier → snapshot)
// and asserts that every status documented in testdata/sample-project/README.md
// actually surfaces. If you tweak the classifier or categorizer, this test
// will catch the screenshot drift before the README does.
func TestSampleProject(t *testing.T) {
	root := findRepoRoot(t)
	workingDir := filepath.Join(root, "testdata", "sample-project")

	be, err := backend.New(backend.Config{
		Type:       "local",
		WorkingDir: workingDir,
	})
	if err != nil {
		t.Fatalf("backend.New: %v", err)
	}

	snap, err := engine.New().Refresh(context.Background(), engine.Options{
		WorkingDir: workingDir,
		Backend:    be,
	})
	if err != nil {
		t.Fatalf("Refresh: %v", err)
	}

	if len(snap.Errors) > 0 {
		t.Logf("non-fatal warnings: %+v", snap.Errors)
	}

	want := map[string]models.Status{
		"aws_vpc.main":                       models.StatusCreated,
		"aws_subnet.private_a":               models.StatusCreated,
		"aws_security_group.alb":             models.StatusUnmanaged,
		"aws_instance.web_server":            models.StatusCreated,
		"aws_instance.bastion":               models.StatusInactive,
		"aws_rds_instance.postgres":          models.StatusCreated,
		"aws_s3_bucket.assets":               models.StatusCreated,
		"aws_iam_role.ec2":                   models.StatusCreated,
		"aws_lambda_function.image_resize":   models.StatusCreated,
	}

	got := map[string]models.Status{}
	for _, r := range snap.Resources {
		got[r.Address] = r.Status
	}

	for addr, expected := range want {
		actual, ok := got[addr]
		if !ok {
			t.Errorf("resource %q missing from snapshot", addr)
			continue
		}
		if actual != expected {
			t.Errorf("resource %q: status = %q, want %q", addr, actual, expected)
		}
	}

	if snap.Summary.Total != len(got) {
		t.Errorf("summary total = %d, want %d", snap.Summary.Total, len(got))
	}
}

func TestCategoryEngine(t *testing.T) {
	cases := []struct {
		in       string
		provider string
		service  string
	}{
		{"aws_instance", "AWS", "Compute"},
		{"aws_vpc", "AWS", "Networking"},
		{"aws_subnet", "AWS", "Networking"},
		{"aws_security_group", "AWS", "Networking"},
		{"aws_rds_instance", "AWS", "Databases"},
		{"aws_dynamodb_table", "AWS", "Databases"},
		{"aws_s3_bucket", "AWS", "Storage"},
		{"aws_iam_role", "AWS", "Security & IAM"},
		{"aws_lambda_function", "AWS", "Serverless"},
		{"aws_eks_cluster", "AWS", "Containers"},
		{"aws_alb", "AWS", "Load Balancing & CDN"},
		{"google_compute_instance", "GCP", "Compute"},
		{"google_sql_database", "GCP", "Databases"},
		{"google_container_cluster", "GCP", "Kubernetes"},
		{"azurerm_virtual_machine", "Azure", "Compute"},
		{"azurerm_storage_account", "Azure", "Storage"},
		{"kubernetes_deployment", "Kubernetes", "Workloads"},
		{"kubernetes_service", "Kubernetes", "Networking"},
		{"vault_policy", "Vault", "Other"},
	}
	for _, c := range cases {
		cat := engine.Categorize(c.in)
		if cat.Provider != c.provider || cat.Service != c.service {
			t.Errorf("Categorize(%q) = (%q,%q), want (%q,%q)",
				c.in, cat.Provider, cat.Service, c.provider, c.service)
		}
	}
}

// findRepoRoot walks up from the test's working directory until it finds the
// go.mod, so the test passes whether it's invoked from the repo root or from
// within the package.
func findRepoRoot(t *testing.T) string {
	t.Helper()
	wd, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}
	dir := wd
	for {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			t.Fatalf("could not find go.mod above %s", wd)
		}
		dir = parent
	}
}
