package main

import (
	"fmt"
	"log"
	"time"

	"kanban-app/config"
	"kanban-app/database"
	"kanban-app/internal/api"
	"kanban-app/internal/api/handlers"
	"kanban-app/internal/services"

	"github.com/joho/godotenv"
)

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found — using environment variables")
	}

	cfg := config.Load()

	if cfg.DatabaseURL == "" {
		log.Fatal("DATABASE_URL is required")
	}

	// Initialize PostgreSQL (AutoMigrate + seed roles)
	database.Init(cfg.DatabaseURL)

	// Initialize R2 storage
	services.InitR2(cfg)

	// Start WebSocket hub (single goroutine owns the client map)
	go handlers.Hub.Run()

	// Start PostgreSQL LISTEN/NOTIFY listener.
	// All WS broadcasts are routed through this so that multiple backend
	// instances can each deliver to their own connected clients.
	database.StartListener(cfg.DatabaseURL, func(eventType string, excludeID, userID uint, wsMsg []byte) {
		switch eventType {
		case "broadcast":
			handlers.Hub.BroadcastMessage(wsMsg)
		case "broadcast_except":
			handlers.Hub.BroadcastExcept(excludeID, wsMsg)
		case "user":
			handlers.Hub.SendToUser(userID, wsMsg)
		}
	})

	// Purge products past their 10-day grace period — runs every 6 hours
	go func() {
		for {
			time.Sleep(6 * time.Hour)
			if err := services.PurgeExpiredDeletedProducts(); err != nil {
				log.Printf("Trash purge error: %v", err)
			}
		}
	}()

	router := api.SetupRouter(cfg)

	addr := fmt.Sprintf(":%s", cfg.Port)
	log.Printf("Server starting on %s", addr)
	if err := router.Run(addr); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
