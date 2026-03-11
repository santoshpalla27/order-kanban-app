package services

import (
	"encoding/json"
	"regexp"

	"kanban-app/database"
	"kanban-app/internal/models"
)

var mentionRe = regexp.MustCompile(`@\[([^\]]+)\]`)

// buildNotifWSMsg constructs the "notification" WS message the frontend toast expects.
func buildNotifWSMsg(notif models.Notification) []byte {
	msg, _ := json.Marshal(map[string]interface{}{
		"type": "notification",
		"payload": map[string]interface{}{
			"message":     notif.Message,
			"notif_type":  notif.Type,
			"entity_type": notif.EntityType,
			"entity_id":   notif.EntityID,
			"content":     notif.Content,
			"sender_name": notif.SenderName,
		},
	})
	return msg
}

// CreateNotificationForUser persists a notification and delivers it to the target user
// via pg_notify → LISTEN/NOTIFY → WS Hub. Works across multiple backend instances.
func CreateNotificationForUser(userID uint, message, notifType, entityType string, entityID uint, content, senderName string) {
	notif := models.Notification{
		UserID:     userID,
		Message:    message,
		Type:       notifType,
		EntityType: entityType,
		EntityID:   entityID,
		Content:    content,
		SenderName: senderName,
	}
	database.DB.Create(&notif)
	database.EmitToUser(userID, buildNotifWSMsg(notif))
}

// CreateNotificationForAllExcept persists a notification and delivers a WS toast for every
// user except the sender and any IDs in alsoExclude (e.g. users already receiving a mention
// notification). Each user gets their own EmitToUser call so the excluded set is exact.
func CreateNotificationForAllExcept(excludeUserID uint, alsoExclude []uint, message, notifType, entityType string, entityID uint, content, senderName string) {
	excluded := append([]uint{excludeUserID}, alsoExclude...)
	var users []models.User
	database.DB.Where("id NOT IN ?", excluded).Find(&users)
	wsMsg := buildNotifWSMsg(models.Notification{
		Message: message, Type: notifType, EntityType: entityType,
		EntityID: entityID, Content: content, SenderName: senderName,
	})
	for _, user := range users {
		notif := models.Notification{
			UserID:     user.ID,
			Message:    message,
			Type:       notifType,
			EntityType: entityType,
			EntityID:   entityID,
			Content:    content,
			SenderName: senderName,
		}
		database.DB.Create(&notif)
		database.EmitToUser(user.ID, wsMsg)
	}
}

// BroadcastChatToastExcept sends a transient WS toast to every user except the sender.
// Nothing is written to the notifications table, so the bell panel stays clean.
func BroadcastChatToastExcept(excludeUserID uint, message, notifType, content, senderName string) {
	wsMsg := buildNotifWSMsg(models.Notification{
		Message:    message,
		Type:       notifType,
		EntityType: "chat",
		Content:    content,
		SenderName: senderName,
	})
	var users []models.User
	database.DB.Where("id != ?", excludeUserID).Find(&users)
	for _, user := range users {
		database.EmitToUser(user.ID, wsMsg)
	}
}

// BroadcastChatMentions parses @[Name] tokens and sends a transient mention toast
// to each tagged user without writing anything to the notifications table.
func BroadcastChatMentions(senderID uint, text, notifMessage, content, senderName string) []uint {
	matches := mentionRe.FindAllStringSubmatch(text, -1)
	seen := map[uint]bool{}
	var notified []uint
	for _, m := range matches {
		var user models.User
		if err := database.DB.Where("LOWER(name) = LOWER(?)", m[1]).First(&user).Error; err != nil {
			continue
		}
		if user.ID == senderID || seen[user.ID] {
			continue
		}
		seen[user.ID] = true
		notified = append(notified, user.ID)
		wsMsg := buildNotifWSMsg(models.Notification{
			Message:    notifMessage,
			Type:       "mention",
			EntityType: "chat",
			Content:    content,
			SenderName: senderName,
		})
		database.EmitToUser(user.ID, wsMsg)
	}
	return notified
}

// NotifyMentions parses @[Name] tokens, persists mention notifications, delivers via WS.
// Returns the list of user IDs that were notified, so callers can exclude them from
// the broader "comment_added" notification and avoid sending duplicate toasts.
func NotifyMentions(senderID uint, text, notifMessage, entityType string, entityID uint, content, senderName string) []uint {
	matches := mentionRe.FindAllStringSubmatch(text, -1)
	seen := map[uint]bool{}
	var notified []uint
	for _, m := range matches {
		var user models.User
		if err := database.DB.Where("LOWER(name) = LOWER(?)", m[1]).First(&user).Error; err != nil {
			continue
		}
		if user.ID == senderID || seen[user.ID] {
			continue
		}
		seen[user.ID] = true
		notified = append(notified, user.ID)
		CreateNotificationForUser(user.ID, notifMessage, "mention", entityType, entityID, content, senderName)
	}
	return notified
}

// NotificationPage is the cursor-paginated response for the notifications list.
type NotificationPage struct {
	Data       []models.Notification `json:"data"`
	NextCursor *uint                 `json:"next_cursor"`
	HasMore    bool                  `json:"has_more"`
}

// GetNotifications returns a cursor-paginated page of notifications for a user,
// ordered newest-first. Pass cursor=0 for the first page.
func GetNotifications(userID uint, limit int, cursor uint) (NotificationPage, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	query := database.DB.Where("user_id = ?", userID)
	if cursor > 0 {
		query = query.Where("id < ?", cursor)
	}

	var notifications []models.Notification
	if err := query.Order("id DESC").Limit(limit + 1).Find(&notifications).Error; err != nil {
		return NotificationPage{}, err
	}

	hasMore := len(notifications) > limit
	if hasMore {
		notifications = notifications[:limit]
	}

	var nextCursor *uint
	if hasMore && len(notifications) > 0 {
		last := notifications[len(notifications)-1].ID
		nextCursor = &last
	}

	return NotificationPage{Data: notifications, NextCursor: nextCursor, HasMore: hasMore}, nil
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

// PurgeOldNotifications hard-deletes notifications older than the given number of days.
// Called on a background goroutine every 24 hours.
func PurgeOldNotifications(days int) error {
	return database.DB.
		Where("created_at < NOW() - INTERVAL '1 day' * ?", days).
		Delete(&models.Notification{}).Error
}
