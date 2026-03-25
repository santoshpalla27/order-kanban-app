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

// PurgeInsightItem holds live data counts for one job's table.
type PurgeInsightItem struct {
	JobName          string  `json:"job_name"`
	TotalRows        int64   `json:"total_rows"`         // all rows currently in table
	EligibleRows     int64   `json:"eligible_rows"`      // past retention, deleted on next run
	InGracePeriod    int64   `json:"in_grace_period"`    // trash only: within 10-day window
	OldestAgeDays    float64 `json:"oldest_age_days"`    // age of oldest record in days (0 if empty)
	NewestAgeDays    float64 `json:"newest_age_days"`    // age of newest record in days (0 if empty)
	RetentionDays    int     `json:"retention_days"`
}

// PurgeStatusResponse is returned by the API.
type PurgeStatusResponse struct {
	Summary  []PurgeSummaryItem `json:"summary"`
	History  []models.PurgeLog  `json:"history"`
	Insights []PurgeInsightItem `json:"insights"`
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

// GetPurgeInsights queries live row counts and age data for each job's table.
func GetPurgeInsights() []PurgeInsightItem {
	now := time.Now()

	type minMax struct {
		MinCreated *time.Time
		MaxCreated *time.Time
	}

	ageDays := func(t *time.Time) float64 {
		if t == nil {
			return 0
		}
		return now.Sub(*t).Hours() / 24
	}

	var items []PurgeInsightItem

	// ── Notifications (5-day retention) ──────────────────────────────────────
	{
		const days = 5
		cutoff := now.AddDate(0, 0, -days)
		var total, eligible int64
		database.DB.Model(&models.Notification{}).Count(&total)
		database.DB.Model(&models.Notification{}).Where("created_at < ?", cutoff).Count(&eligible)
		var mm minMax
		database.DB.Model(&models.Notification{}).
			Select("MIN(created_at) as min_created, MAX(created_at) as max_created").
			Scan(&mm)
		items = append(items, PurgeInsightItem{
			JobName:       "notification",
			TotalRows:     total,
			EligibleRows:  eligible,
			OldestAgeDays: ageDays(mm.MinCreated),
			NewestAgeDays: ageDays(mm.MaxCreated),
			RetentionDays: days,
		})
	}

	// ── Activity logs (10-day retention) ─────────────────────────────────────
	{
		const days = 10
		cutoff := now.AddDate(0, 0, -days)
		var total, eligible int64
		database.DB.Model(&models.ActivityLog{}).Count(&total)
		database.DB.Model(&models.ActivityLog{}).Where("created_at < ?", cutoff).Count(&eligible)
		var mm minMax
		database.DB.Model(&models.ActivityLog{}).
			Select("MIN(created_at) as min_created, MAX(created_at) as max_created").
			Scan(&mm)
		items = append(items, PurgeInsightItem{
			JobName:       "activity_log",
			TotalRows:     total,
			EligibleRows:  eligible,
			OldestAgeDays: ageDays(mm.MinCreated),
			NewestAgeDays: ageDays(mm.MaxCreated),
			RetentionDays: days,
		})
	}

	// ── Chat messages (30-day retention) ─────────────────────────────────────
	{
		const days = 30
		cutoff := now.AddDate(0, 0, -days)
		var total, eligible int64
		database.DB.Model(&models.ChatMessage{}).Count(&total)
		database.DB.Model(&models.ChatMessage{}).Where("created_at < ?", cutoff).Count(&eligible)
		var mm minMax
		database.DB.Model(&models.ChatMessage{}).
			Select("MIN(created_at) as min_created, MAX(created_at) as max_created").
			Scan(&mm)
		items = append(items, PurgeInsightItem{
			JobName:       "chat_message",
			TotalRows:     total,
			EligibleRows:  eligible,
			OldestAgeDays: ageDays(mm.MinCreated),
			NewestAgeDays: ageDays(mm.MaxCreated),
			RetentionDays: days,
		})
	}

	// ── Trash (10-day grace period) ───────────────────────────────────────────
	{
		const graceDays = gracePeriodDays
		graceCutoff := now.AddDate(0, 0, -graceDays)
		var inGrace, eligible int64
		database.DB.Unscoped().Model(&models.Product{}).
			Where("deleted_at IS NOT NULL AND deleted_at > ?", graceCutoff).Count(&inGrace)
		database.DB.Unscoped().Model(&models.Product{}).
			Where("deleted_at IS NOT NULL AND deleted_at < ?", graceCutoff).Count(&eligible)
		total := inGrace + eligible

		var mm minMax
		database.DB.Unscoped().Model(&models.Product{}).
			Where("deleted_at IS NOT NULL").
			Select("MIN(deleted_at) as min_created, MAX(deleted_at) as max_created").
			Scan(&mm)
		items = append(items, PurgeInsightItem{
			JobName:       "trash",
			TotalRows:     total,
			EligibleRows:  eligible,
			InGracePeriod: inGrace,
			OldestAgeDays: ageDays(mm.MinCreated),
			NewestAgeDays: ageDays(mm.MaxCreated),
			RetentionDays: graceDays,
		})
	}

	return items
}

// EligibleRow is a generic row shown in the purge countdown UI.
type EligibleRow struct {
	ID         uint   `json:"id"`
	Label      string `json:"label"`       // human-readable identifier
	Detail     string `json:"detail"`      // secondary info (type, entity, etc.)
	CreatedAt  string `json:"created_at"`  // ISO string (deleted_at for trash)
	PurgesAt   string `json:"purges_at"`   // when this row will be purged
	IsEligible bool   `json:"is_eligible"` // already past retention window
}

// PreviewEligible returns up to 50 rows that would be deleted on the next run.
func PreviewEligible(jobName string) ([]EligibleRow, error) {
	now := time.Now()
	var rows []EligibleRow

	switch jobName {
	case "notification":
		cutoff := now.AddDate(0, 0, -5)
		var notifs []models.Notification
		if err := database.DB.Where("created_at < ?", cutoff).Order("created_at ASC").Limit(50).Find(&notifs).Error; err != nil {
			return nil, err
		}
		for _, n := range notifs {
			rows = append(rows, EligibleRow{
				ID:        n.ID,
				Label:     n.Message,
				Detail:    n.Type,
				CreatedAt: n.CreatedAt.Format(time.RFC3339),
			})
		}

	case "activity_log":
		cutoff := now.AddDate(0, 0, -10)
		var logs []models.ActivityLog
		if err := database.DB.Where("created_at < ?", cutoff).Order("created_at ASC").Limit(50).Find(&logs).Error; err != nil {
			return nil, err
		}
		for _, l := range logs {
			rows = append(rows, EligibleRow{
				ID:        l.ID,
				Label:     l.Details,
				Detail:    l.Entity,
				CreatedAt: l.CreatedAt.Format(time.RFC3339),
			})
		}

	case "chat_message":
		cutoff := now.AddDate(0, 0, -30)
		var msgs []models.ChatMessage
		if err := database.DB.Where("created_at < ?", cutoff).Order("created_at ASC").Limit(50).Find(&msgs).Error; err != nil {
			return nil, err
		}
		for _, m := range msgs {
			rows = append(rows, EligibleRow{
				ID:        m.ID,
				Label:     m.Message,
				Detail:    "chat",
				CreatedAt: m.CreatedAt.Format(time.RFC3339),
			})
		}

	case "trash":
		graceCutoff := now.AddDate(0, 0, -gracePeriodDays)
		var products []models.Product
		if err := database.DB.Unscoped().
			Where("deleted_at IS NOT NULL AND deleted_at < ?", graceCutoff).
			Order("deleted_at ASC").Limit(50).Find(&products).Error; err != nil {
			return nil, err
		}
		for _, p := range products {
			deletedAt := ""
			if p.DeletedAt.Valid {
				deletedAt = p.DeletedAt.Time.Format(time.RFC3339)
			}
			rows = append(rows, EligibleRow{
				ID:        p.ID,
				Label:     p.ProductID + " — " + p.CustomerName,
				Detail:    p.Status,
				CreatedAt: deletedAt,
			})
		}
	}

	return rows, nil
}

// PurgeRowsPage is the paginated response for GetAllRows.
type PurgeRowsPage struct {
	Data       []EligibleRow `json:"data"`
	NextCursor *uint         `json:"next_cursor"`
	HasMore    bool          `json:"has_more"`
}

// GetAllRows returns a cursor-paginated page of rows sorted oldest-first with purge countdown info.
// cursor=0 means start from the beginning. limit defaults to 25 if <=0.
func GetAllRows(jobName string, limit int, cursor uint) (PurgeRowsPage, error) {
	if limit <= 0 {
		limit = 25
	}
	fetch := limit + 1 // fetch one extra to detect hasMore
	now := time.Now()
	var rows []EligibleRow

	switch jobName {
	case "notification":
		const days = 5
		var notifs []models.Notification
		q := database.DB.Order("id ASC").Limit(fetch)
		if cursor > 0 {
			q = q.Where("id > ?", cursor)
		}
		if err := q.Find(&notifs).Error; err != nil {
			return PurgeRowsPage{}, err
		}
		for _, n := range notifs {
			purgesAt := n.CreatedAt.AddDate(0, 0, days)
			rows = append(rows, EligibleRow{
				ID:         n.ID,
				Label:      n.Message,
				Detail:     n.Type,
				CreatedAt:  n.CreatedAt.Format(time.RFC3339),
				PurgesAt:   purgesAt.Format(time.RFC3339),
				IsEligible: now.After(purgesAt),
			})
		}

	case "activity_log":
		const days = 10
		var logs []models.ActivityLog
		q := database.DB.Order("id ASC").Limit(fetch)
		if cursor > 0 {
			q = q.Where("id > ?", cursor)
		}
		if err := q.Find(&logs).Error; err != nil {
			return PurgeRowsPage{}, err
		}
		for _, l := range logs {
			purgesAt := l.CreatedAt.AddDate(0, 0, days)
			rows = append(rows, EligibleRow{
				ID:         l.ID,
				Label:      l.Details,
				Detail:     l.Entity,
				CreatedAt:  l.CreatedAt.Format(time.RFC3339),
				PurgesAt:   purgesAt.Format(time.RFC3339),
				IsEligible: now.After(purgesAt),
			})
		}

	case "chat_message":
		const days = 30
		var msgs []models.ChatMessage
		q := database.DB.Order("id ASC").Limit(fetch)
		if cursor > 0 {
			q = q.Where("id > ?", cursor)
		}
		if err := q.Find(&msgs).Error; err != nil {
			return PurgeRowsPage{}, err
		}
		for _, m := range msgs {
			purgesAt := m.CreatedAt.AddDate(0, 0, days)
			rows = append(rows, EligibleRow{
				ID:         m.ID,
				Label:      m.Message,
				Detail:     "chat",
				CreatedAt:  m.CreatedAt.Format(time.RFC3339),
				PurgesAt:   purgesAt.Format(time.RFC3339),
				IsEligible: now.After(purgesAt),
			})
		}

	case "trash":
		const days = gracePeriodDays
		var products []models.Product
		q := database.DB.Unscoped().Where("deleted_at IS NOT NULL").Order("id ASC").Limit(fetch)
		if cursor > 0 {
			q = q.Where("id > ?", cursor)
		}
		if err := q.Find(&products).Error; err != nil {
			return PurgeRowsPage{}, err
		}
		for _, p := range products {
			if !p.DeletedAt.Valid {
				continue
			}
			purgesAt := p.DeletedAt.Time.AddDate(0, 0, days)
			rows = append(rows, EligibleRow{
				ID:         p.ID,
				Label:      p.ProductID + " — " + p.CustomerName,
				Detail:     p.Status,
				CreatedAt:  p.DeletedAt.Time.Format(time.RFC3339),
				PurgesAt:   purgesAt.Format(time.RFC3339),
				IsEligible: now.After(purgesAt),
			})
		}
	}

	hasMore := len(rows) > limit
	if hasMore {
		rows = rows[:limit]
	}
	var nextCursor *uint
	if hasMore {
		last := rows[len(rows)-1].ID
		nextCursor = &last
	}
	return PurgeRowsPage{Data: rows, NextCursor: nextCursor, HasMore: hasMore}, nil
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

	return PurgeStatusResponse{
		Summary:  summary,
		History:  history,
		Insights: GetPurgeInsights(),
	}, err
}

// TriggerPurge runs the named job immediately and records the result.
// Pass force=true to skip retention windows and delete everything now.
func TriggerPurge(jobName string, force bool) (int64, error) {
	var count int64
	var err error

	switch jobName {
	case "trash":
		count, err = PurgeExpiredDeletedProducts(force)
	case "notification":
		days := 5
		if force {
			days = 0
		}
		count, err = PurgeOldNotifications(days)
	case "activity_log":
		days := 10
		if force {
			days = 0
		}
		count, err = PurgeOldActivityLogs(days)
	case "chat_message":
		days := 30
		if force {
			days = 0
		}
		count, err = PurgeOldChatMessages(days)
	}

	RecordPurgeLog(jobName, count, err)
	return count, err
}
