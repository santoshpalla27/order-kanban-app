package models

import "time"

type Notification struct {
	ID         uint      `json:"id" gorm:"primaryKey"`
	UserID     uint      `json:"user_id" gorm:"not null;index"`
	Message    string    `json:"message" gorm:"not null"`
	Type       string    `json:"type" gorm:"not null"`
	EntityType string    `json:"entity_type" gorm:"default:''"`
	EntityID   uint      `json:"entity_id" gorm:"default:0"`
	IsRead     bool      `json:"is_read" gorm:"default:false"`
	CreatedAt  time.Time `json:"created_at"`
}
