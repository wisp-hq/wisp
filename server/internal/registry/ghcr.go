package registry

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
)

const ghcrBase = "https://ghcr.io"

type ghcrTokenResp struct {
	Token string `json:"token"`
}

type ghcrTagsResp struct {
	Name string   `json:"name"`
	Tags []string `json:"tags"`
}

func ghcrToken(ctx context.Context, hc *http.Client, repo string) (string, error) {
	u := fmt.Sprintf("%s/token?scope=%s&service=ghcr.io", ghcrBase, url.QueryEscape("repository:"+repo+":pull"))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return "", err
	}

	resp, err := hc.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("ghcr token: status %d", resp.StatusCode)
	}

	var body ghcrTokenResp
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return "", err
	}
	return body.Token, nil
}

func tagsGHCR(ctx context.Context, hc *http.Client, repo, filter string, limit int) ([]TagMatch, error) {
	if limit <= 0 {
		limit = 50
	}

	tok, err := ghcrToken(ctx, hc, repo)
	if err != nil {
		return nil, err
	}

	u := fmt.Sprintf("%s/v2/%s/tags/list?n=%d", ghcrBase, repo, limit)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+tok)
	req.Header.Set("Accept", "application/json")

	resp, err := hc.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, nil
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("ghcr tags: status %d", resp.StatusCode)
	}

	var body ghcrTagsResp
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return nil, err
	}

	out := make([]TagMatch, 0, len(body.Tags))
	for _, t := range body.Tags {
		if filter != "" && !containsFold(t, filter) {
			continue
		}

		out = append(out, TagMatch{Tag: t})
	}
	return out, nil
}
