package models

import "time"

type ChatMessage struct {
	ID        uint      `json:"id" gorm:"primaryKey"`
	UserID    uint      `json:"user_id" gorm:"not null"`
	User      User      `json:"user" gorm:"foreignKey:UserID"`
	Message   string    `json:"message" gorm:"not null"`
	CreatedAt time.Time `json:"created_at"`
}
