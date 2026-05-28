package engine

import (
	"sort"
	"strings"

	"github.com/NotHarshhaa/terraview/internal/models"
)

// BuildDependencyGraph derives a directed graph from resource depends_on lists.
func BuildDependencyGraph(resources []models.Resource) models.DependencyGraph {
	known := make(map[string]struct{}, len(resources))
	for _, r := range resources {
		known[r.Address] = struct{}{}
	}

	edgeSet := map[string]models.DependencyEdge{}
	for _, r := range resources {
		for _, dep := range r.DependsOn {
			if dep == r.Address {
				continue
			}
			if _, ok := known[dep]; !ok {
				continue
			}
			key := dep + "->" + r.Address
			edgeSet[key] = models.DependencyEdge{From: dep, To: r.Address}
		}
	}

	edges := make([]models.DependencyEdge, 0, len(edgeSet))
	for _, e := range edgeSet {
		edges = append(edges, e)
	}
	sort.Slice(edges, func(i, j int) bool {
		if edges[i].From == edges[j].From {
			return edges[i].To < edges[j].To
		}
		return edges[i].From < edges[j].From
	})
	return models.DependencyGraph{Edges: edges}
}

func mergeDependsOn(state *StateResource, decl *DeclaredResource) []string {
	set := map[string]struct{}{}
	add := func(items ...string) {
		for _, item := range items {
			item = normaliseDepAddress(item)
			if item != "" {
				set[item] = struct{}{}
			}
		}
	}
	if state != nil {
		add(state.DependsOn...)
	}
	if decl != nil {
		add(decl.DependsOn...)
	}
	if len(set) == 0 {
		return nil
	}
	out := make([]string, 0, len(set))
	for k := range set {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

func normaliseDepAddress(addr string) string {
	addr = strings.TrimSpace(addr)
	if addr == "" {
		return ""
	}
	// Trim attribute/index suffixes: aws_vpc.main.id -> aws_vpc.main
	for strings.Count(addr, ".") >= 2 {
		if i := strings.LastIndex(addr, "."); i > 0 {
			addr = addr[:i]
			continue
		}
		break
	}
	if !looksLikeResourceAddress(addr) {
		return ""
	}
	return addr
}

func looksLikeResourceAddress(addr string) bool {
	parts := strings.Split(addr, ".")
	if len(parts) < 2 {
		return false
	}
	// module.network.aws_instance.web
	for i := 0; i < len(parts)-2; i += 2 {
		if parts[i] != "module" {
			return false
		}
	}
	typePart := parts[len(parts)-2]
	if strings.HasPrefix(typePart, "module.") {
		return true
	}
	return strings.Contains(typePart, "_")
}
