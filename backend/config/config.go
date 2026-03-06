package config

import "os"

type Config struct {
	Port      string
	JWTSecret string
	DBPath    string
	UploadDir string
}

func Load() *Config {
	return &Config{
		Port:      getEnv("PORT", "8080"),
		JWTSecret: getEnv("JWT_SECRET", "kanban-secret-key-change-in-production"),
		DBPath:    getEnv("DB_PATH", "./data/kanban.db"),
		UploadDir: getEnv("UPLOAD_DIR", "./uploads"),
	}
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}
