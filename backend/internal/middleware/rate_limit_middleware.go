package middleware

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

type windowEntry struct {
	count int
	reset time.Time
}

type rateLimiter struct {
	mu      sync.Mutex
	entries map[string]*windowEntry
	limit   int
	window  time.Duration
}

func newRateLimiter(limit int, window time.Duration) *rateLimiter {
	rl := &rateLimiter{
		entries: make(map[string]*windowEntry),
		limit:   limit,
		window:  window,
	}
	go rl.cleanup()
	return rl
}

// cleanup removes stale entries every minute to prevent unbounded memory growth.
func (rl *rateLimiter) cleanup() {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		now := time.Now()
		rl.mu.Lock()
		for ip, e := range rl.entries {
			if now.After(e.reset) {
				delete(rl.entries, ip)
			}
		}
		rl.mu.Unlock()
	}
}

func (rl *rateLimiter) allow(ip string) (bool, time.Duration) {
	now := time.Now()
	rl.mu.Lock()
	defer rl.mu.Unlock()

	e, ok := rl.entries[ip]
	if !ok || now.After(e.reset) {
		rl.entries[ip] = &windowEntry{count: 1, reset: now.Add(rl.window)}
		return true, 0
	}

	e.count++
	if e.count > rl.limit {
		return false, time.Until(e.reset)
	}
	return true, 0
}

// authLimiter: 10 attempts per minute per IP.
// Enough for normal use; stops brute-force attacks cold.
var authLimiter = newRateLimiter(10, time.Minute)

// portalLimiter: 60 requests per minute per IP for customer portal.
// Higher than auth since customers actively poll (every 10-15 s), but still
// blocks enumeration and flooding.
var portalLimiter = newRateLimiter(60, time.Minute)

// RateLimitAuth applies rate limiting to authentication endpoints.
func RateLimitAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		ip := c.ClientIP()
		ok, retryAfter := authLimiter.allow(ip)
		if !ok {
			c.Header("Retry-After", retryAfter.String())
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
				"error": "Too many requests. Please try again later.",
			})
			return
		}
		c.Next()
	}
}

// RateLimitPortal applies rate limiting to public customer portal endpoints.
func RateLimitPortal() gin.HandlerFunc {
	return func(c *gin.Context) {
		ip := c.ClientIP()
		ok, retryAfter := portalLimiter.allow(ip)
		if !ok {
			c.Header("Retry-After", retryAfter.String())
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
				"error": "Too many requests. Please try again later.",
			})
			return
		}
		c.Next()
	}
}
