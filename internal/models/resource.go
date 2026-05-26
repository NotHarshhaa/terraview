// Package models defines the core data types that flow between the Terraview
// engine (parsers + classifier), the backend adapters and the HTTP API layer.
package models

import "time"

// Status is the lifecycle status of an individual resource as classified by
// Terraview. See the README for the full decision tree.
type Status string

const (
	StatusCreated        Status = "created"         // Resource exists and the provider reports it healthy.
	StatusInactive       Status = "inactive"        // Resource exists but is paused/stopped/disabled.
	StatusPendingCreate  Status = "pending_create"  // Planned to be created on the next apply.
	StatusPendingDestroy Status = "pending_destroy" // Planned to be destroyed on the next apply.
	StatusPendingUpdate  Status = "pending_update"  // Planned to be modified on the next apply.
	StatusDrifted        Status = "drifted"         // State does not match the provider-reported reality.
	StatusUnmanaged      Status = "unmanaged"       // Declared in .tf but absent from state and plan.
	StatusUnknown        Status = "unknown"         // Could not classify (missing data).
)

// AllStatuses returns every status Terraview can emit, in display order.
func AllStatuses() []Status {
	return []Status{
		StatusCreated,
		StatusInactive,
		StatusPendingCreate,
		StatusPendingUpdate,
		StatusPendingDestroy,
		StatusDrifted,
		StatusUnmanaged,
		StatusUnknown,
	}
}

// Category groups resources by cloud provider + service family so the UI can
// render them as collapsible "AWS › Compute" style sections.
type Category struct {
	Provider string `json:"provider"` // "aws", "google", "azurerm", "kubernetes", ...
	Service  string `json:"service"`  // "Compute", "Networking", "Databases", ...
}

// String renders the human-readable "Provider › Service" form.
func (c Category) String() string {
	return c.Provider + " › " + c.Service
}

// Resource is the unified shape Terraview emits for every resource it knows
// about. It is the bridge between Terraform's two worlds (declared HCL +
// recorded state) and the UI's status grid.
type Resource struct {
	// Address is the fully-qualified Terraform address, e.g.
	// "module.networking.aws_vpc.main" or "aws_instance.web_server".
	Address string `json:"address"`

	// Name is the short label (last segment of the address) used in the UI.
	Name string `json:"name"`

	// Type is the Terraform resource type, e.g. "aws_instance".
	Type string `json:"type"`

	// Provider is the resolved provider name, e.g. "aws".
	Provider string `json:"provider"`

	// Module is the module path, e.g. "//compute" or "" for root.
	Module string `json:"module"`

	// Category groups resources by provider + service family.
	Category Category `json:"category"`

	// Status is the classified lifecycle status.
	Status Status `json:"status"`

	// StatusReason is a short, human-readable hint about why the status was
	// chosen (e.g. "EC2 instance stopped", "drifted: instance_type changed").
	StatusReason string `json:"status_reason,omitempty"`

	// Attributes is a small bag of provider attributes the UI may want to
	// surface (instance_type, engine, region, etc.). We deliberately keep this
	// flat and string-keyed so the UI can render it without schema awareness.
	Attributes map[string]string `json:"attributes,omitempty"`

	// Tags are the resource tags as read from state (lower-cased keys).
	Tags map[string]string `json:"tags,omitempty"`

	// MonthlyCost is the optional Infracost monthly USD estimate. Zero when
	// cost integration is disabled.
	MonthlyCost float64 `json:"monthly_cost,omitempty"`

	// LastChanged is the timestamp of the most recent state change Terraview
	// could infer. Zero when unknown.
	LastChanged time.Time `json:"last_changed,omitempty"`
}

// Snapshot is the full payload the engine produces on each refresh and the
// API serves to the UI. Everything else is derived from this.
type Snapshot struct {
	GeneratedAt time.Time       `json:"generated_at"`
	WorkingDir  string          `json:"working_dir"`
	BackendType string          `json:"backend_type"`
	Resources   []Resource      `json:"resources"`
	Summary     Summary         `json:"summary"`
	Errors      []SnapshotError `json:"errors,omitempty"`
}

// Summary is a pre-aggregated count of statuses for the summary bar at the top
// of the UI. Pre-aggregating here keeps the client trivial.
type Summary struct {
	Total            int            `json:"total"`
	ByStatus         map[Status]int `json:"by_status"`
	ByProvider       map[string]int `json:"by_provider"`
	ByCategory       map[string]int `json:"by_category"`
	TotalMonthlyCost float64        `json:"total_monthly_cost,omitempty"`
}

// SnapshotError is a non-fatal error surfaced to the UI (e.g. a single .tf
// file failed to parse but the rest of the project loaded fine).
type SnapshotError struct {
	Source  string `json:"source"`  // "hcl", "state", "plan", "backend"
	Message string `json:"message"`
}
