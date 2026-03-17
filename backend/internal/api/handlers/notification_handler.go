package handlers

import (
	"net/http"
	"strconv"

	"kanban-app/internal/services"

	"github.com/gin-gonic/gin"
)

type NotificationHandler struct{}

func NewNotificationHandler() *NotificationHandler {
	return &NotificationHandler{}
}

func (h *NotificationHandler) GetNotifications(c *gin.Context) {
	userID := c.GetUint("user_id")

	limit := 50
	if l := c.Query("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil {
			limit = parsed
		}
	}
	var cursor uint
	if cur := c.Query("cursor"); cur != "" {
		if parsed, err := strconv.ParseUint(cur, 10, 32); err == nil {
			cursor = uint(parsed)
		}
	}

	page, err := services.GetNotifications(userID, limit, cursor)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch notifications"})
		return
	}
	c.JSON(http.StatusOK, page)
}

func (h *NotificationHandler) GetUnreadCount(c *gin.Context) {
	userID := c.GetUint("user_id")
	count, err := services.GetUnreadCount(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get count"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"count": count})
}

func (h *NotificationHandler) MarkAsRead(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid notification ID"})
		return
	}

	userID := c.GetUint("user_id")
	if err := services.MarkAsRead(uint(id), userID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to mark as read"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Marked as read"})
}

func (h *NotificationHandler) MarkAllAsRead(c *gin.Context) {
	userID := c.GetUint("user_id")
	if err := services.MarkAllAsRead(userID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to mark all as read"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "All marked as read"})
}

func (h *NotificationHandler) GetUnreadSummary(c *gin.Context) {
	userID := c.GetUint("user_id")
	var assignedTo uint
	if v := c.Query("assigned_to"); v != "" {
		if parsed, err := strconv.ParseUint(v, 10, 32); err == nil {
			assignedTo = uint(parsed)
		}
	}
	summary, err := services.GetUnreadSummary(userID, assignedTo)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get summary"})
		return
	}
	c.JSON(http.StatusOK, summary)
}

func (h *NotificationHandler) MarkReadByEntityAndTypes(c *gin.Context) {
	var req struct {
		EntityType string   `json:"entity_type" binding:"required"`
		EntityID   uint     `json:"entity_id"   binding:"required"`
		Types      []string `json:"types"       binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	userID := c.GetUint("user_id")
	if err := services.MarkReadByEntityAndTypes(userID, req.EntityType, req.EntityID, req.Types); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to mark as read"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Marked as read"})
}
