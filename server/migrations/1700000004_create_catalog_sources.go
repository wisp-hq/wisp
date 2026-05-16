package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		collection := core.NewBaseCollection("catalog_sources")

		collection.ListRule = types.Pointer("@request.auth.id != \"\"")
		collection.ViewRule = types.Pointer("@request.auth.id != \"\"")
		collection.CreateRule = types.Pointer("@request.auth.role = \"admin\"")
		collection.UpdateRule = types.Pointer("@request.auth.role = \"admin\"")
		collection.DeleteRule = types.Pointer("@request.auth.role = \"admin\"")

		collection.Fields.Add(
			&core.URLField{Name: "url", Required: true},
			&core.TextField{Name: "name", Required: true, Max: 128},
			&core.BoolField{Name: "enabled"},
			&core.AutodateField{Name: "created", OnCreate: true},
			&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
		)

		collection.AddIndex("idx_catalog_sources_url", true, "`url`", "")

		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("catalog_sources")
		if err != nil {
			return err
		}

		return app.Delete(collection)
	})
}
