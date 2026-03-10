package services

import (
	"fmt"
	"time"

	"kanban-app/database"
	"kanban-app/internal/models"

	"gorm.io/gorm"
)

const gracePeriodDays = 10

type ProductFilter struct {
	Status    string
	CreatedBy uint
	Search    string
	DateFrom  string
	DateTo    string
}

// ProductCursorPage is returned by GetProductsCursor for paginated list views.
type ProductCursorPage struct {
	Data       []models.Product `json:"data"`
	NextCursor *uint            `json:"next_cursor"`
	HasMore    bool             `json:"has_more"`
	Total      int64            `json:"total"` // total matching records (ignores cursor)
}

// applyProductFilters builds WHERE clauses shared by GetProducts and GetProductsCursor.
func applyProductFilters(query *gorm.DB, filter ProductFilter) *gorm.DB {
	if filter.Status != "" {
		query = query.Where("status = ?", filter.Status)
	}
	if filter.CreatedBy > 0 {
		query = query.Where("created_by = ?", filter.CreatedBy)
	}
	if filter.Search != "" {
		search := "%" + filter.Search + "%"
		query = query.Where("product_id ILIKE ? OR customer_name ILIKE ? OR description ILIKE ?", search, search, search)
	}
	if filter.DateFrom != "" {
		query = query.Where("created_at >= ?", filter.DateFrom)
	}
	if filter.DateTo != "" {
		query = query.Where("created_at <= ?", filter.DateTo)
	}
	return query
}

// GetProducts returns all matching products ordered by created_at DESC.
// Used by the Kanban board which loads the full list once.
func GetProducts(filter ProductFilter) ([]models.Product, error) {
	query := applyProductFilters(
		database.DB.Preload("Creator").Preload("Creator.Role"),
		filter,
	)
	var products []models.Product
	err := query.Order("created_at DESC").Find(&products).Error
	return products, err
}

// GetProductsCursor returns one page of products using keyset (cursor) pagination.
// cursor is the ID of the last product seen; pass 0 for the first page.
// Products are ordered by id DESC so that the cursor is stable even if created_at values
// are identical (e.g. bulk imports).
func GetProductsCursor(filter ProductFilter, limit int, cursor uint) (ProductCursorPage, error) {
	query := applyProductFilters(
		database.DB.Preload("Creator").Preload("Creator.Role"),
		filter,
	)
	if cursor > 0 {
		query = query.Where("id < ?", cursor)
	}

	// Fetch one extra row to detect whether a next page exists
	var products []models.Product
	if err := query.Order("id DESC").Limit(limit + 1).Find(&products).Error; err != nil {
		return ProductCursorPage{}, err
	}

	hasMore := len(products) > limit
	if hasMore {
		products = products[:limit]
	}

	var nextCursor *uint
	if hasMore && len(products) > 0 {
		last := products[len(products)-1].ID
		nextCursor = &last
	}

	// Total count for this filter set (no cursor applied — shows real column size)
	var total int64
	applyProductFilters(database.DB.Model(&models.Product{}), filter).Count(&total)

	return ProductCursorPage{Data: products, NextCursor: nextCursor, HasMore: hasMore, Total: total}, nil
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

// IsProductIDTaken checks both active products and grace-period soft-deleted products.
// The Postgres partial unique index (WHERE deleted_at IS NULL) handles active-product
// uniqueness at the DB level; this check adds a grace-period guard with a friendly message.
func IsProductIDTaken(productID string) (bool, string, error) {
	var count int64

	// Active products (GORM auto-applies deleted_at IS NULL scope)
	if err := database.DB.Model(&models.Product{}).
		Where("product_id = ?", productID).Count(&count).Error; err != nil {
		return false, "", err
	}
	if count > 0 {
		return true, "product ID already exists", nil
	}

	// Soft-deleted products still within the grace period
	graceCutoff := time.Now().Add(-gracePeriodDays * 24 * time.Hour)
	if err := database.DB.Unscoped().Model(&models.Product{}).
		Where("product_id = ? AND deleted_at IS NOT NULL AND deleted_at > ?", productID, graceCutoff).
		Count(&count).Error; err != nil {
		return false, "", err
	}
	if count > 0 {
		return true, fmt.Sprintf(
			"product ID '%s' is reserved — it can be restored for up to %d days after deletion",
			productID, gracePeriodDays,
		), nil
	}

	return false, "", nil
}

func UpdateProduct(id uint, updates map[string]interface{}) error {
	return database.DB.Model(&models.Product{}).Where("id = ?", id).Updates(updates).Error
}

func UpdateProductStatus(id uint, status string) error {
	return database.DB.Model(&models.Product{}).Where("id = ?", id).Update("status", status).Error
}

// DeleteProduct soft-deletes a product. No ID mangling needed — the Postgres partial unique
// index (WHERE deleted_at IS NULL) releases the uniqueness slot automatically on soft delete.
func DeleteProduct(id uint, deletedByID uint) error {
	if err := database.DB.Model(&models.Product{}).Where("id = ?", id).
		Update("deleted_by", deletedByID).Error; err != nil {
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

// RestoreProduct un-deletes a product. The partial unique index re-enforces uniqueness
// automatically once deleted_at is cleared back to NULL.
func RestoreProduct(id uint) error {
	return database.DB.Unscoped().Model(&models.Product{}).Where("id = ?", id).Updates(map[string]interface{}{
		"deleted_at": nil,
		"deleted_by": 0,
	}).Error
}

// PurgeExpiredDeletedProducts hard-deletes products whose grace period has elapsed.
func PurgeExpiredDeletedProducts() error {
	graceCutoff := time.Now().Add(-gracePeriodDays * 24 * time.Hour)
	return database.DB.Unscoped().
		Where("deleted_at IS NOT NULL AND deleted_at < ?", graceCutoff).
		Delete(&models.Product{}).Error
}
