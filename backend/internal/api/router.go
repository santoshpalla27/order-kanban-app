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
	r := gin.Default()

	origins := strings.Split(cfg.CORSOrigins, ",")
	for i := range origins {
		origins[i] = strings.TrimSpace(origins[i])
	}

	r.Use(cors.New(cors.Config{
		AllowOrigins:     origins,
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
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
		}

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
				products.GET("/deleted", middleware.RBACMiddleware("admin"), productHandler.GetDeletedProducts)
				products.POST("/:id/restore", middleware.RBACMiddleware("admin"), productHandler.RestoreProduct)
				products.GET("/:id", productHandler.GetProduct)
				products.POST("", middleware.RBACMiddleware("admin", "manager"), productHandler.CreateProduct)
				products.PUT("/:id", middleware.RBACMiddleware("admin", "manager"), productHandler.UpdateProduct)
				products.PATCH("/:id/status", productHandler.UpdateStatus)
				products.DELETE("/:id", middleware.RBACMiddleware("admin"), productHandler.DeleteProduct)

				// Attachments (nested under products/:id)
				products.GET("/:id/attachments", attachmentHandler.GetByProduct)

				products.GET("/:id/attachments/presign", attachmentHandler.GetPresignedUploadURL)
				products.POST("/:id/attachments/confirm", attachmentHandler.ConfirmUpload)

				// Comments (nested under products/:id)
				products.GET("/:id/comments", commentHandler.GetByProduct)
				products.POST("/:id/comments", commentHandler.Create)
			}

			// Standalone attachment/comment routes
			protected.GET("/attachments/:id/download", attachmentHandler.Download)
			protected.DELETE("/attachments/:id", middleware.RBACMiddleware("admin", "manager"), attachmentHandler.Delete)
			protected.GET("/activity", activityHandler.GetRecent)
			protected.PUT("/comments/:id", commentHandler.Update)
			protected.DELETE("/comments/:id", commentHandler.Delete)

			// Chat
			chat := protected.Group("/chat")
			{
				chat.GET("/messages", chatHandler.GetMessages)
				chat.POST("/messages", chatHandler.SendMessage)
			}

			// Notifications
			notifications := protected.Group("/notifications")
			{
				notifications.GET("", notificationHandler.GetNotifications)
				notifications.GET("/unread-count", notificationHandler.GetUnreadCount)
				notifications.PATCH("/:id/read", notificationHandler.MarkAsRead)
				notifications.POST("/read-all", notificationHandler.MarkAllAsRead)
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
