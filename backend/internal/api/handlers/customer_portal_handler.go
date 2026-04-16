package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"kanban-app/database"
	"kanban-app/internal/models"
	"kanban-app/internal/services"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type CustomerPortalHandler struct{}

func NewCustomerPortalHandler() *CustomerPortalHandler {
	return &CustomerPortalHandler{}
}

// resolveLink validates the :token param and returns the CustomerLink.
// Returns false and writes an error response if invalid.
func resolveLink(c *gin.Context) (*models.CustomerLink, bool) {
	token := c.Param("token")
	link, err := services.ValidateToken(token)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Internal error"})
		return nil, false
	}
	if link == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Invalid or expired link"})
		return nil, false
	}

	// Verify that the underlying product actually exists and is not soft-deleted
	product, err := services.GetProductByIDSimple(link.ProductID)
	if err != nil || product == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Product not found or has been deleted"})
		return nil, false
	}

	return link, true
}

// GET /portal/:token
// Returns minimal product info safe to expose to customers.
func (h *CustomerPortalHandler) GetProductInfo(c *gin.Context) {
	link, ok := resolveLink(c)
	if !ok {
		return
	}

	product, err := services.GetProductByIDSimple(link.ProductID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Product not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"product_id":     product.ProductID,
		"customer_name":  product.CustomerName,
		"status":         product.Status,
		"description":    product.Description,
		"delivery_at":    product.DeliveryAt,
	})
}

// GET /portal/:token/messages
// Returns customer comments for this product.
func (h *CustomerPortalHandler) GetMessages(c *gin.Context) {
	link, ok := resolveLink(c)
	if !ok {
		return
	}

	comments, err := services.GetCustomerComments(link.ProductID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch messages"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": comments})
}

