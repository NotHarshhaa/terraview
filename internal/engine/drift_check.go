package engine

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"time"

	"github.com/NotHarshhaa/terraview/internal/models"
)

// DriftCheckOptions configures a refresh-only Terraform drift scan.
type DriftCheckOptions struct {
	WorkingDir   string
	Workspace    string
	TerraformBin string
}

// DriftCheckResult is the outcome of a refresh-only plan run.
type DriftCheckResult struct {
	Drift      map[string]DriftInfo
	CheckedAt  time.Time
	SkipReason string
}

// RunDriftCheck executes `terraform plan -refresh-only` and parses drift from
// the resulting plan JSON. When Terraform is unavailable the result carries
// SkipReason instead of an error so callers can surface a warning.
func RunDriftCheck(ctx context.Context, opts DriftCheckOptions) (DriftCheckResult, error) {
	res := DriftCheckResult{CheckedAt: time.Now().UTC(), Drift: map[string]DriftInfo{}}
	if strings.TrimSpace(opts.WorkingDir) == "" {
		return res, fmt.Errorf("working directory is required for drift check")
	}

	bin := strings.TrimSpace(opts.TerraformBin)
	if bin == "" {
		bin = "terraform"
	}
	if _, err := exec.LookPath(bin); err != nil {
		res.SkipReason = "terraform binary not found in PATH"
		return res, nil
	}

	tmpPlan, err := os.CreateTemp("", "terraview-drift-*.tfplan")
	if err != nil {
		return res, fmt.Errorf("temp plan file: %w", err)
	}
	planPath := tmpPlan.Name()
	_ = tmpPlan.Close()
	defer os.Remove(planPath)

	args := []string{
		"plan",
		"-refresh-only",
		"-input=false",
		"-no-color",
		"-out", planPath,
	}
	ws := strings.TrimSpace(opts.Workspace)
	if ws != "" && ws != "default" {
		args = append(args, "-workspace="+ws)
	}

	cmd := exec.CommandContext(ctx, bin, args...)
	cmd.Dir = opts.WorkingDir
	cmd.Env = os.Environ()
	out, runErr := cmd.CombinedOutput()
	if runErr != nil {
		if exitErr, ok := runErr.(*exec.ExitError); ok && exitErr.ExitCode() == 2 {
			runErr = nil
		}
	}
	if runErr != nil {
		msg := strings.TrimSpace(string(out))
		if msg == "" {
			msg = runErr.Error()
		}
		return res, fmt.Errorf("terraform plan -refresh-only: %s", msg)
	}

	show := exec.CommandContext(ctx, bin, "show", "-json", planPath)
	show.Dir = opts.WorkingDir
	show.Env = os.Environ()
	jsonOut, err := show.Output()
	if err != nil {
		msg := strings.TrimSpace(string(jsonOut))
		if msg == "" {
			msg = err.Error()
		}
		return res, fmt.Errorf("terraform show -json: %s", msg)
	}

	drift, err := ParseDriftPlanJSON(strings.NewReader(string(jsonOut)))
	if err != nil {
		return res, err
	}
	res.Drift = drift
	return res, nil
}

// ApplyDriftAlerts merges drift findings into snapshot resources and builds
// alert payloads for the UI.
func ApplyDriftAlerts(snap *models.Snapshot, drift map[string]DriftInfo, checkedAt time.Time) {
	if snap == nil || len(drift) == 0 {
		if snap != nil && !checkedAt.IsZero() {
			t := checkedAt.UTC()
			snap.DriftCheckedAt = &t
		}
		return
	}
	t := checkedAt.UTC()
	snap.DriftCheckedAt = &t
	for i := range snap.Resources {
		d, ok := drift[snap.Resources[i].Address]
		if !ok {
			continue
		}
		if len(d.ChangedAttrs) > 0 {
			snap.Resources[i].DriftAttributes = append([]string(nil), d.ChangedAttrs...)
		}
		reason := d.Reason
		if reason == "" {
			reason = "provider drift detected"
		}
		snap.Resources[i].Status = models.StatusDrifted
		snap.Resources[i].StatusReason = reason
		snap.DriftAlerts = append(snap.DriftAlerts, models.DriftAlert{
			Address:    snap.Resources[i].Address,
			Reason:     reason,
			Attributes: append([]string(nil), d.ChangedAttrs...),
			DetectedAt: t,
		})
	}
	snap.Summary = summarise(snap.Resources)
}
