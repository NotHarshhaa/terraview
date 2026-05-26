// Package config loads Terraview configuration from a YAML file and
// environment variables. The precedence (lowest → highest) is:
//
//  1. Built-in defaults.
//  2. .terraview.yaml in the working directory (or path passed via --config).
//  3. Environment variables (TV_*).
//  4. Command-line flags.
//
// Each layer overrides the previous one, but only for fields it actually
// sets. We deliberately do *not* depend on a YAML library: the format we
// accept is small and a hand-rolled scanner avoids pulling in another
// dependency. The price is no support for anchors/aliases or complex types,
// which we don't need.
package config

import (
	"bufio"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/NotHarshhaa/terraview/internal/backend"
)

// File is the user-facing shape of `.terraview.yaml`. Everything is optional.
type File struct {
	Port         int            `yaml:"port"`
	PollInterval time.Duration  `yaml:"poll_interval"`
	WorkingDir   string         `yaml:"working_dir"`
	PlanFile     string         `yaml:"plan_file"`
	Backend      backend.Config `yaml:"backend"`
	UI           UI             `yaml:"ui"`
	Auth         Auth           `yaml:"auth"`
}

// UI controls cosmetic options exposed through the dashboard.
type UI struct {
	Title          string `yaml:"title"`
	ShowCostColumn bool   `yaml:"show_cost_column"`
	DefaultFilter  string `yaml:"default_filter"`
}

// Auth is the optional HTTP auth wrapper config.
type Auth struct {
	Enabled     bool   `yaml:"enabled"`
	Username    string `yaml:"username"`
	Password    string `yaml:"password"`
	PasswordEnv string `yaml:"password_env"` // name of env var that holds the password
	AccessToken string `yaml:"access_token"`
}

// Defaults returns a fully-populated File with built-in defaults. Used as
// the starting point in Load so we never have to nil-check fields later.
func Defaults() File {
	return File{
		Port:         7777,
		PollInterval: 30 * time.Second,
		WorkingDir:   ".",
		Backend:      backend.Config{Type: "local"},
		UI:           UI{Title: "Terraview"},
	}
}

// Load reads a .terraview.yaml (if it exists) and overlays env vars on top.
// path may be empty in which case the default location ".terraview.yaml" in
// the current working directory is tried. Missing files are not an error.
func Load(path string) (File, error) {
	cfg := Defaults()

	candidates := []string{}
	if path != "" {
		candidates = append(candidates, path)
	} else {
		candidates = append(candidates, ".terraview.yaml", ".terraview.yml")
	}
	for _, p := range candidates {
		abs, _ := filepath.Abs(p)
		if _, err := os.Stat(abs); err == nil {
			if err := loadYAMLInto(abs, &cfg); err != nil {
				return cfg, fmt.Errorf("%s: %w", p, err)
			}
			break
		} else if path != "" && !os.IsNotExist(err) {
			return cfg, fmt.Errorf("%s: %w", p, err)
		}
	}

	applyEnv(&cfg)

	if cfg.Auth.PasswordEnv != "" && cfg.Auth.Password == "" {
		cfg.Auth.Password = os.Getenv(cfg.Auth.PasswordEnv)
	}

	return cfg, cfg.validate()
}

func (f File) validate() error {
	if f.Port <= 0 || f.Port > 65535 {
		return errors.New("port must be between 1 and 65535")
	}
	if f.PollInterval < 5*time.Second {
		return errors.New("poll_interval must be at least 5s")
	}
	return nil
}

// applyEnv overlays env vars on top of the parsed file. We keep the variable
// names short and `TV_`-prefixed so they don't collide with Terraform's own
// env vars (`TF_*`, `TFE_*`).
func applyEnv(cfg *File) {
	if v := os.Getenv("TV_PORT"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			cfg.Port = n
		}
	}
	if v := os.Getenv("TV_POLL_INTERVAL"); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			cfg.PollInterval = d
		}
	}
	if v := os.Getenv("TV_WORKING_DIR"); v != "" {
		cfg.WorkingDir = v
	}
	if v := os.Getenv("TV_BACKEND"); v != "" {
		cfg.Backend.Type = v
	}
	if v := os.Getenv("TV_STATE_BUCKET"); v != "" {
		cfg.Backend.Bucket = v
	}
	if v := os.Getenv("TV_STATE_KEY"); v != "" {
		cfg.Backend.Key = v
	}
	if v := os.Getenv("TV_STATE_REGION"); v != "" {
		cfg.Backend.Region = v
	}
	if v := os.Getenv("TV_STATE_FILE"); v != "" {
		cfg.Backend.StateFile = v
	}
	if v := os.Getenv("TV_PLAN_FILE"); v != "" {
		cfg.PlanFile = v
	}
	if v := os.Getenv("TFE_TOKEN"); v != "" && cfg.Backend.Token == "" {
		cfg.Backend.Token = v
	}
	if v := os.Getenv("TV_UI_TITLE"); v != "" {
		cfg.UI.Title = v
	}
	if v := os.Getenv("TV_PASSWORD"); v != "" {
		cfg.Auth.Password = v
	}
	if v := os.Getenv("TV_ACCESS_TOKEN"); v != "" {
		cfg.Auth.AccessToken = v
	}
}

