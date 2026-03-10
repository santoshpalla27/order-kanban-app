package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
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

	// Initialize PostgreSQL (versioned migrations + seed roles)
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

	// Purge expired refresh tokens — runs every hour
	go func() {
		for {
			time.Sleep(1 * time.Hour)
			if err := services.PurgeExpiredRefreshTokens(); err != nil {
				log.Printf("Refresh token purge error: %v", err)
			}
		}
	}()

	router := api.SetupRouter(cfg)

	srv := &http.Server{
		Addr:    fmt.Sprintf(":%s", cfg.Port),
		Handler: router,
	}

	// Start server in background goroutine
	go func() {
		log.Printf("Server starting on %s", srv.Addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("Failed to start server: %v", err)
		}
	}()

	// Block until SIGINT or SIGTERM
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutdown signal received — draining connections (30s)…")

	// Give in-flight requests and WS connections 30s to finish
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}
	log.Println("Server exited cleanly")
}
