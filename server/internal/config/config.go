package config

import (
	"os"
	"strconv"
	"time"
)

type Config struct {
	HTTPAddr          string
	PocketBaseDir     string
	DataRoot          string
	HostDataRoot      string
	DockerNetwork     string
	GPU               string
	IdleTimeout       time.Duration
	CleanupInterval   time.Duration
	SessionRetention  time.Duration
	SpawnTimeout      time.Duration
	PullTimeout       time.Duration
	PublicBaseURL     string
	DevMode           bool
	ViteDevURL        string
	SuperuserEmail    string
	SuperuserPassword string
}

func Load() Config {
	return Config{
		HTTPAddr:          getEnv("HTTP_ADDR", ":8080"),
		PocketBaseDir:     getEnv("PB_DATA_DIR", "./pb_data"),
		DataRoot:          getEnv("DATA_ROOT", "/data"),
		HostDataRoot:      getEnv("HOST_DATA_ROOT", ""),
		DockerNetwork:     getEnv("DOCKER_NETWORK", "launcher-net"),
		GPU:               getEnv("GPU", ""),
		IdleTimeout:       getDuration("IDLE_TIMEOUT", 30*time.Minute),
		CleanupInterval:   getDuration("CLEANUP_INTERVAL", 60*time.Second),
		SessionRetention:  getDuration("SESSION_RETENTION", 24*time.Hour),
		SpawnTimeout:      getDuration("SPAWN_TIMEOUT", 30*time.Second),
		PullTimeout:       getDuration("PULL_TIMEOUT", 10*time.Minute),
		PublicBaseURL:     getEnv("PUBLIC_BASE_URL", "http://localhost:8080"),
		DevMode:           getBool("DEV_MODE", false),
		ViteDevURL:        getEnv("VITE_DEV_URL", "http://localhost:5173"),
		SuperuserEmail:    getEnv("PB_SUPERUSER_EMAIL", ""),
		SuperuserPassword: getEnv("PB_SUPERUSER_PASSWORD", ""),
	}
}

func getEnv(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}

	return fallback
}

func getDuration(key string, fallback time.Duration) time.Duration {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
	}

	return fallback
}

func getBool(key string, fallback bool) bool {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		if b, err := strconv.ParseBool(v); err == nil {
			return b
		}
	}

	return fallback
}
