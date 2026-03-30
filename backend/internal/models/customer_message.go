package models

import "time"

type CustomerMessage struct {
	ID         uint             `json:"id"                    gorm:"primaryKey"`
	ProductID  uint             `json:"product_id"            gorm:"not null;index"`
	SenderType string           `json:"sender_type"           gorm:"not null"` // "customer" | "staff"
	SenderName string           `json:"sender_name"`
	Message    string           `json:"message"               gorm:"not null"`
	ReplyToID  *uint            `json:"reply_to_id,omitempty"`
	ReplyTo    *CustomerMessage `json:"reply_to,omitempty"    gorm:"foreignKey:ReplyToID"`
	CreatedAt  time.Time        `json:"created_at"`
}