// loadYAMLInto is a tiny indent-aware YAML scanner that only understands the
// subset we ship in .terraview.yaml.example: scalar key/value pairs, simple
// nesting via two-space indentation, and `# comment` lines. It is *not* a
// general YAML parser — anything beyond that triggers an error so we don't
// silently miss config.
func loadYAMLInto(path string, cfg *File) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()

	type frame struct {
		indent int
		path   []string
	}
	var stack []frame
	stack = append(stack, frame{indent: -1})

	scanner := bufio.NewScanner(f)
	lineNo := 0
	for scanner.Scan() {
		lineNo++
		raw := scanner.Text()

		line := stripComment(raw)
		if strings.TrimSpace(line) == "" {
			continue
		}
		indent := countIndent(line)
		trimmed := strings.TrimLeft(line, " \t")

		// Pop the stack until the parent matches the current indent.
		for len(stack) > 1 && stack[len(stack)-1].indent >= indent {
			stack = stack[:len(stack)-1]
		}
		parent := stack[len(stack)-1].path

		key, val, hasColon := splitKV(trimmed)
		if !hasColon {
			return fmt.Errorf("line %d: expected key: value, got %q", lineNo, trimmed)
		}
		fullPath := append(append([]string(nil), parent...), key)

		if val == "" {
			// Nested object; push and continue.
			stack = append(stack, frame{indent: indent, path: fullPath})
			continue
		}
		if err := assign(cfg, fullPath, val); err != nil {
			return fmt.Errorf("line %d: %w", lineNo, err)
		}
	}
	return scanner.Err()
}

func stripComment(line string) string {
	// Naive: we don't honour `#` inside quoted strings, but that's fine for
	// the supported config shape (no embedded `#` in values we accept).
	if i := strings.Index(line, "#"); i >= 0 {
		return line[:i]
	}
	return line
}

func countIndent(line string) int {
	n := 0
	for _, r := range line {
		if r == ' ' {
			n++
			continue
		}
		if r == '\t' {
			n += 2
			continue
		}
		break
	}
	return n
}

func splitKV(line string) (string, string, bool) {
	i := strings.Index(line, ":")
	if i < 0 {
		return "", "", false
	}
	key := strings.TrimSpace(line[:i])
	val := strings.TrimSpace(line[i+1:])
	val = strings.Trim(val, `"'`)
	return key, val, true
}

// assign sets cfg[path] = val. Hand-written because we don't bring in a
// reflection-based YAML library; the field set is small enough to be
// exhaustive.
func assign(cfg *File, path []string, val string) error {
	join := strings.Join(path, ".")
	switch join {
	case "port":
		n, err := strconv.Atoi(val)
		if err != nil {
			return fmt.Errorf("port: %w", err)
		}
		cfg.Port = n
	case "poll_interval":
		d, err := time.ParseDuration(val)
		if err != nil {
			return fmt.Errorf("poll_interval: %w", err)
		}
		cfg.PollInterval = d
	case "working_dir":
		cfg.WorkingDir = val
	case "plan_file":
		cfg.PlanFile = val
	case "backend.type":
		cfg.Backend.Type = val
	case "backend.state_file":
		cfg.Backend.StateFile = val
	case "backend.bucket":
		cfg.Backend.Bucket = val
	case "backend.key":
		cfg.Backend.Key = val
	case "backend.region":
		cfg.Backend.Region = val
	case "backend.dynamodb_table":
		cfg.Backend.DynamoDBTable = val
	case "backend.endpoint":
		cfg.Backend.Endpoint = val
	case "backend.storage_account":
		cfg.Backend.StorageAccount = val
	case "backend.container":
		cfg.Backend.Container = val
	case "backend.organization":
		cfg.Backend.Organization = val
	case "backend.workspace":
		cfg.Backend.Workspace = val
	case "backend.token":
		cfg.Backend.Token = val
	case "backend.hostname":
		cfg.Backend.Hostname = val
	case "ui.title":
		cfg.UI.Title = val
	case "ui.show_cost_column":
		cfg.UI.ShowCostColumn = parseBool(val)
	case "ui.default_filter":
		cfg.UI.DefaultFilter = val
	case "auth.enabled":
		cfg.Auth.Enabled = parseBool(val)
	case "auth.username":
		cfg.Auth.Username = val
	case "auth.password":
		cfg.Auth.Password = val
	case "auth.password_env":
		cfg.Auth.PasswordEnv = val
	case "auth.access_token":
		cfg.Auth.AccessToken = val
	default:
		return fmt.Errorf("unknown config key %q", join)
	}
	return nil
}

func parseBool(v string) bool {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "1", "true", "yes", "on":
		return true
	default:
		return false
	}
}
