package services

import (
	"crypto/rand"
	"encoding/base64"
	"errors"
	"time"

	"kanban-app/database"
	"kanban-app/internal/models"
)

var ErrLinkNotFound = errors.New("customer link not found")
var ErrLinkExpired  = errors.New("customer link expired or revoked")

// ─── Link ──────────────────────────────────────────────────────────────────

func generateToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

// GetActiveCustomerLink returns the most recent non-revoked, non-expired link for a product.
func GetActiveCustomerLink(productID uint) (*models.CustomerLink, error) {
	var link models.CustomerLink
	err := database.DB.
		Where("product_id = ? AND revoked = false AND (expires_at IS NULL OR expires_at > ?)", productID, time.Now()).
		Order("created_at DESC").
		First(&link).Error
	if err != nil {
		return nil, ErrLinkNotFound
	}
	return &link, nil
}

// ValidateCustomerToken validates a token and returns the linked product ID.
func ValidateCustomerToken(token string) (*models.CustomerLink, error) {
	var link models.CustomerLink
	err := database.DB.Where("token = ?", token).First(&link).Error
	if err != nil {
		return nil, ErrLinkNotFound
	}
	if link.Revoked {
		return nil, ErrLinkExpired
	}
	if link.ExpiresAt != nil && link.ExpiresAt.Before(time.Now()) {
		return nil, ErrLinkExpired
	}
	return &link, nil
}

// CreateCustomerLink revokes any existing link for the product and creates a new one.
func CreateCustomerLink(productID, createdBy uint, expiresInHours *int) (*models.CustomerLink, error) {
	token, err := generateToken()
	if err != nil {
		return nil, err
	}

	// Revoke existing links for this product
	database.DB.Model(&models.CustomerLink{}).
		Where("product_id = ? AND revoked = false", productID).
		Update("revoked", true)

	link := &models.CustomerLink{
		ProductID: productID,
		Token:     token,
		CreatedBy: createdBy,
	}
	if expiresInHours != nil && *expiresInHours > 0 {
		t := time.Now().Add(time.Duration(*expiresInHours) * time.Hour)
		link.ExpiresAt = &t
	}

	if err := database.DB.Create(link).Error; err != nil {
		return nil, err
	}
	return link, nil
}

// RevokeCustomerLink revokes all active links for a product.
func RevokeCustomerLink(productID uint) error {
	return database.DB.Model(&models.CustomerLink{}).
		Where("product_id = ? AND revoked = false", productID).
		Update("revoked", true).Error
}

// ─── Messages ──────────────────────────────────────────────────────────────

func GetCustomerMessages(productID uint) ([]models.CustomerMessage, error) {
	var msgs []models.CustomerMessage
	err := database.DB.
		Preload("ReplyTo").
		Where("product_id = ?", productID).
		Order("created_at ASC").
		Find(&msgs).Error
	return msgs, err
}

func CreateCustomerMessage(msg *models.CustomerMessage) error {
	return database.DB.Create(msg).Error
}

// GetCustomerPortalAttachments returns attachments visible to the customer portal:
// direct uploads (source='attachment') and staff reply files (source='customer_reply').
func GetCustomerPortalAttachments(productID uint) ([]models.Attachment, error) {
	var attachments []models.Attachment
	err := database.DB.
		Where("product_id = ? AND source IN ('attachment','customer_reply')", productID).
		Order("uploaded_at DESC").
		Find(&attachments).Error
	return attachments, err
}
