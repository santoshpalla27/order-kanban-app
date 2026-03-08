package services

import (
	"regexp"

	"kanban-app/database"
	"kanban-app/internal/models"
)

// mentionRe matches @[Name] patterns inserted by the frontend mention picker.
var mentionRe = regexp.MustCompile(`@\[([^\]]+)\]`)

// CreateNotificationForUser sends a notification to a single user.
func CreateNotificationForUser(userID uint, message string, notifType string) {
	notif := models.Notification{
		UserID:  userID,
		Message: message,
		Type:    notifType,
	}
	database.DB.Create(&notif)
}

// NotifyMentions parses @[Name] patterns in text, looks up each named user,
// and sends them a "mention" notification (excluding the sender).
func NotifyMentions(senderID uint, text string, notifMessage string) {
	matches := mentionRe.FindAllStringSubmatch(text, -1)
	seen := map[uint]bool{}
	for _, m := range matches {
		name := m[1]
		var user models.User
		if err := database.DB.Where("LOWER(name) = LOWER(?)", name).First(&user).Error; err != nil {
			continue
		}
		if user.ID == senderID || seen[user.ID] {
			continue
		}
		seen[user.ID] = true
		CreateNotificationForUser(user.ID, notifMessage, "mention")
	}
}

// GetMentionedUserIDs parses @[Name] tokens and returns the IDs of matched users,
// excluding the sender. Useful for sending WS events to mentioned users.
func GetMentionedUserIDs(senderID uint, text string) []uint {
	matches := mentionRe.FindAllStringSubmatch(text, -1)
	seen := map[uint]bool{}
	var ids []uint
	for _, m := range matches {
		name := m[1]
		var user models.User
		if err := database.DB.Where("LOWER(name) = LOWER(?)", name).First(&user).Error; err != nil {
			continue
		}
		if user.ID == senderID || seen[user.ID] {
			continue
		}
		seen[user.ID] = true
		ids = append(ids, user.ID)
	}
	return ids
}

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
