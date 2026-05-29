package engine

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/NotHarshhaa/terraview/internal/models"
)

const defaultHistoryVersions = 30

// HistoryStore keeps a ring buffer of state fingerprints per workspace and
// derives resource lifecycle events when serials or attributes change.
type HistoryStore struct {
	mu          sync.RWMutex
	maxVersions int
	versions    map[string][]stateVersionRecord
	events      map[string][]models.ResourceHistoryEvent
}

type stateVersionRecord struct {
	Serial        int64
	RecordedAt    time.Time
	ResourceCount int
	EventSummary  string
	Fingerprints  map[string]string
}

// NewHistoryStore returns an empty store retaining up to maxVersions per workspace.
func NewHistoryStore(maxVersions int) *HistoryStore {
	if maxVersions <= 0 {
		maxVersions = defaultHistoryVersions
	}
	return &HistoryStore{
		maxVersions: maxVersions,
		versions:    map[string][]stateVersionRecord{},
		events:      map[string][]models.ResourceHistoryEvent{},
	}
}

// Record compares the snapshot with the previous version for workspace and
// appends lifecycle events when resources appear, change, or disappear.
func (h *HistoryStore) Record(workspace string, serial int64, resources []models.Resource) []models.StateVersionInfo {
	if h == nil {
		return nil
	}
	workspace = normaliseWorkspace(workspace)
	fp := fingerprintResources(resources)

	h.mu.Lock()
	defer h.mu.Unlock()

	prev := lastVersion(h.versions[workspace])
	changed := prev == nil || prev.Serial != serial || !mapsEqual(prev.Fingerprints, fp)
	if !changed {
		return h.listVersionsLocked(workspace)
	}

	at := time.Now().UTC()
	summary := ""
	if prev != nil {
		events := diffFingerprints(prev.Fingerprints, fp, serial, at)
		if len(events) > 0 {
			h.events[workspace] = appendEvents(h.events[workspace], events, 500)
			summary = summariseEvents(events)
		}
	} else if len(fp) > 0 {
		var bootstrap []models.ResourceHistoryEvent
		for addr := range fp {
			bootstrap = append(bootstrap, models.ResourceHistoryEvent{
				At:      at,
				Serial:  serial,
				Action:  "created",
				Address: addr,
				Details: "present in first observed state version",
			})
		}
		sort.Slice(bootstrap, func(i, j int) bool {
			return bootstrap[i].Address < bootstrap[j].Address
		})
		h.events[workspace] = appendEvents(h.events[workspace], bootstrap, 500)
		summary = fmt.Sprintf("%d created", len(bootstrap))
	}

	rec := stateVersionRecord{
		Serial:        serial,
		RecordedAt:    at,
		ResourceCount: len(fp),
		Fingerprints:  fp,
		EventSummary:  summary,
	}
	h.versions[workspace] = appendVersion(h.versions[workspace], rec, h.maxVersions)

	return h.listVersionsLocked(workspace)
}

