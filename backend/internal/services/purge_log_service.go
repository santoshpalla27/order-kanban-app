package services

import (
	"time"

	"kanban-app/database"
	"kanban-app/internal/models"

	"gorm.io/gorm"
)

// purgeIntervals mirrors the schedule defined in main.go so the UI can show
// when the next run is expected.
var purgeIntervals = map[string]time.Duration{
	"trash":        6 * time.Hour,
	"notification": 24 * time.Hour,
	"activity_log": 24 * time.Hour,
	"chat_message": 24 * time.Hour,
}

// purgeJobOrder defines the display order for the summary.
var purgeJobOrder = []string{"trash", "notification", "activity_log", "chat_message"}

// PurgeSummaryItem holds the latest run info for a single job.
type PurgeSummaryItem struct {
	JobName     string     `json:"job_name"`
	RowsDeleted int64      `json:"rows_deleted"`
	RanAt       *time.Time `json:"ran_at"`
	NextRunAt   *time.Time `json:"next_run_at"`
	Status      string     `json:"status"` // "ok" | "failed" | "never_run"
	ErrorMsg    string     `json:"error_msg"`
}

// PurgeStatusResponse is returned by the API.
type PurgeStatusResponse struct {
	Summary []PurgeSummaryItem `json:"summary"`
	History []models.PurgeLog  `json:"history"`
}

// RecordPurgeLog writes one row to purge_logs after a job completes.
func RecordPurgeLog(jobName string, rowsDeleted int64, runErr error) {
	status := "ok"
	errMsg := ""
	if runErr != nil {
		status = "failed"
		errMsg = runErr.Error()
	}
	database.DB.Create(&models.PurgeLog{
		JobName:     jobName,
		RowsDeleted: rowsDeleted,
		RanAt:       time.Now(),
		Status:      status,
		ErrorMsg:    errMsg,
	})
}

// GetPurgeStatus returns a summary (latest run per job) and the last 20 runs.
func GetPurgeStatus() (PurgeStatusResponse, error) {
	var summary []PurgeSummaryItem
	for _, job := range purgeJobOrder {
		var log models.PurgeLog
		err := database.DB.Where("job_name = ?", job).Order("ran_at DESC").First(&log).Error

		item := PurgeSummaryItem{JobName: job}
		if err == nil {
			item.RowsDeleted = log.RowsDeleted
			item.RanAt = &log.RanAt
			item.Status = log.Status
			item.ErrorMsg = log.ErrorMsg
			if interval, ok := purgeIntervals[job]; ok {
				next := log.RanAt.Add(interval)
				item.NextRunAt = &next
			}
		} else if err == gorm.ErrRecordNotFound {
			item.Status = "never_run"
		} else {
			item.Status = "never_run"
		}
		summary = append(summary, item)
	}

	var history []models.PurgeLog
	err := database.DB.Order("ran_at DESC").Limit(20).Find(&history).Error

	return PurgeStatusResponse{Summary: summary, History: history}, err
}

// TriggerPurge runs the named job immediately and records the result.
func TriggerPurge(jobName string) (int64, error) {
	var count int64
	var err error

	switch jobName {
	case "trash":
		count, err = PurgeExpiredDeletedProducts()
	case "notification":
		count, err = PurgeOldNotifications(5)
	case "activity_log":
		count, err = PurgeOldActivityLogs(10)
	case "chat_message":
		count, err = PurgeOldChatMessages(30)
	}

	RecordPurgeLog(jobName, count, err)
	return count, err
}
