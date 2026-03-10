package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"

	"kanban-app/database"
	"kanban-app/internal/models"
	"kanban-app/internal/services"

	"github.com/gin-gonic/gin"
)

type ProductHandler struct{}

func NewProductHandler() *ProductHandler {
	return &ProductHandler{}
}

func (h *ProductHandler) GetProducts(c *gin.Context) {
	filter := services.ProductFilter{
		Status:   c.Query("status"),
		Search:   c.Query("search"),
		DateFrom: c.Query("date_from"),
		DateTo:   c.Query("date_to"),
	}

	if userIDStr := c.Query("created_by"); userIDStr != "" {
		if id, err := strconv.ParseUint(userIDStr, 10, 32); err == nil {
			filter.CreatedBy = uint(id)
		}
	}

	// When limit is absent the Kanban board gets the full list (existing behaviour).
	// When limit is present the list view gets a cursor-paginated page.
	limitStr := c.Query("limit")
	if limitStr == "" {
		products, err := services.GetProducts(filter)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch products"})
			return
		}
		c.JSON(http.StatusOK, products)
		return
	}

	limit, err := strconv.Atoi(limitStr)
	if err != nil || limit <= 0 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}

	var cursor uint
	if cursorStr := c.Query("cursor"); cursorStr != "" {
		if id, err := strconv.ParseUint(cursorStr, 10, 32); err == nil {
			cursor = uint(id)
		}
	}

	page, err := services.GetProductsCursor(filter, limit, cursor)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch products"})
		return
	}
	c.JSON(http.StatusOK, page)
}

func (h *ProductHandler) GetProduct(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid product ID"})
		return
	}

	product, err := services.GetProductByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Product not found"})
		return
	}

	c.JSON(http.StatusOK, product)
}

func (h *ProductHandler) CreateProduct(c *gin.Context) {
	var req models.CreateProductRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if taken, reason, err := services.IsProductIDTaken(req.ProductID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to validate product ID"})
		return
	} else if taken {
		c.JSON(http.StatusConflict, gin.H{"error": reason})
		return
	}

	userID := c.GetUint("user_id")
	userName, _ := c.Get("user_name")
	senderName := userName.(string)

	product := &models.Product{
		ProductID:     req.ProductID,
		CustomerName:  req.CustomerName,
		CustomerPhone: req.CustomerPhone,
		Description:   req.Description,
		Status:        "yet_to_start",
		CreatedBy:     userID,
	}

	if err := services.CreateProduct(product); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create product"})
		return
	}

	product, _ = services.GetProductByIDSimple(product.ID)

	services.CreateActivityLog(&models.ActivityLog{
		UserID:   userID,
		Action:   "created",
		Entity:   "product",
		EntityID: product.ID,
		Details:  fmt.Sprintf("Created product %s", product.ProductID),
	})

	message := fmt.Sprintf("%s created new product: %s", senderName, product.ProductID)
	services.CreateNotificationForAllExcept(userID, message, "product_created", "product", product.ID, "", senderName)

	wsMsg, _ := json.Marshal(WSMessage{Type: "product_created", Payload: product})
	database.EmitBroadcast(wsMsg)

	c.JSON(http.StatusCreated, product)
}

func (h *ProductHandler) UpdateProduct(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid product ID"})
		return
	}

	var req models.UpdateProductRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	updates := map[string]interface{}{}
	if req.ProductID != "" {
		// Check uniqueness only if the ID is actually changing
		existing, _ := services.GetProductByIDSimple(uint(id))
		if existing == nil || existing.ProductID != req.ProductID {
			if taken, reason, err := services.IsProductIDTaken(req.ProductID); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to validate product ID"})
				return
			} else if taken {
				c.JSON(http.StatusConflict, gin.H{"error": reason})
				return
			}
		}
		updates["product_id"] = req.ProductID
	}
	if req.CustomerName != "" {
		updates["customer_name"] = req.CustomerName
	}
	// Allow clearing optional fields by always setting them when present in the request
	updates["customer_phone"] = req.CustomerPhone
	updates["description"] = req.Description

	if err := services.UpdateProduct(uint(id), updates); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update product"})
		return
	}

	product, _ := services.GetProductByIDSimple(uint(id))
	userID := c.GetUint("user_id")
	services.CreateActivityLog(&models.ActivityLog{
		UserID:   userID,
		Action:   "updated",
		Entity:   "product",
		EntityID: product.ID,
		Details:  fmt.Sprintf("Updated product %s", product.ProductID),
	})
	c.JSON(http.StatusOK, product)
}

