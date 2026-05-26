package engine_test

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/NotHarshhaa/terraview/internal/backend"
	"github.com/NotHarshhaa/terraview/internal/engine"
	"github.com/NotHarshhaa/terraview/internal/models"
)

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
		"aws_vpc.main":                     models.StatusCreated,
		"aws_subnet.private_a":             models.StatusCreated,
		"aws_security_group.alb":           models.StatusUnmanaged,
		"aws_instance.web_server":          models.StatusCreated,
		"aws_instance.bastion":             models.StatusInactive,
		"aws_rds_instance.postgres":        models.StatusCreated,
		"aws_s3_bucket.assets":             models.StatusCreated,
		"aws_iam_role.ec2":                 models.StatusCreated,
		"aws_lambda_function.image_resize": models.StatusCreated,
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

func TestParseEmptyStateV4(t *testing.T) {
	raw := `{"version":4,"terraform_version":"1.5.0","serial":1,"lineage":"abc","resources":[]}`
	got, err := engine.ParseStateJSON(strings.NewReader(raw))
	if err != nil {
		t.Fatalf("ParseStateJSON: %v", err)
	}
	if len(got) != 0 {
		t.Fatalf("expected empty resources, got %d", len(got))
	}
}

func TestParsePlanDeleteOnly(t *testing.T) {
	raw := `{
		"resource_changes": [{
			"address": "aws_instance.web",
			"type": "aws_instance",
			"name": "web",
			"mode": "managed",
			"change": { "actions": ["delete", "read"] }
		}]
	}`
	got, err := engine.ParsePlanJSON(strings.NewReader(raw))
	if err != nil {
		t.Fatalf("ParsePlanJSON: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("expected 1 change, got %d", len(got))
	}
	if got[0].Action != engine.PlanActionDelete {
		t.Fatalf("action = %q, want delete", got[0].Action)
	}
}

func TestHCLBlockCommentSameLine(t *testing.T) {
	root := t.TempDir()
	tf := filepath.Join(root, "main.tf")
	content := `/* legacy */ resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
}
`
	if err := os.WriteFile(tf, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
	res := engine.ParseHCLDir(root)
	if len(res.Resources) != 1 {
		t.Fatalf("expected 1 resource, got %d (%v)", len(res.Resources), res.Resources)
	}
	if res.Resources[0].Address() != "aws_vpc.main" {
		t.Fatalf("address = %q", res.Resources[0].Address())
	}
}

func TestModuleSourceMapping(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "main.tf"), []byte(`
module "networking" {
  source = "./modules/networking"
}
`), 0o644); err != nil {
		t.Fatal(err)
	}
	modDir := filepath.Join(root, "modules", "networking")
	if err := os.MkdirAll(modDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(modDir, "vpc.tf"), []byte(`
resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
}
`), 0o644); err != nil {
		t.Fatal(err)
	}

	res := engine.ParseHCLDir(root)
	var vpc *engine.DeclaredResource
	for i := range res.Resources {
		if res.Resources[i].Type == "aws_vpc" {
			vpc = &res.Resources[i]
			break
		}
	}
	if vpc == nil {
		t.Fatal("aws_vpc not found")
	}
	if vpc.Address() != "module.networking.aws_vpc.main" {
		t.Fatalf("address = %q, want module.networking.aws_vpc.main", vpc.Address())
	}
}

func TestParsePlanDrift(t *testing.T) {
	raw := `{
		"resource_drift": [{
			"address": "aws_instance.web",
			"type": "aws_instance",
			"name": "web",
			"mode": "managed",
			"change": {
				"actions": ["update"],
				"before": { "instance_type": "t3.micro", "tags": {"Name": "web"} },
				"after": { "instance_type": "t3.small", "tags": {"Name": "web"} }
			}
		}]
	}`
	res, err := engine.ParsePlanFull(strings.NewReader(raw))
	if err != nil {
		t.Fatalf("ParsePlanFull: %v", err)
	}
	if len(res.Drift) != 1 {
		t.Fatalf("expected 1 drift entry, got %d", len(res.Drift))
	}
	d, ok := res.Drift["aws_instance.web"]
	if !ok {
		t.Fatal("drift missing for aws_instance.web")
	}
	if !strings.Contains(d.Reason, "instance_type") {
		t.Fatalf("reason = %q, want instance_type mentioned", d.Reason)
	}
}

func TestClassifyDrifted(t *testing.T) {
	state := &engine.StateResource{
		Address:     "aws_instance.web",
		Type:        "aws_instance",
		Name:        "web",
		Drifted:     true,
		DriftReason: "drifted: instance_type",
	}
	status, reason := engine.Classify(nil, state, nil)
	if status != models.StatusDrifted {
		t.Fatalf("status = %q, want drifted", status)
	}
	if reason == "" {
		t.Fatal("expected drift reason")
	}
}

func TestEngineAppliesPlanDrift(t *testing.T) {
	root := t.TempDir()
	workingDir := filepath.Join(root, "project")
	if err := os.MkdirAll(workingDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(workingDir, "main.tf"), []byte(`
resource "aws_instance" "web" {
  ami = "ami-123"
}
`), 0o644); err != nil {
		t.Fatal(err)
	}
	stateJSON := `{
		"version": 4,
		"terraform_version": "1.5.0",
		"resources": [{
			"mode": "managed",
			"type": "aws_instance",
			"name": "web",
			"provider": "provider[\"registry.terraform.io/hashicorp/aws\"]",
			"instances": [{
				"attributes": {
					"id": "i-abc",
					"instance_type": "t3.micro",
					"instance_state": "running"
				}
			}]
		}]
	}`
	if err := os.WriteFile(filepath.Join(workingDir, "terraform.tfstate"), []byte(stateJSON), 0o644); err != nil {
		t.Fatal(err)
	}
	planJSON := `{
		"resource_drift": [{
			"address": "aws_instance.web",
			"type": "aws_instance",
			"name": "web",
			"mode": "managed",
			"change": {
				"actions": ["update"],
				"before": { "instance_type": "t3.micro" },
				"after": { "instance_type": "t3.small" }
			}
		}]
	}`
	planPath := filepath.Join(root, "plan.json")
	if err := os.WriteFile(planPath, []byte(planJSON), 0o644); err != nil {
		t.Fatal(err)
	}

	be, err := backend.New(backend.Config{Type: "local", WorkingDir: workingDir})
	if err != nil {
		t.Fatalf("backend.New: %v", err)
	}
	snap, err := engine.New().Refresh(context.Background(), engine.Options{
		WorkingDir: workingDir,
		Backend:    be,
		PlanPath:   planPath,
	})
	if err != nil {
		t.Fatalf("Refresh: %v", err)
	}
	var found bool
	for _, r := range snap.Resources {
		if r.Address == "aws_instance.web" {
			found = true
			if r.Status != models.StatusDrifted {
				t.Fatalf("status = %q, want drifted", r.Status)
			}
		}
	}
	if !found {
		t.Fatal("aws_instance.web not found in snapshot")
	}
}

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
