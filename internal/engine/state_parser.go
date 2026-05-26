package engine

import (
	"encoding/json"
	"fmt"
	"io"
	"strings"
	"time"
)

// StateResource is the slice of a Terraform state instance Terraview cares
// about. The full state schema is large and version-dependent; we only
// extract the fields we actually display or classify on.
type StateResource struct {
	Address    string
	Type       string
	Name       string
	Module     string // "" for root, "//networking", etc.
	Provider   string
	Attributes map[string]any
	Tags       map[string]string

	// Drifted/DriftReason are populated by drift detectors plugged into the
	// engine (provider attribute comparison, terraform plan diff). The state
	// parser itself never sets these; it just preserves them.
	Drifted     bool
	DriftReason string

	// LastChanged is best-effort: we use the state file's `serial` bump time
	// when nothing better is available.
	LastChanged time.Time
}

// rawStateFile mirrors the on-disk structure of a Terraform v4 state file.
// We use json.RawMessage where we don't need to introspect to stay resilient
// to schema additions.
type rawStateFile struct {
	Version          int    `json:"version"`
	TerraformVersion string `json:"terraform_version"`
	Serial           int64  `json:"serial"`
	Lineage          string `json:"lineage"`
	Resources        []struct {
		Module    string `json:"module"`
		Mode      string `json:"mode"`
		Type      string `json:"type"`
		Name      string `json:"name"`
		Provider  string `json:"provider"`
		Instances []struct {
			IndexKey   any            `json:"index_key,omitempty"`
			Attributes map[string]any `json:"attributes"`
		} `json:"instances"`
	} `json:"resources"`
}

// ParseStateJSON reads a Terraform v4 state file (the format
// `terraform.tfstate` uses, and what `terraform show -json` emits with a
// wrapping `values` key — handled separately) from r and returns its managed
// resources.
//
// data_resources (Mode == "data") are intentionally skipped: they don't
// represent infrastructure that can have a lifecycle status.
func ParseStateJSON(r io.Reader) ([]StateResource, error) {
	raw, err := io.ReadAll(r)
	if err != nil {
		return nil, fmt.Errorf("read state: %w", err)
	}

	// `terraform show -json` wraps the state in {"values":{"root_module":...}}.
	// `terraform.tfstate` on disk is the legacy {"resources":[...]} format.
	// We try the legacy form first because that's what most backends store.
	var legacy rawStateFile
	if err := json.Unmarshal(raw, &legacy); err == nil && len(legacy.Resources) > 0 {
		return convertLegacyState(legacy), nil
	}

	var showJSON struct {
		Values struct {
			RootModule json.RawMessage `json:"root_module"`
		} `json:"values"`
	}
	if err := json.Unmarshal(raw, &showJSON); err == nil && len(showJSON.Values.RootModule) > 0 {
		var out []StateResource
		collectShowJSONModule(showJSON.Values.RootModule, "", &out)
		return out, nil
	}

	return nil, fmt.Errorf("state file is neither a v4 tfstate nor a `terraform show -json` document")
}

func convertLegacyState(raw rawStateFile) []StateResource {
	var out []StateResource
	for _, r := range raw.Resources {
		if r.Mode != "" && r.Mode != "managed" {
			continue
		}
		mod := normaliseModule(r.Module)
		for i, inst := range r.Instances {
			name := r.Name
			if inst.IndexKey != nil {
				name = fmt.Sprintf("%s[%v]", r.Name, inst.IndexKey)
			} else if len(r.Instances) > 1 {
				name = fmt.Sprintf("%s[%d]", r.Name, i)
			}
			out = append(out, StateResource{
				Address:    joinAddress(mod, r.Type, name),
				Type:       r.Type,
				Name:       name,
				Module:     mod,
				Provider:   providerNameFromTfProviderRef(r.Provider, r.Type),
				Attributes: inst.Attributes,
				Tags:       extractTags(inst.Attributes),
			})
		}
	}
	return out
}

