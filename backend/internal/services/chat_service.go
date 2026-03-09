package services

import (
	"encoding/json"

	"kanban-app/database"
	"kanban-app/internal/models"
)

func GetChatMessages(limit int) ([]models.ChatMessage, error) {
	var messages []models.ChatMessage
	query := database.DB.Preload("User").Order("created_at DESC")
	if limit > 0 {
		query = query.Limit(limit)
	}
	err := query.Find(&messages).Error
	// Reverse for chronological order
	for i, j := 0, len(messages)-1; i < j; i, j = i+1, j-1 {
		messages[i], messages[j] = messages[j], messages[i]
	}
	return messages, err
}

// CreateChatMessage persists a chat message and broadcasts it to all connected clients
// via pg_notify → LISTEN/NOTIFY → WS Hub (multi-instance safe).
func CreateChatMessage(msg *models.ChatMessage) error {
	if err := database.DB.Create(msg).Error; err != nil {
		return err
	}
	// Reload with user info for the WS broadcast payload
	database.DB.Preload("User").First(msg, msg.ID)

	wsMsg, _ := json.Marshal(map[string]interface{}{
		"type": "chat_message",
		"payload": map[string]interface{}{
			"id":         msg.ID,
			"user_id":    msg.UserID,
			"user_name":  msg.User.Name,
			"message":    msg.Message,
			"created_at": msg.CreatedAt,
		},
	})
	database.EmitBroadcast(wsMsg)
	return nil
}
