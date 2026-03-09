package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"

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

	products, err := services.GetProducts(filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch products"})
		return
	}

	c.JSON(http.StatusOK, products)
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

	userID := c.GetUint("user_id")
	userName, _ := c.Get("user_name")

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

	// Log activity
	services.CreateActivityLog(&models.ActivityLog{
		UserID:   userID,
		Action:   "created",
		Entity:   "product",
		EntityID: product.ID,
		Details:  fmt.Sprintf("Created product %s", product.ProductID),
	})

	// Notify
	message := fmt.Sprintf("%s created new product: %s", userName, product.ProductID)
	BroadcastNotificationExcept(userID, NotifPayload{
		Message:    message,
		NotifType:  "product_created",
		EntityType: "product",
		EntityID:   product.ID,
		SenderName: userName.(string),
	})

	wsMsg, _ := json.Marshal(WSMessage{
		Type:    "product_created",
		Payload: product,
	})
	Hub.BroadcastMessage(wsMsg)

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
	if req.CustomerName != "" {
		updates["customer_name"] = req.CustomerName
	}
	if req.CustomerPhone != "" {
		updates["customer_phone"] = req.CustomerPhone
	}
	if req.Description != "" {
		updates["description"] = req.Description
	}

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
	roleName := role.(string)

	// Check worker transitions
	if roleName == "worker" {
		allowed, ok := models.WorkerAllowedTransitions[oldStatus]
		if !ok {
			c.JSON(http.StatusForbidden, gin.H{"error": "Invalid status transition"})
			return
		}
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
	if err := services.DeleteProduct(uint(id)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete product"})
		return
	}

	delUserID := c.GetUint("user_id")
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

	wsMsg, _ := json.Marshal(WSMessage{
		Type:    "product_deleted",
		Payload: gin.H{"id": id},
	})
	Hub.BroadcastMessage(wsMsg)

	c.JSON(http.StatusOK, gin.H{"message": "Product deleted"})
}
