package models

import "time"

type PurgeLog struct {
	ID          uint      `json:"id" gorm:"primaryKey"`
	JobName     string    `json:"job_name"`
	RowsDeleted int64     `json:"rows_deleted"`
	RanAt       time.Time `json:"ran_at"`
	Status      string    `json:"status"` // "ok" | "failed"
	ErrorMsg    string    `json:"error_msg"`
}
