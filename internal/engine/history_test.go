package engine

import (
	"strings"
	"testing"

	"github.com/NotHarshhaa/terraview/internal/models"
)

func TestHistoryStoreRecord(t *testing.T) {
	h := NewHistoryStore(10)
	resources := []models.Resource{
		{
			Address: "aws_instance.web",
			Type:    "aws_instance",
			Status:  models.StatusCreated,
			Attributes: map[string]string{
				"instance_type": "t3.micro",
			},
			Tags: map[string]string{"Environment": "dev"},
		},
	}

	versions := h.Record("default", 1, resources)
	if len(versions) != 1 {
		t.Fatalf("expected 1 version, got %d", len(versions))
	}
	if versions[0].ResourceCount != 1 {
		t.Fatalf("expected 1 resource, got %d", versions[0].ResourceCount)
	}

	updated := append([]models.Resource(nil), resources...)
	updated[0].Attributes["instance_type"] = "t3.small"
	versions = h.Record("default", 2, updated)
	if len(versions) != 2 {
		t.Fatalf("expected 2 versions, got %d", len(versions))
	}

	events := h.ResourceTimeline("default", "aws_instance.web")
	if len(events) < 2 {
		t.Fatalf("expected at least 2 events, got %d", len(events))
	}
	if events[0].Action != "updated" {
		t.Fatalf("expected latest event updated, got %q", events[0].Action)
	}
}

func TestParseDriftPlanJSON(t *testing.T) {
	raw := `{
	  "resource_changes": [
	    {
	      "address": "aws_instance.web",
	      "mode": "managed",
	      "change": {
	        "actions": ["update"],
	        "before": {"instance_type": "t3.micro"},
	        "after": {"instance_type": "t3.small"}
	      }
	    }
	  ]
	}`
	drift, err := ParseDriftPlanJSON(strings.NewReader(raw))
	if err != nil {
		t.Fatal(err)
	}
	if len(drift) != 1 {
		t.Fatalf("expected 1 drift entry, got %d", len(drift))
	}
	info := drift["aws_instance.web"]
	if len(info.ChangedAttrs) == 0 {
		t.Fatal("expected changed attributes")
	}
}
