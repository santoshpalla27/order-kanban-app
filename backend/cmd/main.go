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

	if cfg.JWTSecret == "kanban-secret-key-change-in-production" {
		slog.Warn("JWT_SECRET is using the default insecure value — set a strong random secret in production")
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

	// tracked jobs record their result in purge_logs for the Purge Status page.
	tracked := func(name string, interval time.Duration, fn func() (int64, error)) {
		go func() {
			for {
				time.Sleep(interval)
				count, err := fn()
				services.RecordPurgeLog(name, count, err)
				if err != nil {
					slog.Error("purge job failed", "job", name, "error", err)
				} else {
					slog.Info("purge job completed", "job", name, "rows_deleted", count)
				}
			}
		}()
	}

	// refresh_token is internal — no need to surface it in the UI.
	go func() {
		for {
			time.Sleep(1 * time.Hour)
			if err := services.PurgeExpiredRefreshTokens(); err != nil {
				slog.Error("purge job failed", "job", "refresh_token", "error", err)
			}
		}
	}()

	tracked("trash",        6*time.Hour,  func() (int64, error) { return services.PurgeExpiredDeletedProducts() })
	tracked("notification", 24*time.Hour, func() (int64, error) { return services.PurgeOldNotifications(5) })
	tracked("activity_log", 24*time.Hour, func() (int64, error) { return services.PurgeOldActivityLogs(10) })
	tracked("chat_message", 24*time.Hour, func() (int64, error) { return services.PurgeOldChatMessages(30) })

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
