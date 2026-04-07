package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"kanban-app/database"
	"kanban-app/internal/models"
	"kanban-app/internal/services"

	"github.com/gin-gonic/gin"
)

type CommentHandler struct{}

func NewCommentHandler() *CommentHandler {
	return &CommentHandler{}
}

func (h *CommentHandler) GetByProduct(c *gin.Context) {
	productID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid product ID"})
		return
	}

	comments, err := services.GetCommentsByProduct(uint(productID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch comments"})
		return
	}

	c.JSON(http.StatusOK, comments)
}

func (h *CommentHandler) Create(c *gin.Context) {
	productID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid product ID"})
		return
	}

	var req models.CreateCommentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if len([]rune(req.Message)) > 4000 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Message exceeds 4000 character limit"})
		return
	}

	userID := c.GetUint("user_id")
	userName, _ := c.Get("user_name")

	comment := &models.Comment{
		ProductID: uint(productID),
		UserID:    userID,
		Message:   req.Message,
	}

	if err := services.CreateComment(comment); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create comment"})
		return
	}

	// Reload with user info
	comments, _ := services.GetCommentsByProduct(uint(productID))
	var created *models.Comment
	for i := len(comments) - 1; i >= 0; i-- {
		if comments[i].ID == comment.ID {
			created = &comments[i]
			break
		}
	}

	product, _ := services.GetProductByIDSimple(uint(productID))
	productLabel := fmt.Sprintf("#%d", productID)
	if product != nil {
		productLabel = product.ProductID
	}

	services.CreateActivityLog(&models.ActivityLog{
		UserID:   userID,
		Action:   "commented",
		Entity:   "comment",
		EntityID: uint(productID),
		Details:  fmt.Sprintf("Commented on order %s", productLabel),
	})

	senderName := userName.(string)
	message := fmt.Sprintf("%s commented on order %s", senderName, productLabel)

	// Attachment comments (contain "[attachment:") already triggered an attachment_uploaded
	// notification when the file was saved — skip the comment_added one to avoid duplicates.
	isAttachmentComment := strings.HasPrefix(req.Message, "📎 Uploaded: ") && strings.Contains(req.Message, "[attachment:")

	// Mention notifications first — returns IDs of users who will receive a mention toast.
	mentionMsg := fmt.Sprintf("%s mentioned you in order %s", senderName, productLabel)
	mentionedIDs := services.NotifyMentions(userID, req.Message, mentionMsg, "product", uint(productID), req.Message, senderName)

	// If the message contains @mentions, only the mentioned users are notified.
	// If there are no @mentions and it's not an attachment comment, notify everyone.
	if len(mentionedIDs) == 0 && !isAttachmentComment {
		services.CreateNotificationForAllExcept(userID, nil, message, "comment_added", "product", uint(productID), req.Message, senderName)
	}

	// Broadcast UI update event (comment panel refresh) via LISTEN/NOTIFY
	wsMsg, _ := json.Marshal(WSMessage{
		Type: "comment_added",
		Payload: gin.H{
			"product_id": productID,
			"comment":    created,
		},
	})
	database.EmitBroadcast(wsMsg)

	if created != nil {
		c.JSON(http.StatusCreated, created)
	} else {
		c.JSON(http.StatusCreated, comment)
	}
}

func (h *CommentHandler) Update(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid comment ID"})
		return
	}

	comment, err := services.GetCommentByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Comment not found"})
		return
	}

	userID := c.GetUint("user_id")
	if comment.UserID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Can only edit your own comments"})
		return
	}

	var req models.UpdateCommentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if len([]rune(req.Message)) > 4000 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Message exceeds 4000 character limit"})
		return
	}

	if err := services.UpdateComment(uint(id), req.Message); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update comment"})
		return
	}

	services.CreateActivityLog(&models.ActivityLog{
		UserID:   userID,
		Action:   "edited",
		Entity:   "comment",
		EntityID: comment.ProductID,
		Details:  fmt.Sprintf("Edited a comment on product #%d", comment.ProductID),
	})

	c.JSON(http.StatusOK, gin.H{"message": "Comment updated"})
}

func (h *CommentHandler) Delete(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid comment ID"})
		return
	}

	comment, err := services.GetCommentByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Comment not found"})
		return
	}

	userID := c.GetUint("user_id")
	role, _ := c.Get("role")
	roleName := role.(string)
	if comment.UserID != userID && roleName != "admin" && roleName != "manager" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Can only delete your own comments"})
		return
	}

	if err := services.DeleteComment(uint(id)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete comment"})
		return
	}

	services.CreateActivityLog(&models.ActivityLog{
		UserID:   userID,
		Action:   "deleted",
		Entity:   "comment",
		EntityID: comment.ProductID,
		Details:  fmt.Sprintf("Deleted a comment on product #%d", comment.ProductID),
	})

	c.JSON(http.StatusOK, gin.H{"message": "Comment deleted"})
}
