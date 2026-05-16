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

		apps, err := app.FindCollectionByNameOrId("apps")
		if err != nil {
			return err
		}

		collection := core.NewBaseCollection("sessions")
		collection.ListRule = types.Pointer("user = @request.auth.id")
		collection.ViewRule = types.Pointer("")

		collection.Fields.Add(
			&core.TextField{Name: "containerName", Max: 256},
			&core.TextField{Name: "containerIp", Max: 64},
			&core.NumberField{
				Name: "port",
				Min:  types.Pointer(0.0),
				Max:  types.Pointer(65535.0),
			},
			&core.SelectField{
				Name:      "status",
				Required:  true,
				Values:    []string{"starting", "ready", "stopping", "stopped", "failed"},
				MaxSelect: 1,
			},
			&core.TextField{Name: "failureReason", Max: 1024},
			&core.TextField{Name: "failureCode", Max: 64},
			&core.TextField{Name: "inviteToken", Max: 64},
			&core.RelationField{
				Name:          "user",
				Required:      true,
				CollectionId:  users.Id,
				CascadeDelete: true,
				MaxSelect:     1,
			},
			&core.RelationField{
				Name:          "app",
				Required:      true,
				CollectionId:  apps.Id,
				CascadeDelete: true,
				MaxSelect:     1,
			},
			&core.AutodateField{Name: "created", OnCreate: true},
			&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
		)

		collection.AddIndex(
			"idx_sessions_active_unique",
			true,
			"`user`, `app`",
			"`status` = 'starting' OR `status` = 'ready' OR `status` = 'stopping'",
		)
		collection.AddIndex("idx_sessions_invite_token", true, "`inviteToken`", "`inviteToken` != ''")

		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("sessions")
		if err != nil {
			return err
		}

		return app.Delete(collection)
	})
}
