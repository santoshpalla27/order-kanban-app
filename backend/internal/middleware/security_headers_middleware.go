package middleware

import "github.com/gin-gonic/gin"

// SecurityHeaders adds common HTTP security headers to every response.
func SecurityHeaders() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("X-Frame-Options", "DENY")
		c.Header("X-XSS-Protection", "1; mode=block")
		c.Header("Referrer-Policy", "strict-origin-when-cross-origin")
		// Prevent all content embedding — this is a pure JSON API, no frames/scripts/media needed
		c.Header("Content-Security-Policy", "default-src 'none'")
		// Tell browsers to only connect over HTTPS for the next year (only effective over TLS)
		c.Header("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		c.Next()
	}
}
