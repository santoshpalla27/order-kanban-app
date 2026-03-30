package middleware

import "github.com/gin-gonic/gin"

// SecurityHeaders adds common HTTP security headers to every response.
func SecurityHeaders() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("X-Frame-Options", "DENY")
		c.Header("X-XSS-Protection", "1; mode=block")
		c.Header("Referrer-Policy", "strict-origin-when-cross-origin")
		// HSTS: enforce HTTPS for 1 year including subdomains
		c.Header("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		// CSP: restrict resources to same origin; allow HTTPS for images and API calls
		c.Header("Content-Security-Policy",
			"default-src 'self'; "+
				"script-src 'self' 'unsafe-inline'; "+
				"style-src 'self' 'unsafe-inline'; "+
				"img-src 'self' data: https:; "+
				"connect-src 'self' https:; "+
				"font-src 'self' data:; "+
				"frame-ancestors 'none'")
		c.Next()
	}
}
