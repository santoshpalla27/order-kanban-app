package services

import (
	"fmt"
	"time"

	"kanban-app/database"
	"kanban-app/internal/models"
)

const gracePeriodDays = 10

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

// IsProductIDTaken returns (taken bool, reason string, err error).
// Blocks reuse when an active product OR a grace-period soft-deleted product has the same ID.
func IsProductIDTaken(productID string) (bool, string, error) {
	var count int64

	// Check active products
	if err := database.DB.Model(&models.Product{}).
		Where("product_id = ?", productID).Count(&count).Error; err != nil {
		return false, "", err
	}
	if count > 0 {
		return true, "product ID already exists", nil
	}

	// Check soft-deleted products still within the grace period
	graceCutoff := time.Now().Add(-gracePeriodDays * 24 * time.Hour)
	if err := database.DB.Unscoped().Model(&models.Product{}).
		Where("original_id = ? AND deleted_at IS NOT NULL AND deleted_at > ?", productID, graceCutoff).
		Count(&count).Error; err != nil {
		return false, "", err
	}
	if count > 0 {
		return true, fmt.Sprintf("product ID is reserved — a recently deleted product with this ID can be restored for up to %d days", gracePeriodDays), nil
	}

	return false, "", nil
}

func UpdateProduct(id uint, updates map[string]interface{}) error {
	return database.DB.Model(&models.Product{}).Where("id = ?", id).Updates(updates).Error
}

func UpdateProductStatus(id uint, status string) error {
	return database.DB.Model(&models.Product{}).Where("id = ?", id).Update("status", status).Error
}

// DeleteProduct soft-deletes: mangles product_id to free the unique index slot,
// stores the real ID in original_id, records who deleted it, then sets deleted_at via GORM.
func DeleteProduct(id uint, deletedByID uint) error {
	product, err := GetProductByIDSimple(id)
	if err != nil {
		return err
	}

	mangledID := fmt.Sprintf("%s__del_%d", product.ProductID, time.Now().Unix())

	if err := database.DB.Model(&models.Product{}).Where("id = ?", id).Updates(map[string]interface{}{
		"product_id":  mangledID,
		"original_id": product.ProductID,
		"deleted_by":  deletedByID,
	}).Error; err != nil {
		return err
	}

	return database.DB.Delete(&models.Product{}, id).Error
}

// GetDeletedProducts returns soft-deleted products still within the grace period.
func GetDeletedProducts() ([]models.Product, error) {
	var products []models.Product
	graceCutoff := time.Now().Add(-gracePeriodDays * 24 * time.Hour)
	err := database.DB.Unscoped().
		Preload("Creator").Preload("Creator.Role").
		Where("deleted_at IS NOT NULL AND deleted_at > ?", graceCutoff).
		Order("deleted_at DESC").
		Find(&products).Error
	return products, err
}

// RestoreProduct un-deletes a product and restores its original product_id.
func RestoreProduct(id uint) error {
	var product models.Product
	if err := database.DB.Unscoped().First(&product, id).Error; err != nil {
		return err
	}
	return database.DB.Unscoped().Model(&models.Product{}).Where("id = ?", id).Updates(map[string]interface{}{
		"product_id":  product.OriginalID,
		"original_id": "",
		"deleted_by":  0,
		"deleted_at":  nil,
	}).Error
}

// PurgeExpiredDeletedProducts hard-deletes products whose grace period has elapsed.
func PurgeExpiredDeletedProducts() error {
	graceCutoff := time.Now().Add(-gracePeriodDays * 24 * time.Hour)
	return database.DB.Unscoped().
		Where("deleted_at IS NOT NULL AND deleted_at < ?", graceCutoff).
		Delete(&models.Product{}).Error
}
