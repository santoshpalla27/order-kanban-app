package database

import (
	"log"
	"os"
	"path/filepath"

	"kanban-app/internal/models"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var DB *gorm.DB

func Init(dbPath string) {
	dir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		log.Fatalf("Failed to create database directory: %v", err)
	}

	var err error
	DB, err = gorm.Open(sqlite.Open(dbPath+"?_journal_mode=WAL&_busy_timeout=5000"), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	sqlDB, _ := DB.DB()
	sqlDB.SetMaxOpenConns(1)

	err = DB.AutoMigrate(
		&models.Role{},
		&models.User{},
		&models.Product{},
		&models.Attachment{},
		&models.Comment{},
		&models.ChatMessage{},
		&models.Notification{},
		&models.ActivityLog{},
	)
	if err != nil {
		log.Fatalf("Failed to run migrations: %v", err)
	}

	seedRoles()
	log.Println("Database initialized successfully")
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
