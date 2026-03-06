package services

import (
	"kanban-app/database"
	"kanban-app/internal/models"
)

type ProductFilter struct {
	Status    string
	CreatedBy uint
	Search    string
	DateFrom  string
	DateTo    string
}

func GetProducts(filter ProductFilter) ([]models.Product, error) {
	query := database.DB.Preload("Creator").Preload("Creator.Role")

	if filter.Status != "" {
		query = query.Where("status = ?", filter.Status)
	}
	if filter.CreatedBy > 0 {
		query = query.Where("created_by = ?", filter.CreatedBy)
	}
	if filter.Search != "" {
		search := "%" + filter.Search + "%"
		query = query.Where("product_id LIKE ? OR customer_name LIKE ? OR description LIKE ?", search, search, search)
	}
	if filter.DateFrom != "" {
		query = query.Where("created_at >= ?", filter.DateFrom)
	}
	if filter.DateTo != "" {
		query = query.Where("created_at <= ?", filter.DateTo)
	}

	var products []models.Product
	err := query.Order("created_at DESC").Find(&products).Error
	return products, err
}

func GetProductByID(id uint) (*models.Product, error) {
	var product models.Product
	err := database.DB.Preload("Creator").Preload("Creator.Role").
		Preload("Attachments").Preload("Attachments.Uploader").
		Preload("Comments").Preload("Comments.User").
		First(&product, id).Error
	return &product, err
}

func GetProductByIDSimple(id uint) (*models.Product, error) {
	var product models.Product
	err := database.DB.Preload("Creator").Preload("Creator.Role").First(&product, id).Error
	return &product, err
}

func CreateProduct(product *models.Product) error {
	return database.DB.Create(product).Error
}

func UpdateProduct(id uint, updates map[string]interface{}) error {
	return database.DB.Model(&models.Product{}).Where("id = ?", id).Updates(updates).Error
}

func UpdateProductStatus(id uint, status string) error {
	return database.DB.Model(&models.Product{}).Where("id = ?", id).Update("status", status).Error
}

func DeleteProduct(id uint) error {
	return database.DB.Delete(&models.Product{}, id).Error
}
