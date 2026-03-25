package handlers

import (
	"net/http"

	"kanban-app/internal/services"

	"github.com/gin-gonic/gin"
)

type PurgeHandler struct{}

func NewPurgeHandler() *PurgeHandler {
	return &PurgeHandler{}
}

func (h *PurgeHandler) GetStatus(c *gin.Context) {
	status, err := services.GetPurgeStatus()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch purge status"})
		return
	}
	c.JSON(http.StatusOK, status)
}

func (h *PurgeHandler) RunJob(c *gin.Context) {
	job := c.Param("job")

	validJobs := map[string]bool{
		"trash": true, "notification": true, "activity_log": true, "chat_message": true,
	}
	if !validJobs[job] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Unknown job name"})
		return
	}

	count, err := services.TriggerPurge(job)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"rows_deleted": count})
}
