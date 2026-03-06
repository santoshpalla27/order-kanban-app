package services

import (
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

func CreateChatMessage(msg *models.ChatMessage) error {
	return database.DB.Create(msg).Error
}
