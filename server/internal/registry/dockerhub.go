package registry

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
)

const dockerHubBase = "https://hub.docker.com"

type dockerHubSearchResp struct {
	Results []struct {
		RepoName    string `json:"repo_name"`
		ShortDesc   string `json:"short_description"`
		StarCount   int    `json:"star_count"`
		IsOfficial  bool   `json:"is_official"`
		IsAutomated bool   `json:"is_automated"`
	} `json:"results"`
}

type dockerHubTagsResp struct {
	Results []struct {
		Name        string `json:"name"`
		LastUpdated string `json:"last_updated"`
	} `json:"results"`
}

func searchDockerHub(ctx context.Context, hc *http.Client, query string, limit int) ([]ImageMatch, error) {
	if limit <= 0 {
		limit = 10
	}

	u := fmt.Sprintf("%s/v2/search/repositories/?query=%s&page_size=%d", dockerHubBase, url.QueryEscape(query), limit)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}

	resp, err := hc.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("docker hub search: status %d", resp.StatusCode)
	}

	var body dockerHubSearchResp
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return nil, err
	}

	out := make([]ImageMatch, 0, len(body.Results))
	for _, r := range body.Results {
		out = append(out, ImageMatch{
			Ref:         r.RepoName,
			Description: r.ShortDesc,
			Official:    r.IsOfficial,
			Stars:       r.StarCount,
			Source:      "dockerhub",
		})
	}
	return out, nil
}

func tagsDockerHub(ctx context.Context, hc *http.Client, repo, filter string, limit int) ([]TagMatch, error) {
	if limit <= 0 {
		limit = 20
	}

	repo = strings.TrimPrefix(repo, "library/")
	if !strings.Contains(repo, "/") {
		repo = "library/" + repo
	}

	q := url.Values{}
	q.Set("page_size", fmt.Sprintf("%d", limit))
	q.Set("ordering", "last_updated")
	if filter != "" {
		q.Set("name", filter)
	}

	u := fmt.Sprintf("%s/v2/repositories/%s/tags/?%s", dockerHubBase, repo, q.Encode())
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}

	resp, err := hc.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, nil
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("docker hub tags: status %d", resp.StatusCode)
	}

	var body dockerHubTagsResp
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return nil, err
	}

	out := make([]TagMatch, 0, len(body.Results))
	for _, r := range body.Results {
		out = append(out, TagMatch{Tag: r.Name, Pushed: r.LastUpdated})
	}
	return out, nil
}
