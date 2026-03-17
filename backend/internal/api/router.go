package api

import (
	"strings"

	"kanban-app/config"
	"kanban-app/internal/api/handlers"
	"kanban-app/internal/middleware"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func SetupRouter(cfg *config.Config) *gin.Engine {
	// gin.New() instead of gin.Default() — we supply our own structured logger
	r := gin.New()
	r.Use(gin.Recovery()) // keep the panic recovery

	origins := strings.Split(cfg.CORSOrigins, ",")
	for i := range origins {
		origins[i] = strings.TrimSpace(origins[i])
	}

	r.Use(middleware.RequestID())       // inject X-Request-ID first
	r.Use(middleware.StructuredLogger()) // structured access log carrying request_id
	r.Use(middleware.SecurityHeaders()) // X-Content-Type-Options, X-Frame-Options, etc.
	r.Use(cors.New(cors.Config{
		AllowOrigins:     origins,
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		ExposeHeaders:    []string{"Content-Length", "X-Request-ID"},
		AllowCredentials: cfg.CORSOrigins != "*",
	}))

	// Global 2 MB body limit for all JSON endpoints.
	// File uploads bypass this — bytes go directly to R2 via presigned URL.
	r.Use(middleware.MaxBodySize(2 << 20))

	authHandler := handlers.NewAuthHandler(cfg)
	productHandler := handlers.NewProductHandler()
	attachmentHandler := handlers.NewAttachmentHandler()
	activityHandler := handlers.NewActivityHandler()
	commentHandler := handlers.NewCommentHandler()
	chatHandler := handlers.NewChatHandler()
	notificationHandler := handlers.NewNotificationHandler()
	userHandler := handlers.NewUserHandler()

	api := r.Group("/api")
	{
		// Health check (unauthenticated)
		api.GET("/health", func(c *gin.Context) {
			c.JSON(200, gin.H{"status": "ok"})
		})

		// Public routes — rate limited to 10 req/min per IP
		auth := api.Group("/auth")
		auth.Use(middleware.RateLimitAuth())
		{
			auth.POST("/register", authHandler.Register)
			auth.POST("/login", authHandler.Login)
			auth.POST("/refresh", authHandler.Refresh)
		}

		// Logout — no auth middleware so expired-access-token clients can still call it
		api.POST("/auth/logout", authHandler.Logout)

		// Protected routes
		protected := api.Group("")
		protected.Use(middleware.AuthMiddleware(cfg))
		{
			// Auth
			protected.GET("/auth/me", authHandler.GetMe)

			// WebSocket
			protected.GET("/ws", handlers.HandleWebSocket)

			// Products
			products := protected.Group("/products")
			{
				products.GET("", productHandler.GetProducts)
				products.GET("/deleted", middleware.RBACMiddleware("admin", "manager"), productHandler.GetDeletedProducts)
				products.POST("/:id/restore", middleware.RBACMiddleware("admin", "manager"), productHandler.RestoreProduct)
				products.GET("/:id", productHandler.GetProduct)
				products.POST("", middleware.RBACMiddleware("admin", "manager", "organiser"), productHandler.CreateProduct)
				products.PUT("/:id", middleware.RBACMiddleware("admin", "manager", "organiser"), productHandler.UpdateProduct)
				products.PATCH("/:id/status", middleware.RBACMiddleware("admin", "manager", "organiser"), productHandler.UpdateStatus)
				products.DELETE("/:id", middleware.RBACMiddleware("admin", "manager"), productHandler.DeleteProduct)

				// Attachments (nested under products/:id)
				products.GET("/:id/attachments", attachmentHandler.GetByProduct)

				products.GET("/:id/attachments/presign", middleware.RBACMiddleware("admin", "manager", "organiser", "employee"), attachmentHandler.GetPresignedUploadURL)
				products.POST("/:id/attachments/confirm", middleware.RBACMiddleware("admin", "manager", "organiser", "employee"), attachmentHandler.ConfirmUpload)

				// Comments (nested under products/:id)
				products.GET("/:id/comments", commentHandler.GetByProduct)
				products.POST("/:id/comments", middleware.RBACMiddleware("admin", "manager", "organiser", "employee"), commentHandler.Create)
			}

			// Standalone attachment/comment routes
			protected.GET("/attachments/:id/download", attachmentHandler.Download)
			protected.DELETE("/attachments/:id", attachmentHandler.Delete)
			protected.GET("/activity", activityHandler.GetRecent)
			protected.PUT("/comments/:id", middleware.RBACMiddleware("admin", "manager", "organiser", "employee"), commentHandler.Update)
			protected.DELETE("/comments/:id", middleware.RBACMiddleware("admin", "manager", "organiser", "employee"), commentHandler.Delete)

			// Chat
			chat := protected.Group("/chat")
			{
				chat.GET("/messages", chatHandler.GetMessages)
				chat.POST("/messages", middleware.RBACMiddleware("admin", "manager", "organiser", "employee"), chatHandler.SendMessage)
			}

			// Notifications
			notifications := protected.Group("/notifications")
			{
				notifications.GET("", notificationHandler.GetNotifications)
				notifications.GET("/unread-count", notificationHandler.GetUnreadCount)
				notifications.PATCH("/:id/read", notificationHandler.MarkAsRead)
				notifications.POST("/read-all", notificationHandler.MarkAllAsRead)
				notifications.GET("/unread-summary", notificationHandler.GetUnreadSummary)
				notifications.POST("/read-by-entity-type", notificationHandler.MarkReadByEntityAndTypes)
			}

			// Profile management (all authenticated users)
			protected.GET("/users/me/avatar-presign", userHandler.GetAvatarUploadURL)
			protected.PATCH("/users/me", userHandler.UpdateProfile)

			// Users - admin only
			users := protected.Group("/users")
			users.Use(middleware.RBACMiddleware("admin"))
			{
				users.GET("", userHandler.GetUsers)
				users.POST("", userHandler.CreateUser)
				users.PATCH("/:id/role", userHandler.UpdateRole)
				users.DELETE("/:id", userHandler.DeleteUser)
			}

			// Users list for filters (all authenticated users)
			protected.GET("/users/list", func(c *gin.Context) {
				userHandler.GetUsers(c)
			})
		}
	}

	return r
}