func (h *ProductHandler) UpdateStatus(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid product ID"})
		return
	}

	var req models.UpdateStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	product, err := services.GetProductByIDSimple(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Product not found"})
		return
	}

	oldStatus := product.Status
	role, _ := c.Get("role")
	if role.(string) == "worker" {
		allowed := models.WorkerAllowedTransitions[oldStatus]
		valid := false
		for _, s := range allowed {
			if s == req.Status {
				valid = true
				break
			}
		}
		if !valid {
			c.JSON(http.StatusForbidden, gin.H{"error": "Workers cannot make this status transition"})
			return
		}
	}

	if err := services.UpdateProductStatus(uint(id), req.Status); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update status"})
		return
	}

	product, _ = services.GetProductByIDSimple(uint(id))
	userID := c.GetUint("user_id")
	userName, _ := c.Get("user_name")

	services.CreateActivityLog(&models.ActivityLog{
		UserID:   userID,
		Action:   "status_changed",
		Entity:   "product",
		EntityID: product.ID,
		Details:  fmt.Sprintf("Status changed from %s to %s", oldStatus, req.Status),
	})

	NotifyStatusChange(userID, userName.(string), product, oldStatus, req.Status)
	c.JSON(http.StatusOK, product)
}

func (h *ProductHandler) DeleteProduct(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid product ID"})
		return
	}

	product, _ := services.GetProductByIDSimple(uint(id))
	delUserID := c.GetUint("user_id")

	if err := services.DeleteProduct(uint(id), delUserID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete product"})
		return
	}

	prodName := fmt.Sprintf("%d", id)
	if product != nil {
		prodName = product.ProductID
	}
	services.CreateActivityLog(&models.ActivityLog{
		UserID:   delUserID,
		Action:   "deleted",
		Entity:   "product",
		EntityID: uint(id),
		Details:  fmt.Sprintf("Deleted product %s", prodName),
	})

	wsMsg, _ := json.Marshal(WSMessage{Type: "product_deleted", Payload: gin.H{"id": id}})
	database.EmitBroadcast(wsMsg)

	c.JSON(http.StatusOK, gin.H{"message": "Product moved to trash"})
}

func (h *ProductHandler) GetDeletedProducts(c *gin.Context) {
	products, err := services.GetDeletedProducts()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch deleted products"})
		return
	}
	c.JSON(http.StatusOK, products)
}

func (h *ProductHandler) RestoreProduct(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid product ID"})
		return
	}

	if err := services.RestoreProduct(uint(id)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to restore product"})
		return
	}

	product, _ := services.GetProductByIDSimple(uint(id))
	userID := c.GetUint("user_id")
	prodName := fmt.Sprintf("%d", id)
	if product != nil {
		prodName = product.ProductID
	}
	services.CreateActivityLog(&models.ActivityLog{
		UserID:   userID,
		Action:   "restored",
		Entity:   "product",
		EntityID: uint(id),
		Details:  fmt.Sprintf("Restored product %s from trash", prodName),
	})

	wsMsg, _ := json.Marshal(WSMessage{Type: "product_created", Payload: product})
	database.EmitBroadcast(wsMsg)

	c.JSON(http.StatusOK, gin.H{"message": "Product restored"})
}
