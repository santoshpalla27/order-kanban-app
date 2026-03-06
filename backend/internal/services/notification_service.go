package services

import (
	"kanban-app/database"
	"kanban-app/internal/models"
)

func GetNotifications(userID uint) ([]models.Notification, error) {
	var notifications []models.Notification
	err := database.DB.Where("user_id = ?", userID).Order("created_at DESC").
		Limit(50).Find(&notifications).Error
	return notifications, err
}

func GetUnreadCount(userID uint) (int64, error) {
	var count int64
	err := database.DB.Model(&models.Notification{}).
		Where("user_id = ? AND is_read = ?", userID, false).Count(&count).Error
	return count, err
}

func CreateNotification(notification *models.Notification) error {
	return database.DB.Create(notification).Error
}

func MarkAsRead(id uint, userID uint) error {
	return database.DB.Model(&models.Notification{}).
		Where("id = ? AND user_id = ?", id, userID).Update("is_read", true).Error
}

func MarkAllAsRead(userID uint) error {
	return database.DB.Model(&models.Notification{}).
		Where("user_id = ? AND is_read = ?", userID, false).Update("is_read", true).Error
}

func CreateNotificationForAllExcept(excludeUserID uint, message string, notifType string) {
	var users []models.User
	database.DB.Where("id != ?", excludeUserID).Find(&users)
	for _, user := range users {
		notif := models.Notification{
			UserID:  user.ID,
			Message: message,
			Type:    notifType,
		}
		database.DB.Create(&notif)
	}
}
