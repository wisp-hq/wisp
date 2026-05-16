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

		insertAt := len(users.Fields)
		for i, f := range users.Fields {
			if f.GetName() == "created" {
				insertAt = i
				break
			}
		}
		users.Fields.AddAt(insertAt,
			&core.TextField{Name: "theme", Max: 32},
			&core.SelectField{
				Name:      "role",
				Required:  true,
				Values:    []string{"admin", "player"},
				MaxSelect: 1,
			},
			&core.SelectField{
				Name:      "region",
				Values:    []string{"eu", "us", "jp", "wor"},
				MaxSelect: 1,
			},
			&core.JSONField{Name: "hudPrefs", MaxSize: 8192},
		)

		users.ListRule = types.Pointer("")
		users.ViewRule = types.Pointer("")
		users.CreateRule = types.Pointer("")

		return app.Save(users)
	}, func(app core.App) error {
		users, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return err
		}

		users.Fields.RemoveByName("theme")
		users.Fields.RemoveByName("role")
		users.Fields.RemoveByName("region")
		users.Fields.RemoveByName("hudPrefs")
		users.ListRule = nil
		users.ViewRule = nil
		users.CreateRule = nil
		return app.Save(users)
	})
}
