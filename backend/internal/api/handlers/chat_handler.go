package handlers

import (
	"encoding/json"
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
	limit := 100
	if l := c.Query("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil {
			limit = parsed
		}
	}

	messages, err := services.GetChatMessages(limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch messages"})
		return
	}

	c.JSON(http.StatusOK, messages)
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

	msg := &models.ChatMessage{
		UserID:    userID,
		Message:   req.Message,
		CreatedAt: time.Now(),
	}

	if err := services.CreateChatMessage(msg); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to send message"})
		return
	}

	// Notify @[Name] mentions — store in DB and send direct toast to mentioned users only.
	mentionMsg := fmt.Sprintf("%s mentioned you in Team Chat", userName)
	services.NotifyMentions(userID, req.Message, mentionMsg, "chat", 0)
	for _, uid := range services.GetMentionedUserIDs(userID, req.Message) {
		SendNotificationToUser(uid, mentionMsg, "mention")
	}

	wsMsg, _ := json.Marshal(WSMessage{
		Type: "chat_message",
		Payload: gin.H{
			"id":         msg.ID,
			"user_id":    userID,
			"user_name":  userName,
			"message":    req.Message,
			"created_at": msg.CreatedAt,
		},
	})
	Hub.BroadcastMessage(wsMsg)

	c.JSON(http.StatusCreated, gin.H{
		"id":         msg.ID,
		"user_id":    userID,
		"user_name":  userName,
		"message":    req.Message,
		"created_at": msg.CreatedAt,
	})
}
