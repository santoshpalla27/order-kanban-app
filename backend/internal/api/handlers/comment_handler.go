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

	services.CreateActivityLog(&models.ActivityLog{
		UserID:   userID,
		Action:   "commented",
		Entity:   "comment",
		EntityID: uint(productID),
		Details:  "Added comment on product",
	})

	product, _ := services.GetProductByIDSimple(uint(productID))
	productLabel := fmt.Sprintf("#%d", productID)
	if product != nil {
		productLabel = product.ProductID
	}

	senderName := userName.(string)
	message := fmt.Sprintf("%s commented on %s", senderName, productLabel)

	// Mention notifications first — returns IDs of users who will receive a mention toast
	mentionMsg := fmt.Sprintf("%s mentioned you in %s", senderName, productLabel)
	mentionedIDs := services.NotifyMentions(userID, req.Message, mentionMsg, "product", uint(productID), req.Message, senderName)

	// General "commented" notification for all other users, excluding sender and already-mentioned users
	// so mentioned users don't receive two toasts for the same comment.
	services.CreateNotificationForAllExcept(userID, mentionedIDs, message, "comment_added", "product", uint(productID), req.Message, senderName)

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

	if err := services.UpdateComment(uint(id), req.Message); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update comment"})
		return
	}

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
	if comment.UserID != userID && role.(string) != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Can only delete your own comments"})
		return
	}

	if err := services.DeleteComment(uint(id)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete comment"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Comment deleted"})
}