// collectShowJSONModule recurses through a `terraform show -json` module
// tree, appending every managed resource into out. The format is documented
// at https://developer.hashicorp.com/terraform/internals/json-format.
func collectShowJSONModule(raw json.RawMessage, parentAddress string, out *[]StateResource) {
	var mod struct {
		Address      string `json:"address"`
		Resources    []struct {
			Address      string         `json:"address"`
			Mode         string         `json:"mode"`
			Type         string         `json:"type"`
			Name         string         `json:"name"`
			ProviderName string         `json:"provider_name"`
			Values       map[string]any `json:"values"`
		} `json:"resources"`
		ChildModules []json.RawMessage `json:"child_modules"`
	}
	if err := json.Unmarshal(raw, &mod); err != nil {
		return
	}
	moduleAddr := mod.Address
	if moduleAddr == "" {
		moduleAddr = parentAddress
	}
	for _, r := range mod.Resources {
		if r.Mode != "managed" {
			continue
		}
		modName := ""
		if strings.HasPrefix(moduleAddr, "module.") {
			modName = "//" + strings.ReplaceAll(strings.TrimPrefix(moduleAddr, "module."), ".module.", "/")
		}
		*out = append(*out, StateResource{
			Address:    r.Address,
			Type:       r.Type,
			Name:       r.Name,
			Module:     modName,
			Provider:   r.ProviderName,
			Attributes: r.Values,
			Tags:       extractTags(r.Values),
		})
	}
	for _, child := range mod.ChildModules {
		collectShowJSONModule(child, moduleAddr, out)
	}
}

func normaliseModule(modulePath string) string {
	if modulePath == "" {
		return ""
	}
	// `module.networking.module.subnets` → "//networking/subnets"
	parts := strings.Split(modulePath, ".")
	var names []string
	for i := 0; i < len(parts); i++ {
		if parts[i] == "module" && i+1 < len(parts) {
			names = append(names, parts[i+1])
			i++
		}
	}
	if len(names) == 0 {
		return ""
	}
	return "//" + strings.Join(names, "/")
}

func joinAddress(module, t, name string) string {
	prefix := ""
	if module != "" {
		// "//networking/subnets" → "module.networking.module.subnets."
		mod := strings.TrimPrefix(module, "//")
		segs := strings.Split(mod, "/")
		for _, s := range segs {
			prefix += "module." + s + "."
		}
	}
	return prefix + t + "." + name
}

// providerNameFromTfProviderRef takes a Terraform-style provider reference
// like `provider["registry.terraform.io/hashicorp/aws"]` and returns the bare
// provider name ("aws"). Falls back to the prefix of the resource type when
// the ref is empty.
func providerNameFromTfProviderRef(ref, resourceType string) string {
	if ref == "" {
		return providerFromType(resourceType)
	}
	// Strip everything up to the last "/" and trailing `"]`.
	r := ref
	if i := strings.LastIndex(r, "/"); i >= 0 {
		r = r[i+1:]
	}
	r = strings.TrimSuffix(r, "\"]")
	r = strings.TrimSuffix(r, "]")
	r = strings.Trim(r, `"`)
	if r == "" {
		return providerFromType(resourceType)
	}
	return r
}

// extractTags pulls the most common tag map shapes (AWS: `tags`, Azure:
// `tags`, GCP: `labels`, Kubernetes: `metadata.0.labels`) out of the flat
// attribute bag and returns them as a string→string map for the UI.
func extractTags(attrs map[string]any) map[string]string {
	out := map[string]string{}
	if attrs == nil {
		return out
	}
	for _, k := range []string{"tags", "labels"} {
		if v, ok := attrs[k]; ok {
			if m, ok := v.(map[string]any); ok {
				for kk, vv := range m {
					if s, ok := vv.(string); ok {
						out[strings.ToLower(kk)] = s
					}
				}
			}
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}
