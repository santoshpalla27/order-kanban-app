package middleware

import (
	"log/slog"
	"time"

	"github.com/gin-gonic/gin"
)

// StructuredLogger replaces Gin's default console logger with structured slog output.
// Each request emits one INFO log line with method, path, status, latency, and request_id.
func StructuredLogger() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()

		reqID, _ := c.Get(RequestIDKey)
		slog.Info("request",
			"method",     c.Request.Method,
			"path",       c.Request.URL.Path,
			"status",     c.Writer.Status(),
			"latency_ms", time.Since(start).Milliseconds(),
			"ip",         c.ClientIP(),
			"request_id", reqID,
		)
	}
}
