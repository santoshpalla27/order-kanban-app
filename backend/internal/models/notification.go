package models

import "time"

type Notification struct {
	ID         uint      `json:"id" gorm:"primaryKey"`
	UserID     uint      `json:"user_id" gorm:"not null;index"`
	Message    string    `json:"message" gorm:"not null"`
	Type       string    `json:"type" gorm:"not null"`
	EntityType string    `json:"entity_type" gorm:"default:''"`
	EntityID   uint      `json:"entity_id" gorm:"default:0"`
	Content    string    `json:"content" gorm:"default:''"` // actual message body (comment text, etc.)
	SenderName string    `json:"sender_name" gorm:"default:''"` // who triggered it
	IsRead     bool      `json:"is_read" gorm:"default:false"`
	CreatedAt  time.Time `json:"created_at"`
}
