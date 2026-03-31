package models

import "time"

type CustomerLink struct {
	ID        uint      `json:"id" gorm:"primaryKey"`
	ProductID uint      `json:"product_id" gorm:"not null;index"`
	Token     string    `json:"token" gorm:"not null;uniqueIndex;size:64"`
	CreatedBy uint      `json:"created_by" gorm:"not null"`
	Creator   User      `json:"creator" gorm:"foreignKey:CreatedBy"`
	IsActive  bool      `json:"is_active" gorm:"not null;default:true"`
	ExpiresAt time.Time `json:"expires_at" gorm:"not null;index"`
	CreatedAt time.Time `json:"created_at"`
}
