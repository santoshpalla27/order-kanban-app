package main

import (
	"fmt"
	"log"
	"os"

	"kanban-app/config"
	"kanban-app/database"
	"kanban-app/internal/api"
	"kanban-app/internal/api/handlers"
	"kanban-app/internal/services"

	"github.com/joho/godotenv"
)

func main() {
	// Load .env file if it exists
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found — using environment variables")
	}

	cfg := config.Load()

	// Initialize database
	database.Init(cfg.DBPath)

	// Initialize S3 (or fallback to local disk)
	services.InitR2(cfg)

	// Ensure local upload directory exists (when not using S3)
	if !cfg.R2Enabled {
		if err := os.MkdirAll(cfg.UploadDir, 0755); err != nil {
			log.Fatalf("Failed to create upload directory: %v", err)
		}
	}

	// Start WebSocket hub
	go handlers.Hub.Run()

	// Setup router
	router := api.SetupRouter(cfg)

	// Start server
	addr := fmt.Sprintf(":%s", cfg.Port)
	log.Printf("Server starting on %s", addr)
	if err := router.Run(addr); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
