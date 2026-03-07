package middleware

import (
	"errors"
	"io"
	"net/http"

	"github.com/gin-gonic/gin"
)

// MaxBodySize wraps the request body with an io.LimitedReader so that reads
// beyond maxBytes return an error before the payload is ever buffered into
// memory by Gin's JSON binding.
//
// 2 MB is generous for every JSON endpoint in this app (products, comments,
// chat messages). File bytes never reach this server — they go direct to R2
// via presigned URL — so the limit does not affect uploads.
func MaxBodySize(maxBytes int64) gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Body != nil && c.Request.Body != http.NoBody {
			c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxBytes)
		}
		c.Next()

		// If a handler already responded we have nothing to do.
		if c.IsAborted() {
			return
		}

		// Check whether MaxBytesReader triggered during the handler.
		// Gin's ShouldBind / c.BindJSON will propagate the error via c.Errors.
		for _, e := range c.Errors {
			var mbe *http.MaxBytesError
			if errors.As(e.Err, &mbe) {
				c.AbortWithStatusJSON(http.StatusRequestEntityTooLarge, gin.H{
					"error": "Request body too large.",
				})
				return
			}
		}
	}
}
