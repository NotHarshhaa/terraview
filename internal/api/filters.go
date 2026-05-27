package api

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/NotHarshhaa/terraview/internal/models"
)

// ResourceFilter captures query parameters for listing resources.
type ResourceFilter struct {
	Statuses   map[string]bool
	Providers  map[string]bool
	Modules    map[string]bool
	Categories map[string]bool
	Tags       map[string]bool
	Search     string
	Address    string
	Limit      int
	Offset     int
}

// ParseResourceFilter reads filter params from an HTTP request.
func ParseResourceFilter(r *http.Request) ResourceFilter {
	q := r.URL.Query()
	limit := 0
	if v := strings.TrimSpace(q.Get("limit")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			limit = n
		}
	}
	offset := 0
	if v := strings.TrimSpace(q.Get("offset")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			offset = n
		}
	}
	return ResourceFilter{
		Statuses:   splitCSVSet(q.Get("status")),
		Providers:  splitCSVSet(strings.ToLower(q.Get("provider"))),
		Modules:    splitCSVSet(q.Get("module")),
		Categories: splitCSVSet(q.Get("category")),
		Tags:       splitCSVSet(q.Get("tag")),
		Search:     strings.ToLower(strings.TrimSpace(q.Get("q"))),
		Address:    strings.TrimSpace(q.Get("address")),
		Limit:      limit,
		Offset:     offset,
	}
}

// FilterResources returns resources matching f. When f.Address is set, only
// that exact address is considered (other filters still apply).
func FilterResources(resources []models.Resource, f ResourceFilter) []models.Resource {
	filtered := resources[:0:0]
	for _, res := range resources {
		if f.Address != "" && res.Address != f.Address {
			continue
		}
		if len(f.Statuses) > 0 && !f.Statuses[string(res.Status)] {
			continue
		}
		if len(f.Providers) > 0 && !f.Providers[strings.ToLower(res.Category.Provider)] {
			continue
		}
		if len(f.Modules) > 0 && !matchModuleFilter(res.Module, f.Modules) {
			continue
		}
		if len(f.Categories) > 0 && !f.Categories[res.Category.Service] {
			continue
		}
		if len(f.Tags) > 0 && !matchesTagFilter(res, f.Tags) {
			continue
		}
		if f.Search != "" && !matchesSearch(res, f.Search) {
			continue
		}
		filtered = append(filtered, res)
	}
	if f.Offset > 0 {
		if f.Offset >= len(filtered) {
			return nil
		}
		filtered = filtered[f.Offset:]
	}
	if f.Limit > 0 && len(filtered) > f.Limit {
		filtered = filtered[:f.Limit]
	}
	return filtered
}

func matchesTagFilter(r models.Resource, allowed map[string]bool) bool {
	if len(r.Tags) == 0 {
		return false
	}
	for tag := range allowed {
		eq := strings.Index(tag, "=")
		if eq < 0 {
			// Match tag key only.
			key := strings.ToLower(strings.TrimSpace(tag))
			for k := range r.Tags {
				if strings.ToLower(k) == key {
					return true
				}
			}
			continue
		}
		key := strings.ToLower(strings.TrimSpace(tag[:eq]))
		val := tag[eq+1:]
		if v, ok := r.Tags[key]; ok && v == val {
			return true
		}
		// Also try case-insensitive key lookup.
		for k, v := range r.Tags {
			if strings.ToLower(k) == key && v == val {
				return true
			}
		}
	}
	return false
}

// FacetCount is a label/value pair with an occurrence count.
type FacetCount struct {
	Value string `json:"value"`
	Count int    `json:"count"`
}

// Facets aggregates filter dimensions from a resource list.
type Facets struct {
	Providers  []FacetCount `json:"providers"`
	Categories []FacetCount `json:"categories"`
	Modules    []FacetCount `json:"modules"`
	Tags       []FacetCount `json:"tags"`
	Statuses   []FacetCount `json:"statuses"`
}

// BuildFacets counts facet values across resources.
func BuildFacets(resources []models.Resource) Facets {
	providerCounts := map[string]int{}
	categoryCounts := map[string]int{}
	moduleCounts := map[string]int{}
	tagCounts := map[string]int{}
	statusCounts := map[string]int{}

	for _, r := range resources {
		if r.Category.Provider != "" {
			providerCounts[r.Category.Provider]++
		}
		if r.Category.Service != "" {
			categoryCounts[r.Category.Service]++
		}
		moduleCounts[moduleFilterValue(r.Module)]++
		statusCounts[string(r.Status)]++
		for k, v := range r.Tags {
			tagCounts[k+"="+v]++
		}
	}

	return Facets{
		Providers:  facetCountsFromMap(providerCounts),
		Categories: facetCountsFromMap(categoryCounts),
		Modules:    facetCountsFromMap(moduleCounts),
		Tags:       facetCountsFromMap(tagCounts),
		Statuses:   facetCountsFromMap(statusCounts),
	}
}

func facetCountsFromMap(m map[string]int) []FacetCount {
	out := make([]FacetCount, 0, len(m))
	for value, count := range m {
		out = append(out, FacetCount{Value: value, Count: count})
	}
	sortFacetCounts(out)
	return out
}

func sortFacetCounts(items []FacetCount) {
	for i := 0; i < len(items); i++ {
		for j := i + 1; j < len(items); j++ {
			if items[j].Count > items[i].Count ||
				(items[j].Count == items[i].Count && items[j].Value < items[i].Value) {
				items[i], items[j] = items[j], items[i]
			}
		}
	}
}
