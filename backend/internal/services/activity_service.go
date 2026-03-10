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

func GetAllRecentActivityLogs(limit int) ([]models.ActivityLog, error) {
	var logs []models.ActivityLog
	err := database.DB.Preload("User").
		Where("entity != ?", "comment").
		Order("created_at DESC").Limit(limit).Find(&logs).Error
	return logs, err
}

// PurgeOldActivityLogs hard-deletes activity logs older than the given number of days.
// Called on a background goroutine every 24 hours.
func PurgeOldActivityLogs(days int) error {
	return database.DB.
		Where("created_at < NOW() - INTERVAL '1 day' * ?", days).
		Delete(&models.ActivityLog{}).Error
}
