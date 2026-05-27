package api

import (
	"testing"

	"github.com/NotHarshhaa/terraview/internal/models"
)

func TestFilterResourcesByTag(t *testing.T) {
	resources := []models.Resource{
		{
			Address: "aws_instance.a",
			Tags:    map[string]string{"env": "prod", "team": "platform"},
			Status:  models.StatusCreated,
			Category: models.Category{Provider: "aws", Service: "Compute"},
		},
		{
			Address: "aws_instance.b",
			Tags:    map[string]string{"env": "dev"},
			Status:  models.StatusCreated,
			Category: models.Category{Provider: "aws", Service: "Compute"},
		},
	}

	filtered := FilterResources(resources, ResourceFilter{
		Tags: map[string]bool{"env=prod": true},
	})
	if len(filtered) != 1 || filtered[0].Address != "aws_instance.a" {
		t.Fatalf("expected one prod resource, got %+v", filtered)
	}

	filtered = FilterResources(resources, ResourceFilter{
		Tags: map[string]bool{"env": true},
	})
	if len(filtered) != 2 {
		t.Fatalf("expected two resources with env tag, got %d", len(filtered))
	}
}

func TestFilterResourcesPagination(t *testing.T) {
	resources := []models.Resource{
		{Address: "a", Status: models.StatusCreated},
		{Address: "b", Status: models.StatusCreated},
		{Address: "c", Status: models.StatusCreated},
	}

	page := FilterResources(resources, ResourceFilter{Limit: 2, Offset: 1})
	if len(page) != 2 || page[0].Address != "b" || page[1].Address != "c" {
		t.Fatalf("unexpected page: %+v", page)
	}
}

func TestBuildFacets(t *testing.T) {
	facets := BuildFacets([]models.Resource{
		{
			Address: "aws_instance.a",
			Module:  "//network",
			Status:  models.StatusDrifted,
			Category: models.Category{Provider: "aws", Service: "Compute"},
			Tags:    map[string]string{"env": "prod"},
		},
		{
			Address: "aws_instance.b",
			Status:  models.StatusCreated,
			Category: models.Category{Provider: "aws", Service: "Compute"},
		},
	})

	if len(facets.Providers) != 1 || facets.Providers[0].Value != "aws" {
		t.Fatalf("providers: %+v", facets.Providers)
	}
	if len(facets.Modules) != 2 {
		t.Fatalf("modules: %+v", facets.Modules)
	}
	if len(facets.Tags) != 1 || facets.Tags[0].Value != "env=prod" {
		t.Fatalf("tags: %+v", facets.Tags)
	}
}
