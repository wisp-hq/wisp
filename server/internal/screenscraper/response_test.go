package screenscraper

import (
	"encoding/json"
	"testing"
)

const sampleResponse = `{
  "response": {
    "jeu": {
      "id": "1234",
      "medias": [
        {"type": "ss", "region": "us", "url": "https://ss/screenshot.png", "format": "png"},
        {"type": "box-2D", "region": "us", "url": "https://ss/box-us.png", "format": "png"},
        {"type": "box-2D", "region": "eu", "url": "https://ss/box-eu.png", "format": "png"},
        {"type": "box-3D", "region": "us", "url": "https://ss/box3d-us.png", "format": "png"},
        {"type": "wheel", "region": "wor", "url": "https://ss/wheel-wor.png", "format": "png"}
      ]
    }
  }
}`

func TestResponseToIconURLs(t *testing.T) {
	var raw apiResponse
	if err := json.Unmarshal([]byte(sampleResponse), &raw); err != nil {
		t.Fatal(err)
	}

	icons := raw.Response.Game.toIconURLs()
	if len(icons) == 0 {
		t.Fatalf("expected at least one icon url")
	}

	// box-2D must beat ss for the same region, and "wor" must rank above
	// "us"/"eu" — so the first entry should be the wheel from "wor".
	if icons[0].Region != "wor" {
		t.Errorf("expected first region 'wor', got %q (%v)", icons[0].Region, icons)
	}

	for _, ic := range icons {
		if ic.Region == "us" && ic.URL != "https://ss/box-us.png" {
			t.Errorf("expected box-2D to win over ss for us, got %q", ic.URL)
		}
	}
}

func TestSystemIDLookup(t *testing.T) {
	if id, ok := systemIDFor("psx"); !ok || id != "57" {
		t.Errorf("psx -> %q ok=%v, want 57", id, ok)
	}

	if id, ok := systemIDFor("PSX "); !ok || id != "57" {
		t.Errorf("normalisation failed: %q ok=%v", id, ok)
	}

	if _, ok := systemIDFor("unknown-system"); ok {
		t.Errorf("expected unknown system to return ok=false")
	}
}
