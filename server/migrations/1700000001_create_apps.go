package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		collection := core.NewBaseCollection("apps")

		collection.ListRule = types.Pointer("@request.auth.id != \"\"")
		collection.ViewRule = types.Pointer("@request.auth.id != \"\"")
		collection.CreateRule = types.Pointer("@request.auth.role = \"admin\"")
		collection.UpdateRule = types.Pointer("@request.auth.role = \"admin\"")
		collection.DeleteRule = types.Pointer("@request.auth.role = \"admin\"")

		collection.Fields.Add(
			&core.TextField{
				Name:     "slug",
				Required: true,
				Pattern:  `^[a-z0-9][a-z0-9-]{1,62}$`,
			},
			&core.URLField{Name: "catalogSource"},
			&core.TextField{Name: "version", Max: 64},
			&core.JSONField{Name: "spec", MaxSize: 1 << 20},
			&core.JSONField{Name: "state", MaxSize: 1 << 16},
			&core.TextField{Name: "dismissedVersion", Max: 64},
			&core.AutodateField{Name: "created", OnCreate: true},
			&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
		)

		collection.AddIndex("idx_apps_slug", true, "`slug`", "")

		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("apps")
		if err != nil {
			return err
		}

		return app.Delete(collection)
	})
}
