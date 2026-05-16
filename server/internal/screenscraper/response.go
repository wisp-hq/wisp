package screenscraper

import (
	"sort"
	"strings"

	"github.com/KevinBonnoron/wisp/internal/shortcuts"
)

// apiResponse mirrors the slice of the screenscraper JSON we care about. The
// real payload carries dozens of localised string tables and per-region
// scores; we ignore them and lean on the `medias` array, which is the only
// thing the UI consumes.
type apiResponse struct {
	Response struct {
		Game game `json:"jeu"`
	} `json:"response"`
}

type game struct {
	ID    string  `json:"id"`
	Media []media `json:"medias"`
}

type media struct {
	Type   string `json:"type"`
	Region string `json:"region"`
	URL    string `json:"url"`
	Format string `json:"format"`
}

// preferredMediaTypes lists the cover-art types we try, in order. box-2D is
// the cleanest tile artwork; the others are fallbacks for systems / regions
// that lack a 2D scan.
var preferredMediaTypes = []string{
	"box-2D",
	"box-3D",
	"box-texture",
	"wheel",
	"mixrbv2",
	"ss",
}

// regionRank decides which IconURL ends up first in the result. The client
// always picks the first entry by default, so we want the most universal
// region at index 0 — "wor" if present, then a stable continental order.
var regionRank = map[string]int{
	"wor": 0,
	"us":  1,
	"eu":  2,
	"jp":  3,
	"ss":  4,
}

func (g *game) toIconURLs() []shortcuts.IconURL {
	picked := pickCoverByRegion(g.Media)
	if len(picked) == 0 {
		return nil
	}

	out := make([]shortcuts.IconURL, 0, len(picked))
	for region, url := range picked {
		out = append(out, shortcuts.IconURL{Region: region, URL: url})
	}

	sort.SliceStable(out, func(i, j int) bool {
		return rankRegion(out[i].Region) < rankRegion(out[j].Region)
	})

	return out
}

// pickCoverByRegion collapses the long medias array into one URL per region,
// preferring the higher-ranked media types. The result map only contains
// regions that actually have artwork — empty URLs are filtered out.
func pickCoverByRegion(items []media) map[string]string {
	chosen := make(map[string]string)
	chosenRank := make(map[string]int)
	for _, it := range items {
		if it.URL == "" {
			continue
		}

		rank := mediaTypeRank(it.Type)
		if rank == -1 {
			continue
		}

		region := strings.ToLower(it.Region)
		if region == "" {
			region = "wor"
		}

		if existing, ok := chosenRank[region]; ok && existing <= rank {
			continue
		}

		chosen[region] = it.URL
		chosenRank[region] = rank
	}

	return chosen
}

func mediaTypeRank(t string) int {
	for i, want := range preferredMediaTypes {
		if t == want {
			return i
		}
	}

	return -1
}

func rankRegion(r string) int {
	if v, ok := regionRank[strings.ToLower(r)]; ok {
		return v
	}

	return 100
}
