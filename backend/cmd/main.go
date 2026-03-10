package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
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
	// ── Structured logger ─────────────────────────────────────────────────────
	// JSON in production (LOG_FORMAT=json), human-readable text otherwise.
	var logger *slog.Logger
	if os.Getenv("LOG_FORMAT") == "json" {
		logger = slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	} else {
		logger = slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	}
	slog.SetDefault(logger)

	if err := godotenv.Load(); err != nil {
		slog.Info("No .env file found — using environment variables")
	}

	cfg := config.Load()

	if cfg.DatabaseURL == "" {
		slog.Error("DATABASE_URL is required")
		os.Exit(1)
	}

	// Initialize PostgreSQL (versioned migrations + seed roles)
	database.Init(cfg.DatabaseURL)

	// Initialize R2 storage
	services.InitR2(cfg)

	// Start WebSocket hub (single goroutine owns the client map)
	go handlers.Hub.Run()

	// Start PostgreSQL LISTEN/NOTIFY listener.
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

	// ── Background purge jobs ─────────────────────────────────────────────────

	purge := func(name string, interval time.Duration, fn func() error) {
		go func() {
			for {
				time.Sleep(interval)
				if err := fn(); err != nil {
					slog.Error("purge job failed", "job", name, "error", err)
				} else {
					slog.Info("purge job completed", "job", name)
				}
			}
		}()
	}

	purge("trash",         6*time.Hour,  services.PurgeExpiredDeletedProducts)
	purge("refresh_token", 1*time.Hour,  services.PurgeExpiredRefreshTokens)
	purge("notification",  24*time.Hour, func() error { return services.PurgeOldNotifications(5) })
	purge("activity_log",  24*time.Hour, func() error { return services.PurgeOldActivityLogs(10) })
	purge("chat_message",  24*time.Hour, func() error { return services.PurgeOldChatMessages(30) })

	// ── HTTP server ───────────────────────────────────────────────────────────

	router := api.SetupRouter(cfg)

	srv := &http.Server{
		Addr:              fmt.Sprintf(":%s", cfg.Port),
		Handler:           router,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	go func() {
		slog.Info("server starting", "addr", srv.Addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("server failed", "error", err)
			os.Exit(1)
		}
	}()

	// ── Graceful shutdown ─────────────────────────────────────────────────────

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	slog.Info("shutdown signal received — draining connections", "timeout", "30s")

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		slog.Error("server forced to shutdown", "error", err)
		os.Exit(1)
	}
	slog.Info("server exited cleanly")
}
