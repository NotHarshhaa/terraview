package engine

import (
	"encoding/json"
	"fmt"
	"io"
)

// PlanAction is the normalised "what is Terraform going to do?" verb for a
// single resource change. The Terraform JSON plan format expresses the same
// idea as a slice of action strings ("no-op", "create", "delete", etc.) —
// we collapse that into a single value the classifier can switch on.
type PlanAction string

const (
	PlanActionNoOp    PlanAction = "no-op"
	PlanActionCreate  PlanAction = "create"
	PlanActionUpdate  PlanAction = "update"
	PlanActionDelete  PlanAction = "delete"
	PlanActionReplace PlanAction = "replace"
	PlanActionRead    PlanAction = "read"
)

// PlanResource is the per-resource plan summary the engine consumes. Only the
// fields we actually use in the dashboard are kept.
type PlanResource struct {
	Address string
	Type    string
	Name    string
	Action  PlanAction
}

// ParsePlanJSON parses a `terraform show -json plan.tfplan` document from r.
// The format is stable and documented:
// https://developer.hashicorp.com/terraform/internals/json-format
func ParsePlanJSON(r io.Reader) ([]PlanResource, error) {
	raw, err := io.ReadAll(r)
	if err != nil {
		return nil, fmt.Errorf("read plan: %w", err)
	}

	var plan struct {
		ResourceChanges []struct {
			Address      string `json:"address"`
			Type         string `json:"type"`
			Name         string `json:"name"`
			Mode         string `json:"mode"`
			Change       struct {
				Actions []string `json:"actions"`
			} `json:"change"`
		} `json:"resource_changes"`
	}
	if err := json.Unmarshal(raw, &plan); err != nil {
		return nil, fmt.Errorf("parse plan: %w", err)
	}

	out := make([]PlanResource, 0, len(plan.ResourceChanges))
	for _, rc := range plan.ResourceChanges {
		if rc.Mode != "" && rc.Mode != "managed" {
			continue
		}
		action := collapseActions(rc.Change.Actions)
		if action == PlanActionNoOp {
			continue // Skip no-ops; the classifier treats absent-from-plan as no-op.
		}
		out = append(out, PlanResource{
			Address: rc.Address,
			Type:    rc.Type,
			Name:    rc.Name,
			Action:  action,
		})
	}
	return out, nil
}

// collapseActions translates Terraform's action arrays into a single
// PlanAction. The combinations Terraform emits are:
//
//	["no-op"]               → no-op
//	["create"]              → create
//	["read"]                → read (data source refresh, ignored)
//	["update"]              → update
//	["delete"]              → delete
//	["delete","create"]     → replace
//	["create","delete"]     → replace (create-before-destroy lifecycle)
func collapseActions(actions []string) PlanAction {
	if len(actions) == 0 {
		return PlanActionNoOp
	}
	if len(actions) == 1 {
		switch actions[0] {
		case "create":
			return PlanActionCreate
		case "update":
			return PlanActionUpdate
		case "delete":
			return PlanActionDelete
		case "read":
			return PlanActionRead
		default:
			return PlanActionNoOp
		}
	}
	hasCreate, hasDelete := false, false
	for _, a := range actions {
		switch a {
		case "create":
			hasCreate = true
		case "delete":
			hasDelete = true
		}
	}
	if hasCreate && hasDelete {
		return PlanActionReplace
	}
	if hasDelete {
		return PlanActionDelete
	}
	return PlanActionUpdate
}
