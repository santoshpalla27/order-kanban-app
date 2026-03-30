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

type CustomerHandler struct{}

func NewCustomerHandler() *CustomerHandler { return &CustomerHandler{} }

// ─── helpers ─────────────────────────────────────────────────────────────────

func getProductForCustomer(productID uint) (*models.Product, error) {
	var p models.Product
	err := database.DB.First(&p, productID).Error
	return &p, err
}

// ─── Staff: link management ───────────────────────────────────────────────────

// GET /api/products/:id/customer-link
func (h *CustomerHandler) GetLink(c *gin.Context) {
	productID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid product id"})
		return
	}
	link, err := services.GetActiveCustomerLink(uint(productID))
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"link": nil})
		return
	}
	c.JSON(http.StatusOK, gin.H{"link": link})
}

// POST /api/products/:id/customer-link
func (h *CustomerHandler) CreateLink(c *gin.Context) {
	productID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid product id"})
		return
	}
	var req struct {
		ExpiresInHours *int `json:"expires_in_hours"`
	}
	_ = c.ShouldBindJSON(&req)

	userID := c.GetUint("user_id")
	link, err := services.CreateCustomerLink(uint(productID), userID, req.ExpiresInHours)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create link"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"link": link})
}

// DELETE /api/products/:id/customer-link
func (h *CustomerHandler) RevokeLink(c *gin.Context) {
	productID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid product id"})
		return
	}
	if err := services.RevokeCustomerLink(uint(productID)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to revoke link"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "link revoked"})
}

// ─── Staff: messages ──────────────────────────────────────────────────────────

// GET /api/products/:id/customer-messages
func (h *CustomerHandler) GetMessages(c *gin.Context) {
	productID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid product id"})
		return
	}
	msgs, err := services.GetCustomerMessages(uint(productID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch messages"})
		return
	}
	c.JSON(http.StatusOK, msgs)
}

// POST /api/products/:id/customer-messages  (staff reply)
func (h *CustomerHandler) StaffReply(c *gin.Context) {
	productID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid product id"})
		return
	}
	var req struct {
		Message   string `json:"message" binding:"required"`
		ReplyToID *uint  `json:"reply_to_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "message required"})
		return
	}

	userName, _ := c.Get("user_name")
	msg := &models.CustomerMessage{
		ProductID:  uint(productID),
		SenderType: "staff",
		SenderName: fmt.Sprintf("%v", userName),
		Message:    req.Message,
		ReplyToID:  req.ReplyToID,
	}
	if err := services.CreateCustomerMessage(msg); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save message"})
		return
	}

	// Reload with ReplyTo preloaded
	database.DB.Preload("ReplyTo").First(msg, msg.ID)

	// Broadcast so the customer portal can poll/refresh
	wsPayload, _ := json.Marshal(WSMessage{
		Type:    "customer_message",
		Payload: gin.H{"product_id": productID},
	})
	database.EmitBroadcast(wsPayload)

	c.JSON(http.StatusCreated, msg)
}

// ─── Staff: presign for customer_reply attachments ────────────────────────────

// GET /api/products/:id/customer-messages/attachments/presign?filename=...
func (h *CustomerHandler) StaffAttachmentPresign(c *gin.Context) {
	productIDStr := c.Param("id")
	if _, err := strconv.ParseUint(productIDStr, 10, 32); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid product id"})
		return
	}
	filename := c.Query("filename")
	if filename == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "filename required"})
		return
	}
	ext := strings.ToLower(filepath.Ext(filename))
	if !allowedExtensions[ext] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file type not allowed"})
		return
	}
	contentType := extToContentType[ext]
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	s3Key := fmt.Sprintf("customer-reply/%s/%s_%s%s",
		productIDStr, uuid.New().String()[:8], time.Now().Format("20060102"), ext)
	uploadURL, err := services.R2.GenerateUploadURL(s3Key, contentType, 10*1024*1024)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate upload url"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"upload_url": uploadURL, "s3_key": s3Key, "content_type": contentType})
}

// POST /api/products/:id/customer-messages/attachments/confirm
func (h *CustomerHandler) StaffAttachmentConfirm(c *gin.Context) {
	productIDStr := c.Param("id")
	productID, err := strconv.ParseUint(productIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid product id"})
		return
	}
	var req struct {
		S3Key    string `json:"s3_key"    binding:"required"`
		FileName string `json:"file_name" binding:"required"`
		FileSize int64  `json:"file_size"`
		FileType string `json:"file_type"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "s3_key and file_name required"})
		return
	}
	userID := c.GetUint("user_id")
	att := &models.Attachment{
		ProductID:  uint(productID),
		FilePath:   req.S3Key,
		FileName:   req.FileName,
		FileType:   req.FileType,
		FileSize:   req.FileSize,
		Source:     "customer_reply",
		UploadedBy: &userID,
		UploadedAt: time.Now(),
	}
	if err := services.CreateAttachment(att); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save attachment"})
		return
	}
	// Generate view_url if it's an image
	type attWithURL struct {
		models.Attachment
		ViewURL string `json:"view_url,omitempty"`
	}
	result := attWithURL{Attachment: *att}
	if isImageExtension(att.FileType) {
		if url, err := services.R2.GenerateViewURL(att.FilePath); err == nil {
			result.ViewURL = url
		}
	}
	c.JSON(http.StatusCreated, result)
}

// ─── Public: portal ───────────────────────────────────────────────────────────

