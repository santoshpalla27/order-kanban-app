package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// ApprovedOnly blocks requests from users whose role is "pending".
// It must be applied after AuthMiddleware (which sets the "role" context value).
// Exempt routes (/auth/me, /auth/logout) are registered outside this middleware group
// so the client can still poll for its updated role without getting a 403.
func ApprovedOnly() gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.GetString("role") == "pending" {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"error": "Your account is pending approval by an administrator",
			})
			return
		}
		c.Next()
	}
}
