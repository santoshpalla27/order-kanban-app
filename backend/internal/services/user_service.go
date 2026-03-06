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
	return database.DB.Delete(&models.User{}, id).Error
}