// validatePortalToken is a shared helper for public endpoints.
func validatePortalToken(c *gin.Context) (*models.CustomerLink, bool) {
	token := c.Param("token")
	link, err := services.ValidateCustomerToken(token)
	if err == services.ErrLinkNotFound {
		c.JSON(http.StatusNotFound, gin.H{"error": "link not found"})
		return nil, false
	}
	if err == services.ErrLinkExpired {
		c.JSON(http.StatusGone, gin.H{"error": "this link has expired or been revoked"})
		return nil, false
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "invalid link"})
		return nil, false
	}
	return link, true
}

// GET /api/customer/:token
func (h *CustomerHandler) PortalInfo(c *gin.Context) {
	link, ok := validatePortalToken(c)
	if !ok {
		return
	}
	product, err := getProductForCustomer(link.ProductID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "product not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"product_id":    product.ProductID,
		"customer_name": product.CustomerName,
		"description":   product.Description,
		"status":        product.Status,
		"delivery_at":   product.DeliveryAt,
		"internal_id":   product.ID,
	})
}

// GET /api/customer/:token/messages
func (h *CustomerHandler) PortalGetMessages(c *gin.Context) {
	link, ok := validatePortalToken(c)
	if !ok {
		return
	}
	msgs, err := services.GetCustomerMessages(link.ProductID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch messages"})
		return
	}
	c.JSON(http.StatusOK, msgs)
}

// POST /api/customer/:token/messages  (customer sends)
func (h *CustomerHandler) PortalSendMessage(c *gin.Context) {
	link, ok := validatePortalToken(c)
	if !ok {
		return
	}
	var req struct {
		Message    string `json:"message"     binding:"required"`
		SenderName string `json:"sender_name"`
		ReplyToID  *uint  `json:"reply_to_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "message required"})
		return
	}
	senderName := strings.TrimSpace(req.SenderName)
	if senderName == "" {
		senderName = "Customer"
	}
	msg := &models.CustomerMessage{
		ProductID:  link.ProductID,
		SenderType: "customer",
		SenderName: senderName,
		Message:    req.Message,
		ReplyToID:  req.ReplyToID,
	}
	if err := services.CreateCustomerMessage(msg); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save message"})
		return
	}
	database.DB.Preload("ReplyTo").First(msg, msg.ID)

	// Broadcast so staff CustomerTab can refresh in real-time
	wsPayload, _ := json.Marshal(WSMessage{
		Type:    "customer_message",
		Payload: gin.H{"product_id": link.ProductID},
	})
	database.EmitBroadcast(wsPayload)

	c.JSON(http.StatusCreated, msg)
}

// GET /api/customer/:token/attachments
func (h *CustomerHandler) PortalGetAttachments(c *gin.Context) {
	link, ok := validatePortalToken(c)
	if !ok {
		return
	}
	attachments, err := services.GetCustomerPortalAttachments(link.ProductID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch attachments"})
		return
	}
	type attWithURL struct {
		models.Attachment
		ViewURL string `json:"view_url,omitempty"`
	}
	result := make([]attWithURL, len(attachments))
	for i, att := range attachments {
		result[i] = attWithURL{Attachment: att}
		if isImageExtension(att.FileType) {
			if url, err := services.R2.GenerateViewURL(att.FilePath); err == nil {
				result[i].ViewURL = url
			}
		}
	}
	c.JSON(http.StatusOK, result)
}

// GET /api/customer/:token/attachments/presign?filename=...
func (h *CustomerHandler) PortalAttachmentPresign(c *gin.Context) {
	link, ok := validatePortalToken(c)
	if !ok {
		return
	}
	filename := c.Query("filename")
	if filename == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "filename required"})
		return
	}
	ext := strings.ToLower(filepath.Ext(filename))
	if !allowedExtensions[ext] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file type not allowed"})
		return
	}
	contentType := extToContentType[ext]
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	s3Key := fmt.Sprintf("customer-uploads/%d/%s_%s%s",
		link.ProductID, uuid.New().String()[:8], time.Now().Format("20060102"), ext)
	uploadURL, err := services.R2.GenerateUploadURL(s3Key, contentType, 10*1024*1024)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate upload url"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"upload_url": uploadURL, "s3_key": s3Key, "content_type": contentType})
}

// POST /api/customer/:token/attachments/confirm
func (h *CustomerHandler) PortalAttachmentConfirm(c *gin.Context) {
	link, ok := validatePortalToken(c)
	if !ok {
		return
	}
	var req struct {
		S3Key    string `json:"s3_key"    binding:"required"`
		FileName string `json:"file_name" binding:"required"`
		FileSize int64  `json:"file_size"`
		FileType string `json:"file_type"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "s3_key and file_name required"})
		return
	}
	// Customer uploads use source='attachment' so they appear in the Attachments tab
	att := &models.Attachment{
		ProductID:  link.ProductID,
		FilePath:   req.S3Key,
		FileName:   req.FileName,
		FileType:   req.FileType,
		FileSize:   req.FileSize,
		Source:     "attachment",
		UploadedBy: nil, // no authenticated user for customer portal uploads
		UploadedAt: time.Now(),
	}
	if err := services.CreateAttachment(att); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save attachment"})
		return
	}

	// Broadcast so staff see the new attachment immediately
	wsPayload, _ := json.Marshal(WSMessage{Type: "attachment_uploaded", Payload: att})
	database.EmitBroadcast(wsPayload)

	type attWithURL struct {
		models.Attachment
		ViewURL string `json:"view_url,omitempty"`
	}
	result := attWithURL{Attachment: *att}
	if isImageExtension(att.FileType) {
		if url, err := services.R2.GenerateViewURL(att.FilePath); err == nil {
			result.ViewURL = url
		}
	}
	c.JSON(http.StatusCreated, result)
}
