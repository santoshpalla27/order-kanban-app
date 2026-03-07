package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"kanban-app/config"
	"kanban-app/internal/models"
	"kanban-app/internal/services"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type AttachmentHandler struct {
	Config *config.Config
}

func NewAttachmentHandler(cfg *config.Config) *AttachmentHandler {
	return &AttachmentHandler{Config: cfg}
}

var allowedExtensions = map[string]bool{
	".jpg": true, ".jpeg": true, ".png": true, ".gif": true, ".webp": true,
	".pdf": true, ".docx": true, ".doc": true, ".xlsx": true,
	".txt": true, ".csv": true, ".zip": true,
}

// content type mapping for presigned URLs
var extToContentType = map[string]string{
	".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
	".gif": "image/gif", ".webp": "image/webp", ".pdf": "application/pdf",
	".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	".doc":  "application/msword", ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	".txt": "text/plain", ".csv": "text/csv", ".zip": "application/zip",
}

// ── Presigned Upload URL (R2 mode) ──
func (h *AttachmentHandler) GetPresignedUploadURL(c *gin.Context) {
	if !services.R2.IsEnabled() {
		c.JSON(http.StatusBadRequest, gin.H{"error": "R2 storage is not enabled"})
		return
	}

	productIDStr := c.Param("id")
	_, err := strconv.ParseUint(productIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid product ID"})
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

	// Generate unique R2 key
	s3Key := fmt.Sprintf("attachments/%s/%s_%s%s",
		productIDStr, uuid.New().String()[:8], time.Now().Format("20060102"), ext)

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

// ── Confirm Upload (after frontend uploads to S3) ──
func (h *AttachmentHandler) ConfirmUpload(c *gin.Context) {
	productIDStr := c.Param("id")
	productID, err := strconv.ParseUint(productIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid product ID"})
		return
	}

	var req struct {
		S3Key    string `json:"s3_key" binding:"required"`
		FileName string `json:"file_name" binding:"required"`
		FileSize int64  `json:"file_size"`
		FileType string `json:"file_type"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request: s3_key and file_name required"})
		return
	}

	userID := c.GetUint("user_id")
	userName, _ := c.Get("user_name")

	attachment := &models.Attachment{
		ProductID:  uint(productID),
		FilePath:   req.S3Key, // R2 key stored as file_path
		FileName:   req.FileName,
		FileType:   req.FileType,
		FileSize:   req.FileSize,
		UploadedBy: userID,
		UploadedAt: time.Now(),
	}

	if err := services.CreateAttachment(attachment); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save attachment record"})
		return
	}

	services.CreateActivityLog(&models.ActivityLog{
		UserID:   userID,
		Action:   "uploaded",
		Entity:   "attachment",
		EntityID: attachment.ID,
		Details:  fmt.Sprintf("Uploaded %s to product %s (R2)", req.FileName, productIDStr),
	})

	message := fmt.Sprintf("%s uploaded '%s'", userName, req.FileName)
	services.CreateNotificationForAllExcept(userID, message, "attachment_uploaded")

	wsMsg, _ := json.Marshal(WSMessage{Type: "attachment_uploaded", Payload: attachment})
	Hub.BroadcastMessage(wsMsg)

	c.JSON(http.StatusCreated, attachment)
}

// ── Upload (local disk mode — also works as fallback) ──
func (h *AttachmentHandler) Upload(c *gin.Context) {
	productIDStr := c.Param("id")
	productID, err := strconv.ParseUint(productIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid product ID"})
		return
	}

	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No file provided"})
		return
	}

	if file.Size > 10*1024*1024 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "File too large (max 10MB)"})
		return
	}

	ext := strings.ToLower(filepath.Ext(file.Filename))
	if !allowedExtensions[ext] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "File type not allowed"})
		return
	}

	// Create upload directory
	uploadDir := filepath.Join(h.Config.UploadDir, productIDStr)
	if err := os.MkdirAll(uploadDir, 0755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create upload directory"})
		return
	}

	filename := fmt.Sprintf("%s_%s%s", uuid.New().String()[:8], time.Now().Format("20060102"), ext)
	filePath := filepath.Join(uploadDir, filename)

	if err := c.SaveUploadedFile(file, filePath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save file"})
		return
	}

	userID := c.GetUint("user_id")
	userName, _ := c.Get("user_name")

	attachment := &models.Attachment{
		ProductID:  uint(productID),
		FilePath:   filePath,
		FileName:   file.Filename,
		FileType:   ext,
		FileSize:   file.Size,
		UploadedBy: userID,
		UploadedAt: time.Now(),
	}

	if err := services.CreateAttachment(attachment); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save attachment record"})
		return
	}

	services.CreateActivityLog(&models.ActivityLog{
		UserID:   userID,
		Action:   "uploaded",
		Entity:   "attachment",
		EntityID: attachment.ID,
		Details:  fmt.Sprintf("Uploaded %s to product %s", file.Filename, productIDStr),
	})

	message := fmt.Sprintf("%s uploaded '%s'", userName, file.Filename)
	services.CreateNotificationForAllExcept(userID, message, "attachment_uploaded")

	wsMsg, _ := json.Marshal(WSMessage{Type: "attachment_uploaded", Payload: attachment})
	Hub.BroadcastMessage(wsMsg)

	c.JSON(http.StatusCreated, attachment)
}

// ── Get By Product ──
func (h *AttachmentHandler) GetByProduct(c *gin.Context) {
	productID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid product ID"})
		return
	}

	attachments, err := services.GetAttachmentsByProduct(uint(productID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch attachments"})
		return
	}

	// If S3 is enabled, add presigned view URLs for image previews
	if services.R2.IsEnabled() {
		type attachmentWithURL struct {
			models.Attachment
			ViewURL string `json:"view_url,omitempty"`
		}

		result := make([]attachmentWithURL, len(attachments))
		for i, att := range attachments {
			result[i] = attachmentWithURL{Attachment: att}
			if isImageExtension(att.FileType) {
				if url, err := services.R2.GenerateViewURL(att.FilePath); err == nil {
					result[i].ViewURL = url
				}
			}
		}
		c.JSON(http.StatusOK, result)
		return
	}

	c.JSON(http.StatusOK, attachments)
}

// ── Download ──
func (h *AttachmentHandler) Download(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid attachment ID"})
		return
	}

	attachment, err := services.GetAttachmentByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Attachment not found"})
		return
	}

	// R2 mode: redirect to presigned download URL
	if services.R2.IsEnabled() && strings.HasPrefix(attachment.FilePath, "attachments/") {
		downloadURL, err := services.R2.GenerateDownloadURL(attachment.FilePath, attachment.FileName)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate download URL"})
			return
		}
		c.Redirect(http.StatusTemporaryRedirect, downloadURL)
		return
	}

	// Local mode: serve file directly
	c.FileAttachment(attachment.FilePath, attachment.FileName)
}

// ── Delete ──
func (h *AttachmentHandler) Delete(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid attachment ID"})
		return
	}

	attachment, err := services.GetAttachmentByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Attachment not found"})
		return
	}

	// Delete from storage
	if services.R2.IsEnabled() && strings.HasPrefix(attachment.FilePath, "attachments/") {
		if err := services.R2.DeleteObject(attachment.FilePath); err != nil {
			// Log but don't fail — DB record removal is more important
			fmt.Printf("Warning: failed to delete R2 object %s: %v\n", attachment.FilePath, err)
		}
	} else {
		os.Remove(attachment.FilePath)
	}

	if err := services.DeleteAttachment(uint(id)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete attachment"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Attachment deleted"})
}

func isImageExtension(ext string) bool {
	switch ext {
	case ".jpg", ".jpeg", ".png", ".gif", ".webp":
		return true
	}
	return false
}
