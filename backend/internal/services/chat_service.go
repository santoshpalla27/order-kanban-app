package services

import (
	"encoding/json"

	"kanban-app/database"
	"kanban-app/internal/models"
)

// ChatPage is the cursor-paginated response for the chat message list.
type ChatPage struct {
	Data       []models.ChatMessage `json:"data"`
	NextCursor *uint                `json:"next_cursor"`
	HasMore    bool                 `json:"has_more"`
}

// GetChatMessages returns a cursor-paginated page of messages ordered chronologically.
// cursor is the ID of the oldest already-loaded message; pass 0 for the most recent page.
func GetChatMessages(limit int, cursor uint) (ChatPage, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	query := database.DB.Preload("User")
	if cursor > 0 {
		query = query.Where("id < ?", cursor)
	}

	var messages []models.ChatMessage
	if err := query.Order("id DESC").Limit(limit + 1).Find(&messages).Error; err != nil {
		return ChatPage{}, err
	}

	hasMore := len(messages) > limit
	if hasMore {
		messages = messages[:limit]
	}

	var nextCursor *uint
	if hasMore && len(messages) > 0 {
		oldest := messages[len(messages)-1].ID
		nextCursor = &oldest
	}

	// Reverse to chronological order (oldest first) for the frontend
	for i, j := 0, len(messages)-1; i < j; i, j = i+1, j-1 {
		messages[i], messages[j] = messages[j], messages[i]
	}

	return ChatPage{Data: messages, NextCursor: nextCursor, HasMore: hasMore}, nil
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
