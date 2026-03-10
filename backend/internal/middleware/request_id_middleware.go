package middleware

import (
	"crypto/rand"
	"encoding/hex"

	"github.com/gin-gonic/gin"
)

const RequestIDKey = "request_id"
const RequestIDHeader = "X-Request-ID"

// RequestID injects a unique request ID into every request.
// If the caller supplies X-Request-ID it is reused (useful for tracing across services);
// otherwise a 16-byte random hex ID is generated.
// The ID is set on the response header and stored in the Gin context.
func RequestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.GetHeader(RequestIDHeader)
		if id == "" {
			b := make([]byte, 16)
			rand.Read(b) //nolint:errcheck — crypto/rand.Read never fails on supported platforms
			id = hex.EncodeToString(b)
		}
		c.Set(RequestIDKey, id)
		c.Header(RequestIDHeader, id)
		c.Next()
	}
}