// Versions returns recorded state versions for workspace (newest first).
func (h *HistoryStore) Versions(workspace string) []models.StateVersionInfo {
	if h == nil {
		return nil
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.listVersionsLocked(normaliseWorkspace(workspace))
}

// ResourceTimeline returns lifecycle events for a single resource address.
func (h *HistoryStore) ResourceTimeline(workspace, address string) []models.ResourceHistoryEvent {
	if h == nil {
		return nil
	}
	address = strings.TrimSpace(address)
	if address == "" {
		return nil
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	all := h.events[normaliseWorkspace(workspace)]
	type indexed struct {
		event models.ResourceHistoryEvent
		pos   int
	}
	var items []indexed
	for i, ev := range all {
		if ev.Address == address {
			items = append(items, indexed{event: ev, pos: i})
		}
	}
	sort.Slice(items, func(i, j int) bool {
		if !items[i].event.At.Equal(items[j].event.At) {
			return items[i].event.At.After(items[j].event.At)
		}
		return items[i].pos > items[j].pos
	})
	out := make([]models.ResourceHistoryEvent, len(items))
	for i, item := range items {
		out[i] = item.event
	}
	return out
}

func (h *HistoryStore) listVersionsLocked(workspace string) []models.StateVersionInfo {
	vers := h.versions[workspace]
	if len(vers) == 0 {
		return nil
	}
	out := make([]models.StateVersionInfo, len(vers))
	for i := range vers {
		v := vers[len(vers)-1-i]
		out[i] = models.StateVersionInfo{
			Serial:        v.Serial,
			RecordedAt:    v.RecordedAt,
			ResourceCount: v.ResourceCount,
			EventSummary:  v.EventSummary,
		}
	}
	return out
}

func normaliseWorkspace(ws string) string {
	ws = strings.TrimSpace(ws)
	if ws == "" {
		return "default"
	}
	return ws
}

func lastVersion(vers []stateVersionRecord) *stateVersionRecord {
	if len(vers) == 0 {
		return nil
	}
	v := vers[len(vers)-1]
	return &v
}

func appendVersion(vers []stateVersionRecord, rec stateVersionRecord, max int) []stateVersionRecord {
	vers = append(vers, rec)
	if len(vers) > max {
		vers = vers[len(vers)-max:]
	}
	return vers
}

func appendEvents(events []models.ResourceHistoryEvent, add []models.ResourceHistoryEvent, max int) []models.ResourceHistoryEvent {
	events = append(events, add...)
	if len(events) > max {
		events = events[len(events)-max:]
	}
	return events
}

func fingerprintResources(resources []models.Resource) map[string]string {
	out := make(map[string]string, len(resources))
	for _, r := range resources {
		if r.Status == models.StatusUnmanaged && r.Attributes == nil {
			continue
		}
		out[r.Address] = hashResource(r)
	}
	return out
}

func hashResource(r models.Resource) string {
	var b strings.Builder
	b.WriteString(r.Type)
	b.WriteByte('|')
	b.WriteString(string(r.Status))
	b.WriteByte('|')
	keys := make([]string, 0, len(r.Attributes))
	for k := range r.Attributes {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		b.WriteString(k)
		b.WriteByte('=')
		b.WriteString(r.Attributes[k])
		b.WriteByte(';')
	}
	tagKeys := make([]string, 0, len(r.Tags))
	for k := range r.Tags {
		tagKeys = append(tagKeys, k)
	}
	sort.Strings(tagKeys)
	for _, k := range tagKeys {
		b.WriteString("tag:")
		b.WriteString(k)
		b.WriteString("=")
		b.WriteString(r.Tags[k])
		b.WriteByte(';')
	}
	sum := sha256.Sum256([]byte(b.String()))
	return hex.EncodeToString(sum[:8])
}

func diffFingerprints(before, after map[string]string, serial int64, at time.Time) []models.ResourceHistoryEvent {
	var out []models.ResourceHistoryEvent
	for addr, hash := range after {
		prev, ok := before[addr]
		if !ok {
			out = append(out, models.ResourceHistoryEvent{
				At:      at,
				Serial:  serial,
				Action:  "created",
				Address: addr,
				Details: "resource appeared in state",
			})
			continue
		}
		if prev != hash {
			out = append(out, models.ResourceHistoryEvent{
				At:      at,
				Serial:  serial,
				Action:  "updated",
				Address: addr,
				Details: "attributes or tags changed",
			})
		}
	}
	for addr := range before {
		if _, ok := after[addr]; !ok {
			out = append(out, models.ResourceHistoryEvent{
				At:      at,
				Serial:  serial,
				Action:  "destroyed",
				Address: addr,
				Details: "resource removed from state",
			})
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Action != out[j].Action {
			return out[i].Action < out[j].Action
		}
		return out[i].Address < out[j].Address
	})
	return out
}

func summariseEvents(events []models.ResourceHistoryEvent) string {
	counts := map[string]int{}
	for _, ev := range events {
		counts[ev.Action]++
	}
	order := []string{"created", "updated", "destroyed"}
	parts := make([]string, 0, 3)
	for _, action := range order {
		if n := counts[action]; n > 0 {
			parts = append(parts, fmt.Sprintf("%d %s", n, action))
		}
	}
	return strings.Join(parts, ", ")
}

func mapsEqual(a, b map[string]string) bool {
	if len(a) != len(b) {
		return false
	}
	for k, v := range a {
		if b[k] != v {
			return false
		}
	}
	return true
}
