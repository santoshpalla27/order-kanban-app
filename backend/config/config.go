package config

import "os"

type Config struct {
	Port        string
	JWTSecret   string
	DBPath      string
	CORSOrigins string // Comma-separated allowed origins

	// R2 / S3-compatible Storage
	R2Bucket    string
	R2AccountID string
	R2AccessKey string
	R2SecretKey string
	R2Endpoint  string // Auto-built from AccountID, or set manually
}

func Load() *Config {
	accountID := getEnv("R2_ACCOUNT_ID", "")
	endpoint := getEnv("R2_ENDPOINT", "")

	// Auto-build R2 endpoint from account ID if not explicitly set
	if endpoint == "" && accountID != "" {
		endpoint = "https://" + accountID + ".r2.cloudflarestorage.com"
	}

	return &Config{
		Port:        getEnv("PORT", "8080"),
		JWTSecret:   getEnv("JWT_SECRET", "kanban-secret-key-change-in-production"),
		DBPath:      getEnv("DB_PATH", "./data/kanban.db"),
		CORSOrigins: getEnv("CORS_ORIGINS", "*"),

		R2Bucket:    getEnv("R2_BUCKET", ""),
		R2AccountID: accountID,
		R2AccessKey: getEnv("R2_ACCESS_KEY", ""),
		R2SecretKey: getEnv("R2_SECRET_KEY", ""),
		R2Endpoint:  endpoint,
	}
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}
