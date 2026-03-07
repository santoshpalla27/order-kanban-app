package main

import (
	"fmt"
	"log"

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

	// Initialize R2 storage (required)
	services.InitR2(cfg)

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
