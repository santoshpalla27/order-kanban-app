package models

import "time"

type Attachment struct {
	ID         uint      `json:"id" gorm:"primaryKey"`
	ProductID  uint      `json:"product_id" gorm:"not null;index"`
	FilePath   string    `json:"file_path" gorm:"not null"`
	FileName   string    `json:"file_name" gorm:"not null"`
	FileType   string    `json:"file_type"`
	FileSize   int64     `json:"file_size"`
	UploadedBy uint      `json:"uploaded_by" gorm:"not null"`
	Uploader   User      `json:"uploader" gorm:"foreignKey:UploadedBy"`
	UploadedAt time.Time `json:"uploaded_at"`
}
