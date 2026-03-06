package models

import "time"

type ActivityLog struct {
	ID        uint      `json:"id" gorm:"primaryKey"`
	UserID    uint      `json:"user_id" gorm:"not null;index"`
	User      User      `json:"user" gorm:"foreignKey:UserID"`
	Action    string    `json:"action" gorm:"not null"`
	Entity    string    `json:"entity" gorm:"not null"`
	EntityID  uint      `json:"entity_id"`
	Details   string    `json:"details"`
	CreatedAt time.Time `json:"created_at"`
}
