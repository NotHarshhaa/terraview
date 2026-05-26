package engine

import (
	"fmt"
	"strings"

	"github.com/NotHarshhaa/terraview/internal/models"
)

// Classify decides a single resource's lifecycle status by combining the
// information that the parsers extracted from HCL, state and plan.
//
// The decision tree below follows the README:
//
//	declared? in-state? in-plan?      → status
//	  yes      yes      delete         → pending_destroy
//	  yes      yes      update         → pending_update
//	  yes      yes      no_op + dr.    → drifted
//	  yes      yes      no_op          → created | inactive
//	  yes      no       create         → pending_create
//	  yes      no       no             → unmanaged
//	  no       yes      *              → created | inactive (unmanaged in HCL)
//
// "Inactive" is decided by looking at provider attributes that hint at a
// non-running state (instance_state, status, state, enabled, ...).
//
// The function is pure: same inputs always produce the same outputs. The
// orchestration of how these inputs are gathered lives in the Engine.
func Classify(decl *DeclaredResource, state *StateResource, plan *PlanResource) (models.Status, string) {
	inState := state != nil
	inPlan := plan != nil

	if inPlan {
		switch plan.Action {
		case PlanActionCreate:
			return models.StatusPendingCreate, "create planned"
		case PlanActionDelete:
			return models.StatusPendingDestroy, "destroy planned"
		case PlanActionUpdate:
			return models.StatusPendingUpdate, "update planned"
		case PlanActionReplace:
			return models.StatusPendingUpdate, "replacement planned"
		}
	}

	if inState {
		if state.Drifted {
			reason := state.DriftReason
			if reason == "" {
				reason = "state diverges from provider"
			}
			return models.StatusDrifted, reason
		}
		if inactive, reason := inferInactive(state.Attributes); inactive {
			return models.StatusInactive, reason
		}
		return models.StatusCreated, ""
	}

	if decl != nil {
		return models.StatusUnmanaged, "declared in .tf but not in state"
	}

	return models.StatusUnknown, "no data"
}

// inferInactive looks for common provider attributes that indicate a resource
// is technically created but not running. The check is best-effort and
// deliberately tolerant: we treat the absence of any signal as "active".
func inferInactive(attrs map[string]any) (bool, string) {
	if attrs == nil {
		return false, ""
	}

	checks := []struct {
		key      string
		inactive []string
		template string
	}{
		{"instance_state", []string{"stopped", "stopping", "shutting-down", "terminated"}, "instance %s"},
		{"state", []string{"stopped", "disabled", "paused", "suspended", "deallocated"}, "state=%s"},
		{"status", []string{"stopped", "disabled", "paused", "suspended", "inactive", "deallocated"}, "status=%s"},
		{"power_state", []string{"stopped", "off", "deallocated"}, "power_state=%s"},
	}
	for _, c := range checks {
		raw, ok := attrs[c.key]
		if !ok {
			continue
		}
		s, ok := raw.(string)
		if !ok {
			continue
		}
		s = strings.ToLower(strings.TrimSpace(s))
		for _, target := range c.inactive {
			if s == target {
				return true, fmt.Sprintf(c.template, s)
			}
		}
	}

	// Some resources expose an `enabled`/`active` boolean.
	for _, key := range []string{"enabled", "active"} {
		if raw, ok := attrs[key]; ok {
			if b, ok := raw.(bool); ok && !b {
				return true, key + "=false"
			}
		}
	}

	return false, ""
}
