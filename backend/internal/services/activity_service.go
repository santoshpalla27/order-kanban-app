package services

import (
	"encoding/json"
	"fmt"

	"kanban-app/database"
	"kanban-app/internal/models"
)

func CreateActivityLog(log *models.ActivityLog) error {
	if err := database.DB.Create(log).Error; err != nil {
		return err
	}

	// Look up actor name for the toast message.
	var actor models.User
	database.DB.Select("name").First(&actor, log.UserID)
	actorName := actor.Name
	if actorName == "" {
		actorName = "Unknown"
	}

	// Build a product/comment link so the toast has an "Open →" button.
	var entityURL string
	switch log.Entity {
	case "product":
		entityURL = fmt.Sprintf("/?product=%d", log.EntityID)
	case "comment":
		// EntityID for comment logs is the product ID.
		entityURL = fmt.Sprintf("/?product=%d", log.EntityID)
	}

	wsMsg, _ := json.Marshal(map[string]interface{}{
		"type": "activity_updated",
		"payload": map[string]interface{}{
			"actor_id":   log.UserID,
			"actor_name": actorName,
			"message":    log.Details,
			"entity":     log.Entity,
			"entity_id":  log.EntityID,
			"entity_url": entityURL,
		},
	})
	// Exclude the actor — they know what they did.
	database.EmitBroadcastExcept(log.UserID, wsMsg)
	return nil
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
		Order("created_at DESC").Limit(limit).Find(&logs).Error
	return logs, err
}

// PurgeOldActivityLogs hard-deletes activity logs older than the given number of days.
// Called on a background goroutine every 24 hours.
func PurgeOldActivityLogs(days int) (int64, error) {
	tx := database.DB.
		Where("created_at < NOW() - INTERVAL '1 day' * ?", days).
		Delete(&models.ActivityLog{})
	return tx.RowsAffected, tx.Error
}
