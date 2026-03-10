package services

import (
	"crypto/rand"
	"encoding/hex"
	"time"

	"kanban-app/database"
	"kanban-app/internal/models"
)

const refreshTokenTTL = 30 * 24 * time.Hour // 30 days

// IssueRefreshToken generates a cryptographically random 32-byte token,
// persists it for the given user, and returns the raw hex string.
func IssueRefreshToken(userID uint) (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	token := hex.EncodeToString(raw) // 64 hex chars

	rt := models.RefreshToken{
		UserID:    userID,
		Token:     token,
		ExpiresAt: time.Now().Add(refreshTokenTTL),
	}
	if err := database.DB.Create(&rt).Error; err != nil {
		return "", err
	}
	return token, nil
}

// ValidateRefreshToken returns the DB row for a token that is not revoked and not expired.
func ValidateRefreshToken(token string) (*models.RefreshToken, error) {
	var rt models.RefreshToken
	err := database.DB.
		Where("token = ? AND revoked = false AND expires_at > ?", token, time.Now()).
		First(&rt).Error
	return &rt, err
}

// RevokeRefreshToken marks a single token as revoked (used on logout or rotation).
func RevokeRefreshToken(token string) error {
	return database.DB.Model(&models.RefreshToken{}).
		Where("token = ?", token).
		Update("revoked", true).Error
}

// RevokeUserRefreshTokens revokes all active tokens for a user (logout-all-devices).
func RevokeUserRefreshTokens(userID uint) error {
	return database.DB.Model(&models.RefreshToken{}).
		Where("user_id = ? AND revoked = false", userID).
		Update("revoked", true).Error
}

// PurgeExpiredRefreshTokens hard-deletes revoked and expired tokens.
// Called on a background goroutine every hour.
func PurgeExpiredRefreshTokens() error {
	return database.DB.
		Where("revoked = true OR expires_at < ?", time.Now()).
		Delete(&models.RefreshToken{}).Error
}
