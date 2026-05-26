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
// Terraview needs to know about.
type DeclaredResource struct {
	Type     string
	Name     string
	Module   string // "//networking" or "" for root
	File     string
	Provider string
}

// Address returns the canonical Terraform address.
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

var resourceBlockRegex = regexp.MustCompile(`^\s*resource\s+["']([a-zA-Z0-9_]+)["']\s+["']([a-zA-Z0-9_\-]+)["']\s*\{`)
var moduleBlockRegex = regexp.MustCompile(`^\s*module\s+["']([a-zA-Z0-9_\-]+)["']\s*\{`)
var moduleSourceRegex = regexp.MustCompile(`^\s*source\s*=\s*["']([^"']+)["']`)

// HCLParseResult bundles successfully parsed declarations with any per-file errors.
type HCLParseResult struct {
	Resources []DeclaredResource
	Errors    []error
}

// ParseHCLDir walks the working directory for `resource` blocks. Module names
// are derived from `module "name" { source = "..." }` call sites — not from
// filesystem paths — so addresses align with Terraform state.
func ParseHCLDir(workingDir string) HCLParseResult {
	res := HCLParseResult{}

	absRoot, err := filepath.Abs(workingDir)
	if err != nil {
		res.Errors = append(res.Errors, fmt.Errorf("resolve working dir: %w", err))
		return res
	}

	moduleDirs, modErrs := discoverModuleSources(absRoot)
	res.Errors = append(res.Errors, modErrs...)

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

		module := moduleNameFor(absRoot, path, moduleDirs)
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

// discoverModuleSources scans all .tf files for module blocks and maps each
// resolved source directory to its Terraform module path ("networking" or
// "networking/vpc" for nested calls).
func discoverModuleSources(root string) (map[string]string, []error) {
	dirToModule := map[string]string{}
	var errs []error

	_ = filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() || !strings.HasSuffix(d.Name(), ".tf") {
			return nil
		}
		name := filepath.Base(filepath.Dir(path))
		if name == ".terraform" || name == ".git" || name == "node_modules" {
			return nil
		}
		calls, perr := parseModuleBlocks(path)
		if perr != nil {
			errs = append(errs, fmt.Errorf("%s: %w", path, perr))
			return nil
		}
		fileDir := filepath.Dir(path)
		parent := parentModulePath(fileDir, dirToModule)
		for _, c := range calls {
			srcAbs, err := resolveModuleSource(fileDir, c.source)
			if err != nil {
				errs = append(errs, fmt.Errorf("%s: module %q: %w", path, c.name, err))
				continue
			}
			full := c.name
			if parent != "" {
				full = parent + "/" + c.name
			}
			dirToModule[srcAbs] = full
		}
		return nil
	})

	return dirToModule, errs
}

type moduleCall struct {
	name   string
	source string
}

func parseModuleBlocks(path string) ([]moduleCall, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	var out []moduleCall
	inBlock := false
	var current string

	for scanner.Scan() {
		line := stripLineComments(scanner.Text())
		if !inBlock {
			if m := moduleBlockRegex.FindStringSubmatch(line); m != nil {
				inBlock = true
				current = m[1]
			}
			continue
		}
		if m := moduleSourceRegex.FindStringSubmatch(line); m != nil {
			out = append(out, moduleCall{name: current, source: m[1]})
			inBlock = false
			current = ""
			continue
		}
		if strings.Contains(line, "}") {
			inBlock = false
			current = ""
		}
	}
	return out, scanner.Err()
}

func resolveModuleSource(fromDir, source string) (string, error) {
	if strings.HasPrefix(source, "git::") || strings.HasPrefix(source, "github.com/") || strings.HasPrefix(source, "bitbucket.org/") {
		return "", fmt.Errorf("remote module source not supported for autodiscovery: %q", source)
	}
	abs := filepath.Clean(filepath.Join(fromDir, source))
	return filepath.Abs(abs)
}

func parentModulePath(dir string, dirToModule map[string]string) string {
	absDir, err := filepath.Abs(dir)
	if err != nil {
		return ""
	}
	best := ""
	bestLen := -1
	for srcDir, modPath := range dirToModule {
		if absDir == srcDir || strings.HasPrefix(absDir, srcDir+string(os.PathSeparator)) {
			if len(srcDir) > bestLen {
				bestLen = len(srcDir)
				best = modPath
			}
		}
	}
	return best
}

func moduleNameFor(root, file string, dirToModule map[string]string) string {
	absFileDir, err := filepath.Abs(filepath.Dir(file))
	if err != nil {
		return ""
	}
	if mod, ok := dirToModule[absFileDir]; ok {
		return "//" + mod
	}
	best := ""
	bestLen := -1
	for srcDir, modPath := range dirToModule {
		if absFileDir == srcDir || strings.HasPrefix(absFileDir, srcDir+string(os.PathSeparator)) {
			if len(srcDir) > bestLen {
				bestLen = len(srcDir)
				best = modPath
			}
		}
	}
	if best != "" {
		return "//" + best
	}
	rel, err := filepath.Rel(root, absFileDir)
	if err != nil || rel == "." {
		return ""
	}
	// Unknown subdirectory — treat as root so we don't invent wrong module.* paths.
	return ""
}

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
		line := stripBlockComments(scanner.Text(), &inBlockComment)
		line = stripLineComments(line)

		m := resourceBlockRegex.FindStringSubmatch(line)
		if m == nil {
			continue
		}
		out = append(out, DeclaredResource{
			Type:     m[1],
			Name:     m[2],
			Module:   module,
			File:     path,
			Provider: providerFromType(m[1]),
		})
	}
	if err := scanner.Err(); err != nil {
		return out, err
	}
	return out, nil
}

func stripLineComments(line string) string {
	if idx := strings.Index(line, "#"); idx >= 0 {
		line = line[:idx]
	}
	if idx := strings.Index(line, "//"); idx >= 0 {
		line = line[:idx]
	}
	return line
}

// stripBlockComments removes /* */ comments, including single-line blocks.
func stripBlockComments(line string, inBlock *bool) string {
	for {
		if *inBlock {
			if idx := strings.Index(line, "*/"); idx >= 0 {
				line = line[idx+2:]
				*inBlock = false
				continue
			}
			return ""
		}
		idx := strings.Index(line, "/*")
		if idx < 0 {
			return line
		}
		before := line[:idx]
		rest := line[idx+2:]
		if end := strings.Index(rest, "*/"); end >= 0 {
			line = before + rest[end+2:]
			continue
		}
		*inBlock = true
		return before
	}
}
