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
	roleID := uint(3)
	if len(existingUsers) == 0 {
		roleID = 1
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
	token, err := h.generateToken(user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"token": token,
		"user":  user.ToResponse(),
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

	token, err := h.generateToken(user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token": token,
		"user":  user.ToResponse(),
	})
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

func (h *AuthHandler) generateToken(user *models.User) (string, error) {
	claims := jwt.MapClaims{
		"user_id": user.ID,
		"email":   user.Email,
		"name":    user.Name,
		"role_id": user.RoleID,
		"role":    user.Role.Name,
		"exp":     time.Now().Add(72 * time.Hour).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(h.Config.JWTSecret))
}

// NotifyStatusChange broadcasts a product_update WS event and persists toast notifications
// for all users except the mover — all delivered via LISTEN/NOTIFY (multi-instance safe).
func NotifyStatusChange(userID uint, userName string, product *models.Product, oldStatus, newStatus string) {
	message := fmt.Sprintf("%s moved '%s' from %s to %s", userName, product.ProductID, oldStatus, newStatus)

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

	services.CreateNotificationForAllExcept(userID, message, "status_change", "product", product.ID, "", userName)
}
