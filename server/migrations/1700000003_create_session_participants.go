package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		users, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return err
		}

		sessions, err := app.FindCollectionByNameOrId("sessions")
		if err != nil {
			return err
		}

		collection := core.NewBaseCollection("session_participants")
		collection.ListRule = types.Pointer("createdBy = @request.auth.id || user = @request.auth.id")
		collection.ViewRule = types.Pointer("createdBy = @request.auth.id || user = @request.auth.id")
		// Only the session host (createdBy) can mutate participant rows. Field-level
		// invariants (immutable token/session/createdBy/user, slot consistency)
		// are enforced by the OnRecordUpdate hook in main.go.
		collection.UpdateRule = types.Pointer("createdBy = @request.auth.id")

		collection.Fields.Add(
			&core.TextField{Name: "token", Required: true, Min: 32, Max: 64},
			&core.TextField{Name: "displayName", Max: 64},
			&core.SelectField{
				Name:      "role",
				Required:  true,
				Values:    []string{"player", "viewer"},
				MaxSelect: 1,
			},
			&core.NumberField{
				Name: "slot",
				Min:  types.Pointer(2.0),
				Max:  types.Pointer(4.0),
			},
			&core.DateField{Name: "lastSeenAt"},
			&core.DateField{Name: "revokedAt"},
			&core.DateField{Name: "expiresAt"},
			&core.RelationField{
				Name:          "session",
				Required:      true,
				CollectionId:  sessions.Id,
				CascadeDelete: true,
				MaxSelect:     1,
			},
			&core.RelationField{
				Name:         "user",
				CollectionId: users.Id,
				MaxSelect:    1,
			},
			&core.RelationField{
				Name:          "createdBy",
				Required:      true,
				CollectionId:  users.Id,
				CascadeDelete: true,
				MaxSelect:     1,
			},
			&core.AutodateField{Name: "created", OnCreate: true},
			&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
		)

		collection.AddIndex("idx_session_participants_token", true, "`token`", "")
		collection.AddIndex("idx_session_participants_session", false, "`session`", "")
		collection.AddIndex(
			"idx_session_participants_slot_unique",
			true,
			"`session`, `slot`",
			"`slot` IS NOT NULL AND `revokedAt` IS NULL",
		)

		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("session_participants")
		if err != nil {
			return err
		}

		return app.Delete(collection)
	})
}
