package sessions

import "time"

type Status string

const (
	StatusStarting Status = "starting"
	StatusReady    Status = "ready"
	StatusStopping Status = "stopping"
	StatusStopped  Status = "stopped"
	StatusFailed   Status = "failed"
)

type Session struct {
	ID            string    `json:"id"`
	User          string    `json:"user"`
	App           string    `json:"app"`
	ContainerName string    `json:"containerName"`
	ContainerIP   string    `json:"containerIp"`
	Port          int       `json:"port"`
	Status        Status    `json:"status"`
	Created       time.Time `json:"created"`
	Updated       time.Time `json:"updated"`
}

// AppState is the runtime state persisted on apps.state. It's populated by Wisp
// (docker pull worker, status refresher) and never mutated by the admin.
type AppState struct {
	ImageDigest string      `json:"imageDigest,omitempty"`
	ImageStatus ImageStatus `json:"imageStatus,omitempty"`
}
