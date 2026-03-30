package models

import "time"

type CustomerLink struct {
	ID        uint       `json:"id"         gorm:"primaryKey"`
	ProductID uint       `json:"product_id" gorm:"not null;index"`
	Token     string     `json:"token"      gorm:"not null;uniqueIndex"`
	ExpiresAt *time.Time `json:"expires_at,omitempty"`
	Revoked   bool       `json:"revoked"    gorm:"not null;default:false"`
	CreatedBy uint       `json:"created_by"`
	CreatedAt time.Time  `json:"created_at"`
}
