package handlers

import (
	"fmt"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"

	"kanban-app/internal/models"
	"kanban-app/internal/services"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

var allowedAvatarExtensions = map[string]bool{
	".jpg": true, ".jpeg": true, ".png": true, ".gif": true, ".webp": true,
}

var avatarExtToContentType = map[string]string{
	".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
	".gif": "image/gif", ".webp": "image/webp",
}

type UserHandler struct{}

func NewUserHandler() *UserHandler {
	return &UserHandler{}
}

func (h *UserHandler) GetUsers(c *gin.Context) {
	users, err := services.GetUsers()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch users"})
		return
	}

	var responses []models.UserResponse
	for _, u := range users {
		responses = append(responses, u.ToResponse())
	}

	c.JSON(http.StatusOK, responses)
}

func (h *UserHandler) CreateUser(c *gin.Context) {
	var req models.CreateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to hash password"})
		return
	}

	user := &models.User{
		Name:     req.Name,
		Email:    req.Email,
		Password: string(hashedPassword),
		RoleID:   req.RoleID,
	}

	if err := services.CreateUser(user); err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "Email already exists"})
		return
	}

	user, _ = services.GetUserByID(user.ID)
	adminID := c.GetUint("user_id")
	services.CreateActivityLog(&models.ActivityLog{
		UserID:   adminID,
		Action:   "created",
		Entity:   "user",
		EntityID: user.ID,
		Details:  fmt.Sprintf("Created user %s (%s)", user.Name, user.Email),
	})
	c.JSON(http.StatusCreated, user.ToResponse())
}

func (h *UserHandler) UpdateRole(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	var req models.UpdateUserRoleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := services.UpdateUserRole(uint(id), req.RoleID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update role"})
		return
	}

	user, _ := services.GetUserByID(uint(id))
	adminID := c.GetUint("user_id")
	services.CreateActivityLog(&models.ActivityLog{
		UserID:   adminID,
		Action:   "role_changed",
		Entity:   "user",
		EntityID: user.ID,
		Details:  fmt.Sprintf("Changed role of %s to %s", user.Name, user.Role.Name),
	})
	c.JSON(http.StatusOK, user.ToResponse())
}

func (h *UserHandler) DeleteUser(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	// Prevent self-deletion
	currentUserID := c.GetUint("user_id")
	if uint(id) == currentUserID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot delete your own account"})
		return
	}

	targetUser, _ := services.GetUserByID(uint(id))
	if err := services.DeleteUser(uint(id)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete user"})
		return
	}

	adminID2 := c.GetUint("user_id")
	userDesc := fmt.Sprintf("%d", id)
	if targetUser != nil {
		userDesc = fmt.Sprintf("%s (%s)", targetUser.Name, targetUser.Email)
	}
	services.CreateActivityLog(&models.ActivityLog{
		UserID:   adminID2,
		Action:   "deleted",
		Entity:   "user",
		EntityID: uint(id),
		Details:  fmt.Sprintf("Deleted user %s", userDesc),
	})
	c.JSON(http.StatusOK, gin.H{"message": "User deleted"})
}

// GetAvatarUploadURL returns a presigned PUT URL so the client can upload an avatar directly to R2.
func (h *UserHandler) GetAvatarUploadURL(c *gin.Context) {
	filename := c.Query("filename")
	if filename == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "filename query param required"})
		return
	}

	ext := strings.ToLower(filepath.Ext(filename))
	if !allowedAvatarExtensions[ext] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Only image files (jpg, png, gif, webp) are allowed"})
		return
	}

	userID := c.GetUint("user_id")
	s3Key := fmt.Sprintf("avatars/%d/%s%s", userID, uuid.New().String()[:8], ext)
	contentType := avatarExtToContentType[ext]

	uploadURL, err := services.R2.GenerateUploadURL(s3Key, contentType, 5*1024*1024)
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

// UpdateProfile lets any authenticated user update their own name and/or avatar.
func (h *UserHandler) UpdateProfile(c *gin.Context) {
	userID := c.GetUint("user_id")

	var req struct {
		Name      string `json:"name"`
		AvatarKey string `json:"avatar_key"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := services.UpdateProfile(userID, req.Name, req.AvatarKey); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update profile"})
		return
	}

	user, err := services.GetUserByID(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch updated user"})
		return
	}

	c.JSON(http.StatusOK, services.GetUserResponseWithAvatar(user))
}
