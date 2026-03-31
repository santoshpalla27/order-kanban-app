package services

import (
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"time"

	"kanban-app/database"
	"kanban-app/internal/models"

	"gorm.io/gorm"
)

// generateToken returns a 43-character URL-safe base64 string (32 random bytes).
func generateToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

// CreateCustomerLink generates a new active link for the product.
// Any previous active link for the same product is deactivated first.
func CreateCustomerLink(productID, createdBy uint) (*models.CustomerLink, error) {
	// Deactivate any existing active link for this product
	database.DB.Model(&models.CustomerLink{}).
		Where("product_id = ? AND is_active = ?", productID, true).
		Update("is_active", false)

	token, err := generateToken()
	if err != nil {
		return nil, fmt.Errorf("token generation failed: %w", err)
	}

	link := &models.CustomerLink{
		ProductID: productID,
		Token:     token,
		CreatedBy: createdBy,
		IsActive:  true,
		ExpiresAt: time.Now().Add(7 * 24 * time.Hour),
	}
	if err := database.DB.Create(link).Error; err != nil {
		return nil, err
	}
	database.DB.Preload("Creator").First(link, link.ID)
	return link, nil
}

// GetCustomerLink returns the active link for a product, or nil if none exists.
func GetCustomerLink(productID uint) (*models.CustomerLink, error) {
	var link models.CustomerLink
	err := database.DB.Preload("Creator").
		Where("product_id = ? AND is_active = ?", productID, true).
		First(&link).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &link, err
}

// ValidateToken looks up a token and returns the link if it is active and not expired.
func ValidateToken(token string) (*models.CustomerLink, error) {
	var link models.CustomerLink
	err := database.DB.Where("token = ? AND is_active = ? AND expires_at > ?", token, true, time.Now()).First(&link).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &link, err
}

// DeactivateCustomerLink marks a specific link as inactive.
func DeactivateCustomerLink(linkID uint) error {
	return database.DB.Model(&models.CustomerLink{}).
		Where("id = ?", linkID).
		Update("is_active", false).Error
}

// GetCustomerComments returns comments submitted via the customer portal for a product.
func GetCustomerComments(productID uint) ([]models.Comment, error) {
	var comments []models.Comment
	err := database.DB.Where("product_id = ? AND source = 'customer'", productID).
		Order("created_at ASC").Find(&comments).Error
	return comments, err
}

// GetCustomerAttachments returns attachments submitted via the customer portal for a product.
func GetCustomerAttachments(productID uint) ([]models.Attachment, error) {
	var attachments []models.Attachment
	err := database.DB.Where("product_id = ? AND source = 'customer'", productID).
		Order("uploaded_at ASC").Find(&attachments).Error
	return attachments, err
}
