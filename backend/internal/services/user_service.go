package services

import (
	"kanban-app/database"
	"kanban-app/internal/models"
)

func GetUsers() ([]models.User, error) {
	var users []models.User
	err := database.DB.Preload("Role").Find(&users).Error
	return users, err
}

func GetUserByID(id uint) (*models.User, error) {
	var user models.User
	err := database.DB.Preload("Role").First(&user, id).Error
	return &user, err
}

func GetUserByEmail(email string) (*models.User, error) {
	var user models.User
	err := database.DB.Preload("Role").Where("email = ?", email).First(&user).Error
	return &user, err
}

func CreateUser(user *models.User) error {
	return database.DB.Create(user).Error
}

func UpdateUserRole(id uint, roleID uint) error {
	return database.DB.Model(&models.User{}).Where("id = ?", id).Update("role_id", roleID).Error
}

func DeleteUser(id uint) error {
	// Revoke sessions first so the user is immediately logged out
	_ = RevokeUserRefreshTokens(id)
	return database.DB.Delete(&models.User{}, id).Error
}

func UpdateProfile(id uint, name, avatarKey string, prefs *models.NotificationPrefs) error {
	updates := map[string]interface{}{}
	if name != "" {
		updates["name"] = name
	}
	if avatarKey != "" {
		updates["avatar_key"] = avatarKey
	}
	if prefs != nil {
		val, err := prefs.Value()
		if err == nil {
			updates["notification_prefs"] = val
		}
	}
	if len(updates) == 0 {
		return nil
	}
	return database.DB.Model(&models.User{}).Where("id = ?", id).Updates(updates).Error
}

// GetUserResponseWithAvatar builds a UserResponse with a presigned avatar URL (if the user has one).
func GetUserResponseWithAvatar(user *models.User) models.UserResponse {
	resp := user.ToResponse()
	if user.AvatarKey != "" && R2 != nil {
		if url, err := R2.GenerateViewURL(user.AvatarKey); err == nil {
			resp.AvatarURL = url
		}
	}
	return resp
}
