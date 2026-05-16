package participants

import (
	"crypto/rand"
	"encoding/base64"
	"errors"
	"time"

	"github.com/pocketbase/pocketbase/core"
)

const (
	Collection = "session_participants"
	tokenBytes = 24

	pbDateLayout = "2006-01-02 15:04:05.000Z"

	MinPlayerSlot = 2
	MaxPlayerSlot = 4

	staleSlotAfter = 90 * time.Second
)

type Role string

const (
	RolePlayer Role = "player"
	RoleViewer Role = "viewer"
)

var (
	ErrNotFound = errors.New("participant not found")
	ErrRevoked  = errors.New("participant revoked")
	ErrExpired  = errors.New("participant expired")
)

type Manager struct {
	pb core.App
}

func NewManager(pb core.App) *Manager {
	return &Manager{pb: pb}
}

func newToken() string {
	b := make([]byte, tokenBytes)
	_, _ = rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}

func nowPB() string {
	return time.Now().UTC().Format(pbDateLayout)
}

func (m *Manager) Create(sessionID, createdBy string, role Role, displayName string) (*core.Record, error) {
	col, err := m.pb.FindCollectionByNameOrId(Collection)
	if err != nil {
		return nil, err
	}

	rec := core.NewRecord(col)
	rec.Set("token", newToken())
	rec.Set("session", sessionID)
	rec.Set("role", string(role))
	rec.Set("createdBy", createdBy)
	if displayName != "" {
		rec.Set("displayName", displayName)
	}

	if err := m.pb.Save(rec); err != nil {
		return nil, err
	}

	return rec, nil
}

func (m *Manager) Get(id string) (*core.Record, error) {
	rec, err := m.pb.FindRecordById(Collection, id)
	if err != nil {
		return nil, ErrNotFound
	}

	return rec, nil
}

func (m *Manager) ListActiveForSession(sessionID string) ([]*core.Record, error) {
	return m.pb.FindRecordsByFilter(
		Collection,
		"session = {:s} && revokedAt = ''",
		"-created",
		200, 0,
		map[string]any{"s": sessionID},
	)
}

func (m *Manager) LookupByToken(token string) (*core.Record, error) {
	if token == "" {
		return nil, ErrNotFound
	}

	rec, err := m.pb.FindFirstRecordByFilter(
		Collection,
		"token = {:t}",
		map[string]any{"t": token},
	)
	if err != nil {
		return nil, ErrNotFound
	}

	if rec.GetString("revokedAt") != "" {
		return nil, ErrRevoked
	}

	if exp := rec.GetString("expiresAt"); exp != "" {
		t, perr := time.Parse(pbDateLayout, exp)
		if perr == nil && time.Now().UTC().After(t) {
			return nil, ErrExpired
		}
	}

	return rec, nil
}

func (m *Manager) Revoke(id string) error {
	rec, err := m.Get(id)
	if err != nil {
		return err
	}

	rec.Set("revokedAt", nowPB())
	rec.Set("slot", nil)
	return m.pb.Save(rec)
}

func (m *Manager) RevokeAllForSession(sessionID string) error {
	recs, err := m.ListActiveForSession(sessionID)
	if err != nil {
		return err
	}

	now := nowPB()
	for _, rec := range recs {
		rec.Set("revokedAt", now)
		rec.Set("slot", nil)
		_ = m.pb.Save(rec)
	}

	return nil
}

func (m *Manager) UpdateRole(id string, role Role) error {
	rec, err := m.Get(id)
	if err != nil {
		return err
	}

	rec.Set("role", string(role))
	if role != RolePlayer {
		rec.Set("slot", nil)
	}

	return m.pb.Save(rec)
}

// ReconcileSlot keeps slot consistent with role. Called from the OnRecordUpdate
// hook so PB-API-driven role changes don't leave stale slots — and so the host
// can promote a viewer to player without having to compute the slot themselves.
// Mutates rec in place; does NOT save (the caller is the hook chain).
//   - role=player + no slot ⇒ allocate the first free slot (2..4)
//   - role!=player ⇒ clear slot
func (m *Manager) ReconcileSlot(rec *core.Record) {
	role := Role(rec.GetString("role"))
	if role != RolePlayer {
		rec.Set("slot", nil)
		return
	}

	slot := rec.GetInt("slot")
	if slot >= MinPlayerSlot && slot <= MaxPlayerSlot {
		return
	}

	allocated, err := m.AllocateSlot(rec.GetString("session"))
	if err != nil || allocated == 0 {
		// No slot available: drop back to viewer rather than letting Selkies
		// hand out controller (slot=0 + role=player would be undefined).
		rec.Set("role", string(RoleViewer))
		rec.Set("slot", nil)
		return
	}

	rec.Set("slot", allocated)
}

func (m *Manager) LinkUser(id, userID string) error {
	rec, err := m.Get(id)
	if err != nil {
		return err
	}

	if rec.GetString("user") != "" {
		return nil
	}

	rec.Set("user", userID)
	return m.pb.Save(rec)
}

func (m *Manager) AllocateSlot(sessionID string) (int, error) {
	recs, err := m.ListActiveForSession(sessionID)
	if err != nil {
		return 0, err
	}

	cutoff := time.Now().UTC().Add(-staleSlotAfter)
	taken := map[int]bool{}
	for _, rec := range recs {
		s := rec.GetInt("slot")
		if s < MinPlayerSlot || s > MaxPlayerSlot {
			continue
		}

		seen := rec.GetString("lastSeenAt")
		if seen == "" {
			continue
		}

		t, perr := time.Parse(pbDateLayout, seen)
		if perr == nil && t.Before(cutoff) {
			continue
		}

		taken[s] = true
	}
	for s := MinPlayerSlot; s <= MaxPlayerSlot; s++ {
		if !taken[s] {
			return s, nil
		}
	}

	return 0, nil
}

func (m *Manager) ClaimSlot(id string, slot int) error {
	rec, err := m.Get(id)
	if err != nil {
		return err
	}

	if slot >= MinPlayerSlot && slot <= MaxPlayerSlot {
		rec.Set("slot", slot)
	} else {

		rec.Set("slot", nil)
	}

	rec.Set("lastSeenAt", nowPB())
	return m.pb.Save(rec)
}

func (m *Manager) ReleaseSlot(id string) error {
	rec, err := m.Get(id)
	if err != nil {
		return err
	}

	rec.Set("slot", nil)
	return m.pb.Save(rec)
}

func (m *Manager) Touch(id string) error {
	rec, err := m.Get(id)
	if err != nil {
		return err
	}

	rec.Set("lastSeenAt", nowPB())
	return m.pb.Save(rec)
}
