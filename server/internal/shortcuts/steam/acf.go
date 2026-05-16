package steam

import (
	"bufio"
	"io"
	"strings"
)

// AppManifest is the subset of fields we extract from a Steam appmanifest_*.acf.
// The format is Valve's KeyValues: nested {} blocks of "key" "value" pairs.
type AppManifest struct {
	AppID  string
	Name   string
	StateFlags string
}

// parseACF tokenises a Steam KeyValues stream just enough to extract top-level
// string fields from the root "AppState" block. Depth is tracked by counting
// braces character-by-character per line — Steam manifests usually put `{` on
// its own line, but variants exist (e.g. `"InstalledDepots" {`) so we can't
// assume one brace per line.
func parseACF(r io.Reader) (AppManifest, error) {
	var m AppManifest
	scanner := bufio.NewScanner(r)
	scanner.Buffer(make([]byte, 64*1024), 1024*1024)

	depth := 0
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "//") {
			continue
		}

		if depth == 1 {
			if key, value, ok := splitKV(line); ok {
				switch key {
				case "appid":
					m.AppID = value
				case "name":
					m.Name = value
				case "StateFlags":
					m.StateFlags = value
				}
			}
		}

		for _, c := range line {
			switch c {
			case '{':
				depth++
			case '}':
				depth--
			}
		}
	}

	return m, scanner.Err()
}

// splitKV pulls two quoted tokens out of a line. Returns (key, value, true)
// when both are present. Skips any line that isn't a clean "key" "value" pair
// (e.g. block headers, comments).
func splitKV(line string) (string, string, bool) {
	first, rest, ok := nextQuoted(line)
	if !ok {
		return "", "", false
	}

	second, _, ok := nextQuoted(rest)
	if !ok {
		return "", "", false
	}

	return first, second, true
}

func nextQuoted(s string) (string, string, bool) {
	start := strings.IndexByte(s, '"')
	if start < 0 {
		return "", "", false
	}

	end := strings.IndexByte(s[start+1:], '"')
	if end < 0 {
		return "", "", false
	}

	return s[start+1 : start+1+end], s[start+1+end+1:], true
}
