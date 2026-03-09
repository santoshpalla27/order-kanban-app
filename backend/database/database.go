package database

import (
	"log"
	"time"

	"kanban-app/internal/models"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

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

	if err := DB.AutoMigrate(
		&models.Role{},
		&models.User{},
		&models.Product{},
		&models.Attachment{},
		&models.Comment{},
		&models.ChatMessage{},
		&models.Notification{},
		&models.ActivityLog{},
	); err != nil {
		log.Fatalf("AutoMigrate failed: %v", err)
	}

	seedRoles()
	log.Println("PostgreSQL connected and migrated (pool: 25 open / 5 idle)")
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
