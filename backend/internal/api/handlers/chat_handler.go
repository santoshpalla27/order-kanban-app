package handlers

import (
	"fmt"
	"net/http"
	"strconv"
	"time"

	"kanban-app/internal/models"
	"kanban-app/internal/services"

	"github.com/gin-gonic/gin"
)

type ChatHandler struct{}

func NewChatHandler() *ChatHandler {
	return &ChatHandler{}
}

func (h *ChatHandler) GetMessages(c *gin.Context) {
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

	page, err := services.GetChatMessages(limit, cursor)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch messages"})
		return
	}

	c.JSON(http.StatusOK, page)
}

func (h *ChatHandler) SendMessage(c *gin.Context) {
	var req struct {
		Message string `json:"message" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID := c.GetUint("user_id")
	userName, _ := c.Get("user_name")
	senderName := userName.(string)

	msg := &models.ChatMessage{
		UserID:    userID,
		Message:   req.Message,
		CreatedAt: time.Now(),
	}

	// CreateChatMessage saves + broadcasts via LISTEN/NOTIFY
	if err := services.CreateChatMessage(msg); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to send message"})
		return
	}

	// Deliver mention toasts to @-mentioned users — transient only, not persisted.
	mentionMsg := fmt.Sprintf("%s mentioned you in Team Chat", senderName)
	mentionedIDs := services.BroadcastChatMentions(userID, req.Message, mentionMsg, req.Message, senderName)

	// If no @mentions, broadcast a transient toast to everyone.
	// Not persisted to the notifications table — bell panel shows product notifications only.
	if len(mentionedIDs) == 0 {
		preview := req.Message
		if len([]rune(preview)) > 60 {
			preview = string([]rune(preview)[:57]) + "..."
		}
		generalMsg := fmt.Sprintf("%s: %s", senderName, preview)
		services.BroadcastChatToastExcept(userID, generalMsg, "chat_message", req.Message, senderName)
	}

	c.JSON(http.StatusCreated, gin.H{
		"id":         msg.ID,
		"user_id":    userID,
		"user_name":  senderName,
		"message":    req.Message,
		"created_at": msg.CreatedAt,
	})
}
