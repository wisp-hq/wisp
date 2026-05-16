package registry

import (
	"errors"
	"strings"
)

type ImageMatch struct {
	Ref         string `json:"ref"`
	Description string `json:"description,omitempty"`
	Official    bool   `json:"official,omitempty"`
	Stars       int    `json:"stars,omitempty"`
	Source      string `json:"source"`
}

type TagMatch struct {
	Tag    string `json:"tag"`
	Pushed string `json:"pushed,omitempty"`
}

type ImageRef struct {
	Host string
	Repo string
	Tag  string
}

var ErrUnsupportedHost = errors.New("unsupported registry host")

func ParseImageRef(raw string) (ImageRef, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ImageRef{}, errors.New("empty image reference")
	}

	name, tag := splitTag(raw)

	host := "docker.io"
	repo := name
	if i := strings.IndexByte(name, '/'); i > 0 {
		head := name[:i]
		if strings.ContainsAny(head, ".:") || head == "localhost" {
			host = head
			repo = name[i+1:]
		}
	}

	if host == "docker.io" && !strings.Contains(repo, "/") {
		repo = "library/" + repo
	}

	return ImageRef{Host: host, Repo: repo, Tag: tag}, nil
}

func splitTag(name string) (string, string) {
	at := strings.LastIndexByte(name, '@')
	if at >= 0 {
		name = name[:at]
	}

	slash := strings.LastIndexByte(name, '/')
	colon := strings.LastIndexByte(name, ':')
	if colon > slash {
		return name[:colon], name[colon+1:]
	}

	return name, ""
}
