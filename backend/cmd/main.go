package main

import (
	"fmt"
	"log"
	"os"

	"kanban-app/config"
	"kanban-app/database"
	"kanban-app/internal/api"
	"kanban-app/internal/api/handlers"
)

func main() {
	cfg := config.Load()

	// Ensure upload directory exists
	if err := os.MkdirAll(cfg.UploadDir, 0755); err != nil {
		log.Fatalf("Failed to create upload directory: %v", err)
	}

	// Initialize database
	database.Init(cfg.DBPath)

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
