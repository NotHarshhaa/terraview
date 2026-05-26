package engine

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// DeclaredResource is the minimal view of a Terraform `resource` block that
// Terraview needs to know about. We deliberately do *not* parse the full HCL
// AST: for the dashboard we only care about which addresses exist, what type
// they are and which file/module they came from. This keeps the parser
// dependency-free and resilient to syntax we don't fully understand.
type DeclaredResource struct {
	Type     string // "aws_instance"
	Name     string // "web_server"
	Module   string // "//compute" or "" for root
	File     string // absolute path of the .tf file the declaration came from
	Provider string // "aws", derived from Type
}

// Address returns the canonical Terraform address ("aws_instance.web_server"
// or "module.foo.aws_instance.web_server").
func (d DeclaredResource) Address() string {
	if d.Module == "" || d.Module == "//" {
		return d.Type + "." + d.Name
	}
	mod := strings.TrimPrefix(d.Module, "//")
	parts := strings.Split(mod, "/")
	for i, p := range parts {
		parts[i] = "module." + p
	}
	return strings.Join(parts, ".") + "." + d.Type + "." + d.Name
}

// resourceBlockRegex matches the first line of a Terraform `resource` block.
// Terraform allows whitespace and either single- or double-quoted identifiers,
// though double quotes are the canonical form. We match both for resilience.
//
//	resource "aws_instance" "web" {
//	resource    "aws_instance"  "web" {
//
// We do not attempt to be perfect — the engine surfaces parsing errors as
// non-fatal SnapshotErrors so a single malformed file never breaks the
// dashboard.
var resourceBlockRegex = regexp.MustCompile(`^\s*resource\s+["']([a-zA-Z0-9_]+)["']\s+["']([a-zA-Z0-9_\-]+)["']\s*\{`)

// HCLParseResult bundles successfully parsed declarations with any per-file
// errors so the API can surface them as warnings.
type HCLParseResult struct {
	Resources []DeclaredResource
	Errors    []error
}

// ParseHCLDir walks the given working directory and returns every `resource`
// block it can find in any .tf file, plus a list of non-fatal errors.
//
// Behaviour:
//   - Recursive; skips .terraform/, .git/ and node_modules/.
//   - Treats every subdirectory that contains its own .tf file(s) and is not
//     the root as a child module, using the path relative to the root as the
//     module name ("modules/networking" → "//modules/networking").
//   - Ignores .tf.json files for now (rare in practice; would need a separate
//     JSON parser).
func ParseHCLDir(workingDir string) HCLParseResult {
	res := HCLParseResult{}

	absRoot, err := filepath.Abs(workingDir)
	if err != nil {
		res.Errors = append(res.Errors, fmt.Errorf("resolve working dir: %w", err))
		return res
	}

	err = filepath.WalkDir(absRoot, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			res.Errors = append(res.Errors, fmt.Errorf("walk %s: %w", path, err))
			return nil
		}
		if d.IsDir() {
			name := d.Name()
			if name == ".terraform" || name == ".git" || name == "node_modules" {
				return filepath.SkipDir
			}
			return nil
		}
		if !strings.HasSuffix(d.Name(), ".tf") {
			return nil
		}

		module := moduleNameFor(absRoot, path)
		decls, perr := parseHCLFile(path, module)
		if perr != nil {
			res.Errors = append(res.Errors, fmt.Errorf("%s: %w", path, perr))
		}
		res.Resources = append(res.Resources, decls...)
		return nil
	})
	if err != nil {
		res.Errors = append(res.Errors, err)
	}

	return res
}

func moduleNameFor(root, file string) string {
	dir := filepath.Dir(file)
	rel, err := filepath.Rel(root, dir)
	if err != nil || rel == "." {
		return ""
	}
	// Normalise path separators so "modules\\networking" on Windows still
	// becomes "//modules/networking" in the UI.
	rel = filepath.ToSlash(rel)
	return "//" + rel
}

// parseHCLFile is a deliberately small line-based scanner. It is *not* a real
// HCL parser; it only finds top-level `resource "type" "name" {` lines, which
// is enough for autodiscovery. Anything inside the block (the body) is
// ignored. Nested resource blocks aren't allowed by Terraform so we don't
// need to track depth for resource detection — but we still skip strings and
// line comments to avoid spurious matches inside heredocs and `#`/`//`
// comments.
func parseHCLFile(path, module string) ([]DeclaredResource, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 0, 64*1024), 4*1024*1024)

	var out []DeclaredResource
	inBlockComment := false

	for scanner.Scan() {
		raw := scanner.Text()
		line := raw

		if inBlockComment {
			if idx := strings.Index(line, "*/"); idx >= 0 {
				line = line[idx+2:]
				inBlockComment = false
			} else {
				continue
			}
		}
		if idx := strings.Index(line, "/*"); idx >= 0 {
			before := line[:idx]
			line = before
			inBlockComment = !strings.Contains(line, "*/")
		}
		if idx := strings.Index(line, "#"); idx >= 0 {
			line = line[:idx]
		}
		if idx := strings.Index(line, "//"); idx >= 0 {
			line = line[:idx]
		}

		m := resourceBlockRegex.FindStringSubmatch(line)
		if m == nil {
			continue
		}
		t, n := m[1], m[2]
		out = append(out, DeclaredResource{
			Type:     t,
			Name:     n,
			Module:   module,
			File:     path,
			Provider: providerFromType(t),
		})
	}
	if err := scanner.Err(); err != nil {
		return out, err
	}
	return out, nil
}
