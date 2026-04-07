package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"kanban-app/config"
	"kanban-app/database"
	"kanban-app/internal/models"
	"kanban-app/internal/services"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

type AuthHandler struct {
	Config *config.Config
}

func NewAuthHandler(cfg *config.Config) *AuthHandler {
	return &AuthHandler{Config: cfg}
}

func (h *AuthHandler) Register(c *gin.Context) {
	var req models.RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to hash password"})
		return
	}

	existingUsers, _ := services.GetUsers()
	roleID := uint(6) // pending — admin approves from the admin panel
	if len(existingUsers) == 0 {
		roleID = 1 // first user becomes admin
	}

	user := &models.User{
		Name:     req.Name,
		Email:    req.Email,
		Password: string(hashedPassword),
		RoleID:   roleID,
	}

	if err := services.CreateUser(user); err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "Email already exists"})
		return
	}

	user, _ = services.GetUserByID(user.ID)
	accessToken, refreshToken, err := h.generateTokenPair(user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate tokens"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"access_token":  accessToken,
		"refresh_token": refreshToken,
		"token":         accessToken, // backward-compat alias consumed by existing frontend
		"user":          user.ToResponse(),
	})
}

func (h *AuthHandler) Login(c *gin.Context) {
	var req models.LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	user, err := services.GetUserByEmail(req.Email)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
		return
	}

	accessToken, refreshToken, err := h.generateTokenPair(user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate tokens"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"access_token":  accessToken,
		"refresh_token": refreshToken,
		"token":         accessToken,
		"user":          user.ToResponse(),
	})
}

// Refresh validates a refresh token, revokes it (rotation), and issues a new pair.
func (h *AuthHandler) Refresh(c *gin.Context) {
	var req struct {
		RefreshToken string `json:"refresh_token" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "refresh_token required"})
		return
	}

	rt, err := services.ValidateRefreshToken(req.RefreshToken)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid or expired refresh token"})
		return
	}

	user, err := services.GetUserByID(rt.UserID)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not found"})
		return
	}

	// Revoke old token before issuing new pair (rotation prevents replay attacks)
	if err := services.RevokeRefreshToken(req.RefreshToken); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to rotate token"})
		return
	}

	accessToken, newRefreshToken, err := h.generateTokenPair(user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate tokens"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"access_token":  accessToken,
		"refresh_token": newRefreshToken,
		"token":         accessToken,
	})
}

// Logout revokes the provided refresh token, ending this device's session.
func (h *AuthHandler) Logout(c *gin.Context) {
	var req struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := c.ShouldBindJSON(&req); err == nil && req.RefreshToken != "" {
		_ = services.RevokeRefreshToken(req.RefreshToken)
	}
	c.JSON(http.StatusOK, gin.H{"message": "Logged out"})
}

func (h *AuthHandler) GetMe(c *gin.Context) {
	userID := c.GetUint("user_id")
	user, err := services.GetUserByID(userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}
	c.JSON(http.StatusOK, services.GetUserResponseWithAvatar(user))
}

// generateTokenPair issues a short-lived access token (15 min) and a long-lived
// refresh token (30 days, stored in DB). Returns (accessToken, refreshToken, error).
func (h *AuthHandler) generateTokenPair(user *models.User) (string, string, error) {
	claims := jwt.MapClaims{
		"user_id": user.ID,
		"email":   user.Email,
		"name":    user.Name,
		"role_id": user.RoleID,
		"role":    user.Role.Name,
		"exp":     time.Now().Add(15 * time.Minute).Unix(),
	}
	accessToken, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(h.Config.JWTSecret))
	if err != nil {
		return "", "", err
	}

	refreshToken, err := services.IssueRefreshToken(user.ID)
	if err != nil {
		return "", "", err
	}

	return accessToken, refreshToken, nil
}

// NotifyStatusChange broadcasts a product_update WS event so all clients refresh their board,
// and creates a persistent notification for all other users so it appears in the bell panel.
func NotifyStatusChange(userID uint, userName string, product *models.Product, oldStatus, newStatus string) {
	wsMsg, _ := json.Marshal(WSMessage{
		Type: "product_update",
		Payload: gin.H{
			"product_id": product.ID,
			"product":    product,
			"old_status": oldStatus,
			"new_status": newStatus,
			"updated_by": userName,
		},
	})
	database.EmitBroadcast(wsMsg)

	message := fmt.Sprintf("%s moved order %s from %s to %s", userName, product.ProductID, formatStatus(oldStatus), formatStatus(newStatus))
	services.CreateNotificationForAllExcept(userID, nil, message, "status_change", "product", product.ID, "", userName)
}
