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

		collection := core.NewBaseCollection("app_shortcuts")
		collection.ListRule = types.Pointer("user = @request.auth.id")
		collection.ViewRule = types.Pointer("user = @request.auth.id")
		collection.UpdateRule = types.Pointer("user = @request.auth.id")

		collection.Fields.Add(
			&core.TextField{Name: "externalId", Required: true, Max: 256},
			&core.TextField{Name: "name", Required: true, Max: 256},
			&core.TextField{Name: "group", Max: 64},
			&core.JSONField{Name: "iconUrls", MaxSize: 1 << 14},
			&core.JSONField{Name: "launchParams", MaxSize: 1 << 14},
			&core.BoolField{Name: "hidden"},
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
			"idx_app_shortcuts_unique",
			true,
			"`user`, `app`, `externalId`",
			"",
		)
		collection.AddIndex(
			"idx_app_shortcuts_user_app",
			false,
			"`user`, `app`",
			"",
		)

		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("app_shortcuts")
		if err != nil {
			return err
		}

		return app.Delete(collection)
	})
}
