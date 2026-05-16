package sessions

import (
	"context"
	"encoding/json"

	"github.com/pocketbase/pocketbase/core"

	"github.com/KevinBonnoron/wisp/internal/catalog"
)

// flatGroupRules maps an app slug + parent group ID to the list of sub-mount
// names that used to live as flat-ID volumes (`<parent>-<name>`) before the
// grouped manifest shape landed. Extend this map when new apps adopt grouping.
var flatGroupRules = map[string]map[string][]string{
	"steam": {
		"library": {"common", "shadercache", "workshop"},
	},
	"retroarch": {
		"assets": {"cores", "autoconfig", "config", "system"},
	},
}

// MigrateFlatVolumes scans every app record and rewrites spec.volumes from the
// legacy flat-ID layout (e.g. `library-common`, `library-shadercache`) into the
// current grouped form. If an admin had diverged the host or container paths
// across sub-mounts of the same group, those overrides are preserved on the
// resulting GroupedMount entries instead of being collapsed.
func (m *Manager) MigrateFlatVolumes(ctx context.Context) {
	records, err := m.pb.FindRecordsByFilter(collectionApps, "id != ''", "+created", 1000, 0, nil)
	if err != nil {
		m.logger.Error("flat-volume migration: list apps", "err", err)
		return
	}

	for _, rec := range records {
		select {
		case <-ctx.Done():
			return
		default:
		}

		m.migrateOne(rec)
	}
}

func (m *Manager) migrateOne(appRec *core.Record) {
	rules, ok := flatGroupRules[appRec.GetString("slug")]
	if !ok {
		return
	}

	raw := appRec.GetString("spec")
	if raw == "" {
		return
	}

	var overrides catalog.Overrides
	if err := json.Unmarshal([]byte(raw), &overrides); err != nil {
		return
	}

	migrated, changed := applyFlatGroupRules(overrides.Volumes, rules)
	if !changed {
		return
	}

	overrides.Volumes = migrated
	b, err := json.Marshal(overrides)
	if err != nil {
		m.logger.Error("flat-volume migration: marshal spec", "app", appRec.GetString("slug"), "err", err)
		return
	}

	appRec.Set("spec", string(b))
	if err := m.pb.Save(appRec); err != nil {
		m.logger.Error("flat-volume migration: save", "app", appRec.GetString("slug"), "err", err)
		return
	}

	m.logger.Info("migrated flat-ID volumes to grouped form", "app", appRec.GetString("slug"))
}

func applyFlatGroupRules(volumes []catalog.Volume, rules map[string][]string) ([]catalog.Volume, bool) {
	byID := make(map[string]*catalog.Volume, len(volumes))
	for i := range volumes {
		byID[volumes[i].ID] = &volumes[i]
	}

	changed := false
	consumed := make(map[string]bool)
	groupedByParent := make(map[string]*catalog.Volume)

	for parentID, subNames := range rules {
		// Build the candidate sub-mount set: every `<parentID>-<name>` entry.
		var flatHits []*catalog.Volume
		for _, name := range subNames {
			flatID := parentID + "-" + name
			if v, ok := byID[flatID]; ok && !v.IsGrouped() {
				flatHits = append(flatHits, v)
			}
		}

		if len(flatHits) == 0 {
			continue
		}

		// Use the first flat entry as the source of truth for scope and the
		// shared host/container roots; per-sub overrides land on each mount.
		first := flatHits[0]
		parent := catalog.Volume{
			ID:            parentID,
			Scope:         first.Scope,
			HostPath:      stripSuffix(first.HostPath, first.ID, parentID),
			ContainerPath: stripSuffix(first.ContainerPath, first.ID, parentID),
		}

		for _, name := range subNames {
			flatID := parentID + "-" + name
			v, ok := byID[flatID]
			if !ok {
				continue
			}

			gm := catalog.GroupedMount{Name: name, Mode: v.Mode}
			if expected := parent.HostPath + "/" + name; v.HostPath != expected {
				gm.HostPath = v.HostPath
			}

			if expected := parent.ContainerPath + "/" + name; v.ContainerPath != expected {
				gm.ContainerPath = v.ContainerPath
			}

			parent.Mounts = append(parent.Mounts, gm)
			consumed[flatID] = true
		}

		groupedByParent[parentID] = &parent
		changed = true
	}

	if !changed {
		return volumes, false
	}

	out := make([]catalog.Volume, 0, len(volumes))
	insertedParent := make(map[string]bool)
	for _, v := range volumes {
		if consumed[v.ID] {
			parentID := flatParent(v.ID, rules)
			if parentID != "" && !insertedParent[parentID] {
				out = append(out, *groupedByParent[parentID])
				insertedParent[parentID] = true
			}

			continue
		}

		out = append(out, v)
	}

	return out, true
}

// stripSuffix removes a trailing "/<flat-suffix>" from path when present, so
// "/data/SteamLibrary/common" with flat ID "library-common" and parent
// "library" yields "/data/SteamLibrary". Falls back to the original path when
// the suffix doesn't match — the grouped form will then ship explicit overrides.
func stripSuffix(p, flatID, parentID string) string {
	if len(flatID) <= len(parentID)+1 {
		return p
	}

	leaf := flatID[len(parentID)+1:]
	if len(p) > len(leaf)+1 && p[len(p)-len(leaf)-1:] == "/"+leaf {
		return p[:len(p)-len(leaf)-1]
	}

	return p
}

func flatParent(id string, rules map[string][]string) string {
	for parent, names := range rules {
		for _, name := range names {
			if id == parent+"-"+name {
				return parent
			}
		}
	}

	return ""
}

