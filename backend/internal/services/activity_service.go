package services

import (
	"kanban-app/database"
	"kanban-app/internal/models"
)

func CreateActivityLog(log *models.ActivityLog) error {
	return database.DB.Create(log).Error
}

func GetActivityLogs(entityType string, entityID uint) ([]models.ActivityLog, error) {
	var logs []models.ActivityLog
	err := database.DB.Preload("User").Where("entity = ? AND entity_id = ?", entityType, entityID).
		Order("created_at DESC").Limit(50).Find(&logs).Error
	return logs, err
}
