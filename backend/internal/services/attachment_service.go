package services

import (
	"kanban-app/database"
	"kanban-app/internal/models"
)

func GetAttachmentsByProduct(productID uint) ([]models.Attachment, error) {
	var attachments []models.Attachment
	err := database.DB.Preload("Uploader").Where("product_id = ?", productID).
		Order("uploaded_at DESC").Find(&attachments).Error
	return attachments, err
}

func GetAttachmentByID(id uint) (*models.Attachment, error) {
	var attachment models.Attachment
	err := database.DB.First(&attachment, id).Error
	return &attachment, err
}

func CreateAttachment(attachment *models.Attachment) error {
	return database.DB.Create(attachment).Error
}

func DeleteAttachment(id uint) error {
	return database.DB.Delete(&models.Attachment{}, id).Error
}
