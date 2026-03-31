package handlers

import (
	"net/http"
	"strconv"

	"kanban-app/internal/services"

	"github.com/gin-gonic/gin"
)

type CustomerLinkHandler struct{}

func NewCustomerLinkHandler() *CustomerLinkHandler {
	return &CustomerLinkHandler{}
}

// GET /products/:id/customer-link
func (h *CustomerLinkHandler) Get(c *gin.Context) {
	productID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid product ID"})
		return
	}

	link, err := services.GetCustomerLink(uint(productID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch customer link"})
		return
	}
	if link == nil {
		c.JSON(http.StatusOK, gin.H{"link": nil})
		return
	}
	c.JSON(http.StatusOK, gin.H{"link": link})
}

// POST /products/:id/customer-link
func (h *CustomerLinkHandler) Create(c *gin.Context) {
	productID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid product ID"})
		return
	}

	userID := c.GetUint("user_id")
	link, err := services.CreateCustomerLink(uint(productID), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create customer link"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"link": link})
}

// DELETE /products/:id/customer-link/:linkId
func (h *CustomerLinkHandler) Deactivate(c *gin.Context) {
	linkID, err := strconv.ParseUint(c.Param("linkId"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid link ID"})
		return
	}

	if err := services.DeactivateCustomerLink(uint(linkID)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to revoke link"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
