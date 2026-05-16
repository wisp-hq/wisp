package screenscraper

import "strings"

// systemIDs maps the group names emulator launchers use ("psx", "snes",
// "megadrive"...) to screenscraper's numeric systemeid. Sending a system id
// is optional when hashes are precise, but it disambiguates the common case
// of multi-system ROMs (CD-i discs, neo-geo carts) and speeds up the API.
//
// Keep keys lowercase and ASCII; lookups normalise the input the same way.
var systemIDs = map[string]string{
	"3do":          "29",
	"amiga":        "64",
	"arcade":       "75",
	"atari2600":    "26",
	"atari5200":    "40",
	"atari7800":    "41",
	"atarist":      "42",
	"colecovision": "48",
	"dreamcast":    "23",
	"fbneo":        "75",
	"gamegear":     "21",
	"gb":           "9",
	"gba":          "12",
	"gbc":          "10",
	"intellivision": "115",
	"jaguar":       "27",
	"lynx":         "28",
	"mame":         "75",
	"mastersystem": "2",
	"megacd":       "20",
	"megadrive":    "1",
	"n64":          "14",
	"naomi":        "56",
	"nds":          "15",
	"neogeo":       "142",
	"nes":          "3",
	"ngp":          "25",
	"ngpc":         "82",
	"pcengine":     "31",
	"pcfx":         "72",
	"ps2":          "58",
	"psp":          "61",
	"psx":          "57",
	"saturn":       "22",
	"scummvm":      "123",
	"sega32x":      "19",
	"segacd":       "20",
	"sg1000":       "109",
	"snes":         "4",
	"vectrex":      "102",
	"virtualboy":   "11",
	"wonderswan":   "45",
	"wonderswancolor": "46",
	"zxspectrum":   "76",
}

func systemIDFor(group string) (string, bool) {
	if group == "" {
		return "", false
	}

	id, ok := systemIDs[strings.ToLower(strings.TrimSpace(group))]
	return id, ok
}
