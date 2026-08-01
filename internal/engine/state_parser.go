package engine

import (
	"encoding/json"
	"fmt"
	"io"
	"strconv"
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

	// LastChanged is best-effort: we use the state file's modification time
	// when nothing better is available.
	LastChanged time.Time

	// DriftAttributes lists changed attribute keys from plan drift detection.
	DriftAttributes []string

	// DependsOn lists explicit upstream dependencies from state.
	DependsOn []string
}

// StateFileMeta holds metadata parsed from a state JSON document.
type StateFileMeta struct {
	Serial           int64
	TerraformVersion string
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
		Module    string   `json:"module"`
		Mode      string   `json:"mode"`
		Type      string   `json:"type"`
		Name      string   `json:"name"`
		Provider  string   `json:"provider"`
		DependsOn []string `json:"depends_on"`
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
	res, _, err := ParseStateJSONWithMeta(r)
	return res, err
}

// ParseStateJSONWithMeta parses state resources and returns file metadata.
func ParseStateJSONWithMeta(r io.Reader) ([]StateResource, *StateFileMeta, error) {
	raw, err := io.ReadAll(r)
	if err != nil {
		return nil, nil, fmt.Errorf("read state: %w", err)
	}

	// `terraform show -json` wraps the state in {"values":{"root_module":...}}.
	// `terraform.tfstate` on disk is the legacy {"resources":[...]} format.
	// We try the legacy form first because that's what most backends store.
	var legacy rawStateFile
	if err := json.Unmarshal(raw, &legacy); err == nil && legacy.Version >= 4 {
		meta := &StateFileMeta{
			Serial:           legacy.Serial,
			TerraformVersion: legacy.TerraformVersion,
		}
		return convertLegacyState(legacy), meta, nil
	}

	var showJSON struct {
		Values struct {
			RootModule json.RawMessage `json:"root_module"`
		} `json:"values"`
	}
	if err := json.Unmarshal(raw, &showJSON); err == nil && len(showJSON.Values.RootModule) > 0 {
		var out []StateResource
		collectShowJSONModule(showJSON.Values.RootModule, "", &out)
		return out, nil, nil
	}

	return nil, nil, fmt.Errorf("state file is neither a v4 tfstate nor a `terraform show -json` document")
}

func convertLegacyState(raw rawStateFile) []StateResource {
	var out []StateResource
	for _, r := range raw.Resources {
		if r.Mode != "" && r.Mode != "managed" {
			continue
		}
		mod := normaliseModule(r.Module)
		for i, inst := range r.Instances {
			name := stateInstanceName(r.Name, inst.IndexKey, i, len(r.Instances))
			out = append(out, StateResource{
				Address:    joinAddress(mod, r.Type, name),
				Type:       r.Type,
				Name:       name,
				Module:     mod,
				Provider:   providerNameFromTfProviderRef(r.Provider, r.Type),
				Attributes: inst.Attributes,
				Tags:       extractTags(inst.Attributes),
				DependsOn:  append([]string(nil), r.DependsOn...),
			})
		}
	}
	return out
}

func stateInstanceName(resourceName string, indexKey any, instanceIndex, instanceCount int) string {
	if indexKey == nil {
		if instanceCount > 1 {
			return fmt.Sprintf("%s[%d]", resourceName, instanceIndex)
		}
		return resourceName
	}
	if key, ok := indexKey.(string); ok {
		// Terraform addresses require JSON-style quotes around for_each keys.
		return resourceName + "[" + strconv.Quote(key) + "]"
	}
	return fmt.Sprintf("%s[%v]", resourceName, indexKey)
}

// collectShowJSONModule recurses through a `terraform show -json` module
// tree, appending every managed resource into out. The format is documented
// at https://developer.hashicorp.com/terraform/internals/json-format.
func collectShowJSONModule(raw json.RawMessage, parentAddress string, out *[]StateResource) {
	var mod struct {
		Address   string `json:"address"`
		Resources []struct {
			Address      string         `json:"address"`
			Mode         string         `json:"mode"`
			Type         string         `json:"type"`
			Name         string         `json:"name"`
			ProviderName string         `json:"provider_name"`
			DependsOn    []string       `json:"depends_on"`
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
			Provider:   providerNameFromTfProviderRef(r.ProviderName, r.Type),
			Attributes: r.Values,
			Tags:       extractTags(r.Values),
			DependsOn:  append([]string(nil), r.DependsOn...),
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

// extractTags pulls common provider tag layouts out of the attribute bag.
// Explicit resource tags override provider defaults from `tags_all`; labels and
// Kubernetes metadata labels are included so tag facets work consistently.
func extractTags(attrs map[string]any) map[string]string {
	if attrs == nil {
		return nil
	}
	out := map[string]string{}
	addTagMap(out, attrs["tags_all"])
	addTagMap(out, attrs["tags"])
	addTagMap(out, attrs["labels"])
	addTagMap(out, attrs["metadata.0.labels"])
	addMetadataLabels(out, attrs["metadata"])
	if len(out) == 0 {
		return nil
	}
	return out
}

func addMetadataLabels(out map[string]string, metadata any) {
	switch typed := metadata.(type) {
	case map[string]any:
		addTagMap(out, typed["labels"])
	case []any:
		for _, item := range typed {
			if values, ok := item.(map[string]any); ok {
				addTagMap(out, values["labels"])
			}
		}
	}
}

func addTagMap(out map[string]string, raw any) {
	add := func(key string, value any) {
		if text, ok := tagString(value); ok {
			out[strings.ToLower(key)] = text
		}
	}
	switch values := raw.(type) {
	case map[string]any:
		for key, value := range values {
			add(key, value)
		}
	case map[string]string:
		for key, value := range values {
			add(key, value)
		}
	}
}

func tagString(value any) (string, bool) {
	switch typed := value.(type) {
	case string:
		return typed, true
	case bool:
		return strconv.FormatBool(typed), true
	case float64:
		return strconv.FormatFloat(typed, 'f', -1, 64), true
	case json.Number:
		return typed.String(), true
	default:
		return "", false
	}
}
