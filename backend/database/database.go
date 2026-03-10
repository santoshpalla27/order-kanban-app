package database

import (
	"embed"
	"errors"
	"log"
	"net/url"
	"strings"
	"time"

	"kanban-app/internal/models"

	migrate "github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	"github.com/golang-migrate/migrate/v4/source/iofs"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

var DB *gorm.DB

func Init(dsn string) {
	var err error
	DB, err = gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})
	if err != nil {
		log.Fatalf("Failed to connect to PostgreSQL: %v", err)
	}

	sqlDB, err := DB.DB()
	if err != nil {
		log.Fatalf("Failed to get underlying sql.DB: %v", err)
	}

	// Production-grade connection pool
	sqlDB.SetMaxOpenConns(25)
	sqlDB.SetMaxIdleConns(5)
	sqlDB.SetConnMaxLifetime(30 * time.Minute)
	sqlDB.SetConnMaxIdleTime(5 * time.Minute)

	if err := sqlDB.Ping(); err != nil {
		log.Fatalf("PostgreSQL ping failed: %v", err)
	}

	runMigrations(dsn)
	seedRoles()
	log.Println("PostgreSQL connected and migrated (pool: 25 open / 5 idle)")
}

// migrationDSN ensures the DSN passed to golang-migrate contains sslmode=disable.
// GORM's pgx driver falls back to no-SSL silently; lib/pq (used by migrate) defaults
// to sslmode=require and will fail against a local server without SSL.
func migrationDSN(dsn string) string {
	// URL format: postgres://...
	if strings.HasPrefix(dsn, "postgres://") || strings.HasPrefix(dsn, "postgresql://") {
		u, err := url.Parse(dsn)
		if err != nil {
			return dsn
		}
		q := u.Query()
		if q.Get("sslmode") == "" {
			q.Set("sslmode", "disable")
			u.RawQuery = q.Encode()
		}
		return u.String()
	}
	// Key=value format: host=... sslmode=...
	if !strings.Contains(dsn, "sslmode=") {
		return dsn + " sslmode=disable"
	}
	return dsn
}

// runMigrations applies pending versioned SQL migrations embedded in the binary.
// IF NOT EXISTS guards in migration 001 make it safe to run against databases
// previously managed by GORM AutoMigrate — existing tables are silently skipped.
func runMigrations(dsn string) {
	src, err := iofs.New(migrationsFS, "migrations")
	if err != nil {
		log.Fatalf("Migration source error: %v", err)
	}

	m, err := migrate.NewWithSourceInstance("iofs", src, migrationDSN(dsn))
	if err != nil {
		log.Fatalf("Failed to create migration runner: %v", err)
	}
	defer m.Close()

	if err := m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		log.Fatalf("Migration failed: %v", err)
	}
}

func seedRoles() {
	roles := []models.Role{
		{ID: 1, Name: "admin"},
		{ID: 2, Name: "manager"},
		{ID: 3, Name: "worker"},
	}
	for _, role := range roles {
		DB.FirstOrCreate(&role, models.Role{Name: role.Name})
	}
}
