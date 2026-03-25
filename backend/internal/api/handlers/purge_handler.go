package handlers

import (
	"net/http"
	"strconv"

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

func (h *PurgeHandler) PreviewJob(c *gin.Context) {
	job := c.Param("job")
	validJobs := map[string]bool{
		"trash": true, "notification": true, "activity_log": true, "chat_message": true,
	}
	if !validJobs[job] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Unknown job name"})
		return
	}
	rows, err := services.PreviewEligible(job)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if rows == nil {
		rows = []services.EligibleRow{}
	}
	c.JSON(http.StatusOK, rows)
}

func (h *PurgeHandler) GetRows(c *gin.Context) {
	job := c.Param("job")
	validJobs := map[string]bool{
		"trash": true, "notification": true, "activity_log": true, "chat_message": true,
	}
	if !validJobs[job] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Unknown job name"})
		return
	}
	limit := 25
	if l, err := strconv.Atoi(c.Query("limit")); err == nil && l > 0 {
		limit = l
	}
	var cursor uint
	if cur, err := strconv.ParseUint(c.Query("cursor"), 10, 64); err == nil {
		cursor = uint(cur)
	}
	page, err := services.GetAllRows(job, limit, cursor)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if page.Data == nil {
		page.Data = []services.EligibleRow{}
	}
	c.JSON(http.StatusOK, page)
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

	force := c.Query("force") == "true"
	count, err := services.TriggerPurge(job, force)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"rows_deleted": count})
}
