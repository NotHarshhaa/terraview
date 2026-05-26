package engine

import (
	"encoding/json"
	"fmt"
	"io"
	"sort"
	"strings"
)

// PlanAction is the normalised "what is Terraform going to do?" verb for a
// single resource change.
type PlanAction string

const (
	PlanActionNoOp    PlanAction = "no-op"
	PlanActionCreate  PlanAction = "create"
	PlanActionUpdate  PlanAction = "update"
	PlanActionDelete  PlanAction = "delete"
	PlanActionReplace PlanAction = "replace"
	PlanActionRead    PlanAction = "read"
)

// PlanResource is the per-resource plan summary the engine consumes.
type PlanResource struct {
	Address string
	Type    string
	Name    string
	Action  PlanAction
}

// DriftInfo describes provider drift detected in a plan JSON document
// (resource_drift section or refresh-only diffs).
type DriftInfo struct {
	Reason         string
	ChangedAttrs   []string
}

// PlanParseResult bundles intentional apply changes and drift findings.
type PlanParseResult struct {
	Changes []PlanResource
	Drift   map[string]DriftInfo
}

// ParsePlanJSON parses a `terraform show -json plan.tfplan` document.
func ParsePlanJSON(r io.Reader) ([]PlanResource, error) {
	res, err := ParsePlanFull(r)
	if err != nil {
		return nil, err
	}
	return res.Changes, nil
}

// ParsePlanFull parses planned changes and the resource_drift section.
func ParsePlanFull(r io.Reader) (PlanParseResult, error) {
	raw, err := io.ReadAll(r)
	if err != nil {
		return PlanParseResult{}, fmt.Errorf("read plan: %w", err)
	}

	var plan struct {
		ResourceChanges []planChangeEntry `json:"resource_changes"`
		ResourceDrift   []planChangeEntry `json:"resource_drift"`
	}
	if err := json.Unmarshal(raw, &plan); err != nil {
		return PlanParseResult{}, fmt.Errorf("parse plan: %w", err)
	}

	out := PlanParseResult{Drift: map[string]DriftInfo{}}

	for _, rc := range plan.ResourceChanges {
		if rc.Mode != "" && rc.Mode != "managed" {
			continue
		}
		action := collapseActions(rc.Change.Actions)
		if action == PlanActionNoOp {
			continue
		}
		out.Changes = append(out.Changes, PlanResource{
			Address: rc.Address,
			Type:    rc.Type,
			Name:    rc.Name,
			Action:  action,
		})
	}

	for _, rd := range plan.ResourceDrift {
		if rd.Mode != "" && rd.Mode != "managed" {
			continue
		}
		attrs := diffAttributes(rd.Change.Before, rd.Change.After)
		reason := "provider drift detected"
		if len(attrs) > 0 {
			reason = "drifted: " + strings.Join(attrs, ", ")
		}
		out.Drift[rd.Address] = DriftInfo{
			Reason:       reason,
			ChangedAttrs: attrs,
		}
	}

	return out, nil
}

type planChangeEntry struct {
	Address string `json:"address"`
	Type    string `json:"type"`
	Name    string `json:"name"`
	Mode    string `json:"mode"`
	Change  struct {
		Actions []string       `json:"actions"`
		Before  map[string]any `json:"before"`
		After   map[string]any `json:"after"`
	} `json:"change"`
}

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

// diffAttributes returns top-level attribute keys that differ between before
// and after in a plan/drift change block.
func diffAttributes(before, after map[string]any) []string {
	if before == nil && after == nil {
		return nil
	}
	keys := map[string]struct{}{}
	for k := range before {
		keys[k] = struct{}{}
	}
	for k := range after {
		keys[k] = struct{}{}
	}
	var changed []string
	for k := range keys {
		if isSensitivePlanKey(k) {
			continue
		}
		b, bOK := before[k]
		a, aOK := after[k]
		if !bOK || !aOK || !jsonEqual(b, a) {
			changed = append(changed, k)
		}
	}
	sort.Strings(changed)
	if len(changed) > 5 {
		return append(changed[:5], fmt.Sprintf("+%d more", len(changed)-5))
	}
	return changed
}

func isSensitivePlanKey(k string) bool {
	switch strings.ToLower(k) {
	case "id", "arn", "unique_id", "password", "secret", "token", "private_key":
		return true
	}
	return strings.Contains(strings.ToLower(k), "secret") ||
		strings.Contains(strings.ToLower(k), "password")
}

func jsonEqual(a, b any) bool {
	ab, err1 := json.Marshal(a)
	bb, err2 := json.Marshal(b)
	if err1 != nil || err2 != nil {
		return fmt.Sprint(a) == fmt.Sprint(b)
	}
	return string(ab) == string(bb)
}
