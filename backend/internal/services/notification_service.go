package services

import (
	"encoding/json"
	"regexp"

	"kanban-app/database"
	"kanban-app/internal/models"
)

// containsType checks if a notification type is in the allowed list.
func containsType(types []string, t string) bool {
	for _, v := range types {
		if v == t {
			return true
		}
	}
	return false
}

// normalizeNotifType maps internal event type strings to the prefs key used in
// custom_my_types / custom_all_types so the filter works correctly.
func normalizeNotifType(t string) string {
	switch t {
	case "comment_added", "customer_comment_added":
		return "comment"
	case "attachment_uploaded", "customer_attachment_uploaded":
		return "attachment"
	default:
		return t
	}
}

// isUserAssignedToProduct returns true if the user is in product_assignees for the given product.
func isUserAssignedToProduct(userID, productID uint) bool {
	var count int64
	database.DB.Table("product_assignees").
		Where("user_id = ? AND product_id = ?", userID, productID).
		Count(&count)
	return count > 0
}

// shouldDeliverWeb returns true if a web notification should be delivered to the user.
// @mention always bypasses all filters.
func shouldDeliverWeb(user models.User, notifType, entityType string, entityID uint) bool {
	if notifType == "mention" {
		return true
	}
	notifType = normalizeNotifType(notifType)
	prefs := user.NotificationPrefs
	if entityType == "chat" {
		if len(prefs.CustomAllTypes) == 0 {
			return true
		}
		return containsType(prefs.CustomAllTypes, notifType)
	}
	if entityType == "product" && entityID > 0 {
		if isUserAssignedToProduct(user.ID, entityID) {
			if len(prefs.CustomMyTypes) == 0 {
				return true
			}
			return containsType(prefs.CustomMyTypes, notifType)
		}
		if len(prefs.CustomAllTypes) == 0 {
			return true
		}
		return containsType(prefs.CustomAllTypes, notifType)
	}
	if len(prefs.CustomAllTypes) == 0 {
		return true
	}
	return containsType(prefs.CustomAllTypes, notifType)
}

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
// Notifications are filtered by each user's notification_prefs.
func CreateNotificationForAllExcept(excludeUserID uint, alsoExclude []uint, message, notifType, entityType string, entityID uint, content, senderName string) {
	excluded := append([]uint{excludeUserID}, alsoExclude...)
	var users []models.User
	database.DB.Where("id NOT IN ?", excluded).Find(&users)
	wsMsg := buildNotifWSMsg(models.Notification{
		Message: message, Type: notifType, EntityType: entityType,
		EntityID: entityID, Content: content, SenderName: senderName,
	})
	for _, user := range users {
		if !shouldDeliverWeb(user, notifType, entityType, entityID) {
			continue
		}
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
// Delivery is filtered by each user's notification_prefs.
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
		if !shouldDeliverWeb(user, notifType, "chat", 0) {
			continue
		}
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

type UnreadProductSummary struct {
	Status string   `json:"status"`
	Types  []string `json:"types"`
}

// GetUnreadSummary returns, for each product with unread notifications,
// the product's status and the distinct notification types that are unread.
// Result is map[entityID]UnreadProductSummary — only entity_type = "product" is included.
// If assignedTo > 0, only products where that user is an assignee are included.
func GetUnreadSummary(userID uint, assignedTo uint) (map[uint]UnreadProductSummary, error) {
	type row struct {
		EntityID uint
		Type     string
		Status   string
	}
	var rows []row
	q := database.DB.Model(&models.Notification{}).
		Select("notifications.entity_id, notifications.type, products.status").
		Joins("JOIN products ON products.id = notifications.entity_id").
		Where("notifications.user_id = ? AND notifications.entity_type = 'product' AND notifications.is_read = ?", userID, false)
	if assignedTo > 0 {
		q = q.Joins("JOIN product_assignees ON product_assignees.product_id = notifications.entity_id AND product_assignees.user_id = ?", assignedTo)
	}
	err := q.Distinct("notifications.entity_id", "notifications.type", "products.status").Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	result := map[uint]UnreadProductSummary{}
	for _, r := range rows {
		entry, exists := result[r.EntityID]
		if !exists {
			entry = UnreadProductSummary{Status: r.Status, Types: []string{}}
		}
		entry.Types = append(entry.Types, r.Type)
		result[r.EntityID] = entry
	}
	return result, nil
}

// MarkReadByEntityAndTypes marks unread notifications as read for a specific
// entity + type list (e.g. clear only comment notifications for product 5).
func MarkReadByEntityAndTypes(userID uint, entityType string, entityID uint, types []string) error {
	if len(types) == 0 {
		return nil
	}
	return database.DB.Model(&models.Notification{}).
		Where("user_id = ? AND entity_type = ? AND entity_id = ? AND type IN ? AND is_read = ?",
			userID, entityType, entityID, types, false).
		Update("is_read", true).Error
}

// PurgeOldNotifications hard-deletes notifications older than the given number of days.
// Called on a background goroutine every 24 hours.
func PurgeOldNotifications(days int) (int64, error) {
	tx := database.DB.
		Where("created_at < NOW() - INTERVAL '1 day' * ?", days).
		Delete(&models.Notification{})
	return tx.RowsAffected, tx.Error
}
