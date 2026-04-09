package models

import (
	"time"

	"gorm.io/gorm"
)

type Product struct {
	ID            uint           `json:"id" gorm:"primaryKey"`
	// Partial unique index: enforced only for active (non-deleted) rows.
	// Postgres allows the same product_id on soft-deleted rows without mangling.
	ProductID string `json:"product_id" gorm:"not null;uniqueIndex:udx_product_id_active,where:deleted_at IS NULL"`
	CustomerName  string         `json:"customer_name" gorm:"not null"`
	CustomerPhone string         `json:"customer_phone"`
	Description   string         `json:"description"`
	Status        string         `json:"status" gorm:"default:yet_to_start;not null"`
	CreatedBy     uint           `json:"created_by" gorm:"not null"`
	Creator       User           `json:"creator" gorm:"foreignKey:CreatedBy"`
	Assignees     []User         `json:"assignees" gorm:"many2many:product_assignees;"`
	Attachments   []Attachment   `json:"attachments,omitempty" gorm:"foreignKey:ProductID;references:ID"`
	Comments      []Comment      `json:"comments,omitempty" gorm:"foreignKey:ProductID;references:ID"`
	DeliveryAt    *time.Time     `json:"delivery_at"`
	PinnedAt      *time.Time     `json:"pinned_at"`
	DeletedBy     uint           `json:"deleted_by" gorm:"default:0"`
	CreatedAt     time.Time      `json:"created_at"`
	UpdatedAt     time.Time      `json:"updated_at"`
	DeletedAt     gorm.DeletedAt `json:"deleted_at" gorm:"index"` // enables GORM soft delete
}

type CreateProductRequest struct {
	ProductID     string     `json:"product_id" binding:"required"`
	CustomerName  string     `json:"customer_name" binding:"required"`
	CustomerPhone string     `json:"customer_phone"`
	Description   string     `json:"description"`
	DeliveryAt    *time.Time `json:"delivery_at"`
	AssigneeIDs   []uint     `json:"assignee_ids"`
}

type UpdateProductRequest struct {
	ProductID     string     `json:"product_id"`
	CustomerName  string     `json:"customer_name"`
	CustomerPhone string     `json:"customer_phone"`
	Description   string     `json:"description"`
	DeliveryAt    *time.Time `json:"delivery_at"`
	AssigneeIDs   []uint     `json:"assignee_ids"`
}

type UpdateStatusRequest struct {
	Status string `json:"status" binding:"required,oneof=yet_to_start working review done"`
}

var ValidStatuses = []string{"yet_to_start", "working", "review", "done"}