// POST /portal/:token/messages
// Customer submits a text message (may contain [attachment:ID:filename] tokens).
func (h *CustomerPortalHandler) PostMessage(c *gin.Context) {
	link, ok := resolveLink(c)
	if !ok {
		return
	}

	var req struct {
		Message string `json:"message" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if len([]rune(req.Message)) > 4000 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Message exceeds 4000 characters"})
		return
	}

	product, _ := services.GetProductByIDSimple(link.ProductID)
	senderName := "Customer"
	if product != nil {
		senderName = product.CustomerName
	}

	comment := &models.Comment{
		ProductID:    link.ProductID,
		Message:      req.Message,
		Source:       "customer",
		PortalSender: senderName,
	}
	// Omit UserID so the nullable column receives NULL (no user for portal submissions)
	if err := database.DB.Omit("UserID").Create(comment).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save message"})
		return
	}

	productLabel := fmt.Sprintf("order #%d", link.ProductID)
	if product != nil {
		productLabel = product.ProductID
	}

	// Notify only assignees + managers — not the whole team
	message := fmt.Sprintf("%s sent a message on order %s", senderName, productLabel)
	services.CreateNotificationForAssigneesAndManagers(0, link.ProductID, message, "customer_message", "product", link.ProductID, req.Message, senderName)

	// Broadcast UI refresh
	wsMsg, _ := json.Marshal(WSMessage{
		Type: "comment_added",
		Payload: gin.H{
			"product_id": link.ProductID,
			"comment":    comment,
		},
	})
	database.EmitBroadcast(wsMsg)

	c.JSON(http.StatusCreated, comment)
}

// GET /portal/:token/attachments
// Returns customer attachments for this product (with presigned view URLs for images).
func (h *CustomerPortalHandler) GetAttachments(c *gin.Context) {
	link, ok := resolveLink(c)
	if !ok {
		return
	}

	attachments, err := services.GetCustomerAttachments(link.ProductID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch attachments"})
		return
	}

	type attachmentWithURL struct {
		models.Attachment
		ViewURL string `json:"view_url,omitempty"`
	}
	result := make([]attachmentWithURL, len(attachments))
	for i, att := range attachments {
		result[i] = attachmentWithURL{Attachment: att}
		if isImageExtension(att.FileType) && services.R2 != nil {
			if url, err := services.R2.GenerateViewURL(att.FilePath); err == nil {
				result[i].ViewURL = url
			}
		}
	}
	c.JSON(http.StatusOK, result)
}

// GET /portal/:token/attachments/presign
// Returns a presigned upload URL for the customer to PUT a file directly to R2.
func (h *CustomerPortalHandler) GetPresignedUploadURL(c *gin.Context) {
	link, ok := resolveLink(c)
	if !ok {
		return
	}

	filename := c.Query("filename")
	if filename == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "filename query param required"})
		return
	}

	ext := strings.ToLower(filepath.Ext(filename))
	if !allowedExtensions[ext] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "File type not allowed"})
		return
	}

	contentType := extToContentType[ext]
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	s3Key := fmt.Sprintf("portal/%d/%s_%s%s",
		link.ProductID, uuid.New().String()[:8], time.Now().Format("20060102"), ext)

	uploadURL, err := services.R2.GenerateUploadURL(s3Key, contentType, 10*1024*1024)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate upload URL"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"upload_url":   uploadURL,
		"s3_key":       s3Key,
		"content_type": contentType,
	})
}

// POST /portal/:token/attachments/confirm
// Confirms a completed upload and creates the Attachment record.
func (h *CustomerPortalHandler) ConfirmUpload(c *gin.Context) {
	link, ok := resolveLink(c)
	if !ok {
		return
	}

	var req struct {
		S3Key    string `json:"s3_key" binding:"required"`
		FileName string `json:"file_name" binding:"required"`
		FileSize int64  `json:"file_size"`
		FileType string `json:"file_type"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "s3_key and file_name required"})
		return
	}

	product, _ := services.GetProductByIDSimple(link.ProductID)
	senderName := "Customer"
	if product != nil {
		senderName = product.CustomerName
	}

	attachment := &models.Attachment{
		ProductID:    link.ProductID,
		FilePath:     req.S3Key,
		FileName:     req.FileName,
		FileType:     req.FileType,
		FileSize:     req.FileSize,
		Source:       "customer",
		PortalSender: senderName,
		UploadedAt:   time.Now(),
	}
	// Omit UploadedBy so the nullable column receives NULL (no user for portal submissions)
	if err := database.DB.Omit("UploadedBy").Create(attachment).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save attachment"})
		return
	}

	productLabel := fmt.Sprintf("order #%d", link.ProductID)
	if product != nil {
		productLabel = product.ProductID
	}

	// Notify only assignees + managers — not the whole team
	message := fmt.Sprintf("%s uploaded '%s' on order %s", senderName, req.FileName, productLabel)
	services.CreateNotificationForAssigneesAndManagers(0, link.ProductID, message, "customer_message", "product", link.ProductID, "", senderName)

	// Broadcast UI refresh
	wsMsg, _ := json.Marshal(WSMessage{Type: "attachment_uploaded", Payload: attachment})
	database.EmitBroadcast(wsMsg)

	// Return with presigned view URL if image
	type resp struct {
		models.Attachment
		ViewURL string `json:"view_url,omitempty"`
	}
	r := resp{Attachment: *attachment}
	if isImageExtension(attachment.FileType) && services.R2 != nil {
		if url, err := services.R2.GenerateViewURL(attachment.FilePath); err == nil {
			r.ViewURL = url
		}
	}
	c.JSON(http.StatusCreated, r)
}

// DELETE /portal/:token/attachments/:id
// Allows a customer to delete one of their own uploaded attachments.
func (h *CustomerPortalHandler) DeleteAttachment(c *gin.Context) {
	link, ok := resolveLink(c)
	if !ok {
		return
	}

	idStr := c.Param("id")
	attID, err := strconv.Atoi(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid attachment ID"})
		return
	}

	var att models.Attachment
	if err := database.DB.First(&att, attID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Attachment not found"})
		return
	}

	// Only allow deletion of attachments belonging to this product and uploaded via portal
	if att.ProductID != link.ProductID || att.Source != "customer" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Not allowed"})
		return
	}

	// Delete from R2 if available
	if services.R2 != nil && att.FilePath != "" {
		_ = services.R2.DeleteObject(att.FilePath)
	}

	if err := database.DB.Delete(&att).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete attachment"})
		return
	}

	// Broadcast UI refresh
	wsMsg, _ := json.Marshal(WSMessage{Type: "attachment_deleted", Payload: gin.H{"attachment_id": attID, "product_id": link.ProductID}})
	database.EmitBroadcast(wsMsg)

	c.JSON(http.StatusOK, gin.H{"deleted": true})
}
