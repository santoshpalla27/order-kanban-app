package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
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
	".jpg": true, ".jpeg": true, ".png": true, ".gif": true,
	".pdf": true, ".docx": true, ".doc": true, ".xlsx": true,
	".txt": true, ".csv": true, ".zip": true,
}

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

	// Validate file size (max 10MB)
	if file.Size > 10*1024*1024 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "File too large (max 10MB)"})
		return
	}

	ext := filepath.Ext(file.Filename)
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

	// Generate unique filename
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

	wsMsg, _ := json.Marshal(WSMessage{
		Type:    "attachment_uploaded",
		Payload: attachment,
	})
	Hub.BroadcastMessage(wsMsg)

	c.JSON(http.StatusCreated, attachment)
}

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

	c.JSON(http.StatusOK, attachments)
}

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

	c.FileAttachment(attachment.FilePath, attachment.FileName)
}

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

	os.Remove(attachment.FilePath)

	if err := services.DeleteAttachment(uint(id)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete attachment"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Attachment deleted"})
}
