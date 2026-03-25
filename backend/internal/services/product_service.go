package services

import (
	"fmt"
	"log/slog"
	"time"

	"kanban-app/database"
	"kanban-app/internal/models"

	"gorm.io/gorm"
)

const gracePeriodDays = 10

type ProductFilter struct {
	Status         string
	CreatedBy      uint
	AssignedTo     uint
	Search         string
	DateFrom       string
	DateTo         string
	DeliveryFrom string
	DeliveryTo   string
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
	if filter.AssignedTo > 0 {
		query = query.Where("EXISTS (SELECT 1 FROM product_assignees WHERE product_id = products.id AND user_id = ?)", filter.AssignedTo)
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
	if filter.DeliveryFrom != "" {
		query = query.Where("delivery_at >= ?", filter.DeliveryFrom)
	}
	if filter.DeliveryTo != "" {
		query = query.Where("delivery_at < ?", filter.DeliveryTo)
	}
	return query
}

// GetProducts returns all matching products ordered by created_at DESC.
// Used by the Kanban board which loads the full list once.
func GetProducts(filter ProductFilter) ([]models.Product, error) {
	query := applyProductFilters(
		database.DB.Preload("Creator").Preload("Creator.Role").Preload("Assignees").Preload("Assignees.Role"),
		filter,
	)
	var products []models.Product
	err := query.Order("created_at DESC").Find(&products).Error
	return products, err
}

// GetProductsCursor returns one page of products using keyset (cursor) pagination.
func GetProductsCursor(filter ProductFilter, limit int, cursor uint) (ProductCursorPage, error) {
	query := applyProductFilters(
		database.DB.Preload("Creator").Preload("Creator.Role").Preload("Assignees").Preload("Assignees.Role"),
		filter,
	)
	if cursor > 0 {
		query = query.Where("id < ?", cursor)
	}

	var products []models.Product
	if err := query.Order("updated_at DESC, id DESC").Limit(limit + 1).Find(&products).Error; err != nil {
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

	var total int64
	applyProductFilters(database.DB.Model(&models.Product{}), filter).Count(&total)

	return ProductCursorPage{Data: products, NextCursor: nextCursor, HasMore: hasMore, Total: total}, nil
}

func GetProductByID(id uint) (*models.Product, error) {
	var product models.Product
	err := database.DB.Preload("Creator").Preload("Creator.Role").
		Preload("Assignees").Preload("Assignees.Role").
		Preload("Attachments").Preload("Attachments.Uploader").
		Preload("Comments").Preload("Comments.User").
		First(&product, id).Error
	return &product, err
}

func GetProductByIDSimple(id uint) (*models.Product, error) {
	var product models.Product
	err := database.DB.Preload("Creator").Preload("Creator.Role").
		Preload("Assignees").Preload("Assignees.Role").First(&product, id).Error
	return &product, err
}

func CreateProduct(product *models.Product, assigneeIDs []uint) error {
	if err := database.DB.Create(product).Error; err != nil {
		return err
	}
	if len(assigneeIDs) > 0 {
		var users []models.User
		database.DB.Where("id IN ?", assigneeIDs).Find(&users)
		database.DB.Model(product).Association("Assignees").Replace(users)
	}
	return nil
}

// IsProductIDTaken checks both active products and grace-period soft-deleted products.
func IsProductIDTaken(productID string) (bool, string, error) {
	var count int64

	if err := database.DB.Model(&models.Product{}).
		Where("product_id = ?", productID).Count(&count).Error; err != nil {
		return false, "", err
	}
	if count > 0 {
		return true, "product ID already exists", nil
	}

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

func UpdateProduct(id uint, updates map[string]interface{}, assigneeIDs []uint) error {
	if err := database.DB.Model(&models.Product{}).Where("id = ?", id).Updates(updates).Error; err != nil {
		return err
	}
	// Always replace assignees (empty slice clears all)
	var users []models.User
	if len(assigneeIDs) > 0 {
		database.DB.Where("id IN ?", assigneeIDs).Find(&users)
	}
	product := &models.Product{ID: id}
	return database.DB.Model(product).Association("Assignees").Replace(users)
}

func UpdateProductStatus(id uint, status string) error {
	return database.DB.Model(&models.Product{}).Where("id = ?", id).
		Updates(map[string]interface{}{"status": status, "updated_at": time.Now()}).Error
}

// DeleteProduct soft-deletes a product.
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
		Preload("Assignees").Preload("Assignees.Role").
		Where("deleted_at IS NOT NULL AND deleted_at > ?", graceCutoff).
		Order("deleted_at DESC").
		Find(&products).Error
	return products, err
}

// RestoreProduct un-deletes a product.
func RestoreProduct(id uint) error {
	return database.DB.Unscoped().Model(&models.Product{}).Where("id = ?", id).Updates(map[string]interface{}{
		"deleted_at": nil,
		"deleted_by": 0,
	}).Error
}

// PurgeExpiredDeletedProducts hard-deletes products whose grace period has elapsed.
func PurgeExpiredDeletedProducts() error {
	graceCutoff := time.Now().Add(-gracePeriodDays * 24 * time.Hour)

	var productIDs []uint
	if err := database.DB.Unscoped().Model(&models.Product{}).
		Where("deleted_at IS NOT NULL AND deleted_at < ?", graceCutoff).
		Pluck("id", &productIDs).Error; err != nil {
		return err
	}
	if len(productIDs) == 0 {
		return nil
	}

	if R2 != nil {
		var attachments []models.Attachment
		if err := database.DB.Where("product_id IN ?", productIDs).Find(&attachments).Error; err == nil {
			for _, a := range attachments {
				if a.FilePath != "" {
					if r2Err := R2.DeleteObject(a.FilePath); r2Err != nil {
						slog.Error("purge: failed to delete R2 object", "key", a.FilePath, "error", r2Err)
					}
				}
			}
		}
	}

	// Delete child records first — comments and attachments have FK constraints on
	// product_id with no ON DELETE CASCADE, so the product DELETE would be rejected.
	if err := database.DB.Where("product_id IN ?", productIDs).Delete(&models.Comment{}).Error; err != nil {
		slog.Error("purge: failed to delete comments", "error", err)
	}
	if err := database.DB.Where("product_id IN ?", productIDs).Delete(&models.Attachment{}).Error; err != nil {
		slog.Error("purge: failed to delete attachments", "error", err)
	}

	return database.DB.Unscoped().
		Where("deleted_at IS NOT NULL AND deleted_at < ?", graceCutoff).
		Delete(&models.Product{}).Error
}
