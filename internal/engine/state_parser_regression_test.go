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

func TestRefreshReconcilesStringForEachStateWithPlanAndPreservesProvider(t *testing.T) {
	workingDir := t.TempDir()
	state := `{
		"version": 4,
		"resources": [{
			"mode": "managed",
			"type": "aws_instance",
			"name": "web",
			"provider": "provider[\"registry.terraform.io/hashicorp/aws\"]",
			"instances": [{
				"index_key": "blue",
				"attributes": {"id": "i-blue", "instance_state": "running"}
			}]
		}]
	}`
	if err := os.WriteFile(filepath.Join(workingDir, "terraform.tfstate"), []byte(state), 0o644); err != nil {
		t.Fatal(err)
	}
	plan := `{
		"resource_changes": [{
			"address": "aws_instance.web[\"blue\"]",
			"type": "aws_instance",
			"name": "web",
			"mode": "managed",
			"change": {"actions": ["update"]}
		}]
	}`
	planPath := filepath.Join(workingDir, "plan.json")
	if err := os.WriteFile(planPath, []byte(plan), 0o644); err != nil {
		t.Fatal(err)
	}

	be, err := backend.New(backend.Config{Type: "local", WorkingDir: workingDir})
	if err != nil {
		t.Fatalf("backend.New: %v", err)
	}
	snapshot, err := engine.New().Refresh(context.Background(), engine.Options{
		WorkingDir: workingDir,
		Backend:    be,
		PlanPath:   planPath,
	})
	if err != nil {
		t.Fatalf("Refresh: %v", err)
	}
	if len(snapshot.Resources) != 1 {
		t.Fatalf("resource count = %d, want one reconciled resource: %+v", len(snapshot.Resources), snapshot.Resources)
	}
	resource := snapshot.Resources[0]
	if resource.Address != `aws_instance.web["blue"]` {
		t.Fatalf("address = %q, want Terraform for_each address", resource.Address)
	}
	if resource.Provider != "aws" {
		t.Fatalf("provider = %q, want aws", resource.Provider)
	}
	if resource.Status != models.StatusPendingUpdate || resource.PlanAction != "update" {
		t.Fatalf("plan reconciliation = status %q, action %q; want pending update", resource.Status, resource.PlanAction)
	}
}

func TestParseStateExtractsDefaultAndNestedMetadataTags(t *testing.T) {
	state := `{
		"version": 4,
		"resources": [
			{
				"mode": "managed",
				"type": "aws_instance",
				"name": "web",
				"instances": [{"attributes": {
					"tags_all": {"Environment": "default", "Team": "platform"},
					"tags": {"Environment": "production"}
				}}]
			},
			{
				"mode": "managed",
				"type": "kubernetes_deployment",
				"name": "api",
				"instances": [{"attributes": {
					"metadata": [{"labels": {"App": "api", "Environment": "staging"}}]
				}}]
			}
		]
	}`
	resources, err := engine.ParseStateJSON(strings.NewReader(state))
	if err != nil {
		t.Fatalf("ParseStateJSON: %v", err)
	}
	if len(resources) != 2 {
		t.Fatalf("resource count = %d, want 2", len(resources))
	}
	if got := resources[0].Tags; got["environment"] != "production" || got["team"] != "platform" {
		t.Fatalf("AWS tags = %#v, want explicit tags merged over tags_all", got)
	}
	if got := resources[1].Tags; got["app"] != "api" || got["environment"] != "staging" {
		t.Fatalf("Kubernetes metadata labels = %#v", got)
	}
}
