package services

import (
	"kanban-app/database"
	"kanban-app/internal/models"
)

func GetCommentsByProduct(productID uint) ([]models.Comment, error) {
	var comments []models.Comment
	err := database.DB.Preload("User").Where("product_id = ?", productID).
		Order("created_at ASC").Find(&comments).Error
	return comments, err
}

func GetCommentByID(id uint) (*models.Comment, error) {
	var comment models.Comment
	err := database.DB.First(&comment, id).Error
	return &comment, err
}

func CreateComment(comment *models.Comment) error {
	return database.DB.Create(comment).Error
}

func UpdateComment(id uint, message string) error {
	return database.DB.Model(&models.Comment{}).Where("id = ?", id).Update("message", message).Error
}

func DeleteComment(id uint) error {
	return database.DB.Delete(&models.Comment{}, id).Error
}
