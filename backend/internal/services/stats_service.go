package services

import (
	"time"

	"kanban-app/database"
)

type StatusBreakdown struct {
	YetToStart int64 `json:"yet_to_start"`
	Working    int64 `json:"working"`
	Review     int64 `json:"review"`
	Done       int64 `json:"done"`
}

type PeriodCounts struct {
	Today int64 `json:"today"`
	Week  int64 `json:"week"`
	Month int64 `json:"month"`
}

type UserStat struct {
	UserID     uint    `json:"user_id"`
	UserName   string  `json:"user_name"`
	Assigned   int64   `json:"assigned"`
	YetToStart int64   `json:"yet_to_start"`
	Working    int64   `json:"working"`
	Review     int64   `json:"review"`
	Done       int64   `json:"done"`
	DoneRate   float64 `json:"done_rate"`
}

type StatsResponse struct {
	TotalActive     int64           `json:"total_active"`
	StatusBreakdown StatusBreakdown `json:"status_breakdown"`
	Created         PeriodCounts    `json:"created"`
	Completed       PeriodCounts    `json:"completed"`
	Overdue         int64           `json:"overdue"`
	DueSoon         int64           `json:"due_soon"`
	UserStats       []UserStat      `json:"user_stats"`
}

func GetStats() (*StatsResponse, error) {
	now := time.Now().UTC()
	startOfDay := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	startOfWeek := startOfDay.AddDate(0, 0, -int(now.Weekday()))
	startOfMonth := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	sevenDaysLater := now.Add(7 * 24 * time.Hour)

	db := database.DB

	// ── Total active ────────────────────────────────────────────────────────
	var totalActive int64
	if err := db.Table("products").
		Where("deleted_at IS NULL").
		Count(&totalActive).Error; err != nil {
		return nil, err
	}

	// ── Status breakdown ────────────────────────────────────────────────────
	type statusCount struct {
		Status string
		Count  int64
	}
	var statusCounts []statusCount
	if err := db.Table("products").
		Select("status, COUNT(*) as count").
		Where("deleted_at IS NULL").
		Group("status").
		Scan(&statusCounts).Error; err != nil {
		return nil, err
	}
	breakdown := StatusBreakdown{}
	for _, s := range statusCounts {
		switch s.Status {
		case "yet_to_start":
			breakdown.YetToStart = s.Count
		case "working":
			breakdown.Working = s.Count
		case "review":
			breakdown.Review = s.Count
		case "done":
			breakdown.Done = s.Count
		}
	}

	// ── Created counts ──────────────────────────────────────────────────────
	countCreated := func(since time.Time) (int64, error) {
		var n int64
		err := db.Table("products").
			Where("deleted_at IS NULL AND created_at >= ?", since).
			Count(&n).Error
		return n, err
	}
	createdToday, err := countCreated(startOfDay)
	if err != nil {
		return nil, err
	}
	createdWeek, err := countCreated(startOfWeek)
	if err != nil {
		return nil, err
	}
	createdMonth, err := countCreated(startOfMonth)
	if err != nil {
		return nil, err
	}

	// ── Completed counts (status=done, approximated by updated_at) ──────────
	countCompleted := func(since time.Time) (int64, error) {
		var n int64
		err := db.Table("products").
			Where("deleted_at IS NULL AND status = 'done' AND updated_at >= ?", since).
			Count(&n).Error
		return n, err
	}
	completedToday, err := countCompleted(startOfDay)
	if err != nil {
		return nil, err
	}
	completedWeek, err := countCompleted(startOfWeek)
	if err != nil {
		return nil, err
	}
	completedMonth, err := countCompleted(startOfMonth)
	if err != nil {
		return nil, err
	}

	// ── Overdue ─────────────────────────────────────────────────────────────
	var overdue int64
	if err := db.Table("products").
		Where("deleted_at IS NULL AND delivery_at < ? AND status != 'done'", now).
		Count(&overdue).Error; err != nil {
		return nil, err
	}

	// ── Due soon (next 7 days, not done) ────────────────────────────────────
	var dueSoon int64
	if err := db.Table("products").
		Where("deleted_at IS NULL AND delivery_at BETWEEN ? AND ? AND status != 'done'", now, sevenDaysLater).
		Count(&dueSoon).Error; err != nil {
		return nil, err
	}

	// ── Per-user stats ──────────────────────────────────────────────────────
	type userRow struct {
		UserID   uint
		UserName string
		Status   string
		Count    int64
	}
	var userRows []userRow
	if err := db.Table("products").
		Select("product_assignees.user_id, users.name as user_name, products.status, COUNT(*) as count").
		Joins("JOIN product_assignees ON product_assignees.product_id = products.id").
		Joins("JOIN users ON users.id = product_assignees.user_id").
		Where("products.deleted_at IS NULL").
		Group("product_assignees.user_id, users.name, products.status").
		Scan(&userRows).Error; err != nil {
		return nil, err
	}

	// Aggregate per user
	type userAgg struct {
		UserID     uint
		UserName   string
		YetToStart int64
		Working    int64
		Review     int64
		Done       int64
	}
	userMap := map[uint]*userAgg{}
	for _, row := range userRows {
		agg, ok := userMap[row.UserID]
		if !ok {
			agg = &userAgg{UserID: row.UserID, UserName: row.UserName}
			userMap[row.UserID] = agg
		}
		switch row.Status {
		case "yet_to_start":
			agg.YetToStart += row.Count
		case "working":
			agg.Working += row.Count
		case "review":
			agg.Review += row.Count
		case "done":
			agg.Done += row.Count
		}
	}

	userStats := make([]UserStat, 0, len(userMap))
	for _, agg := range userMap {
		total := agg.YetToStart + agg.Working + agg.Review + agg.Done
		doneRate := 0.0
		if total > 0 {
			doneRate = float64(agg.Done) / float64(total) * 100
		}
		userStats = append(userStats, UserStat{
			UserID:     agg.UserID,
			UserName:   agg.UserName,
			Assigned:   total,
			YetToStart: agg.YetToStart,
			Working:    agg.Working,
			Review:     agg.Review,
			Done:       agg.Done,
			DoneRate:   doneRate,
		})
	}

	// Sort by assigned desc (insertion sort — small slice)
	for i := 1; i < len(userStats); i++ {
		for j := i; j > 0 && userStats[j].Assigned > userStats[j-1].Assigned; j-- {
			userStats[j], userStats[j-1] = userStats[j-1], userStats[j]
		}
	}

	return &StatsResponse{
		TotalActive:     totalActive,
		StatusBreakdown: breakdown,
		Created:         PeriodCounts{Today: createdToday, Week: createdWeek, Month: createdMonth},
		Completed:       PeriodCounts{Today: completedToday, Week: completedWeek, Month: completedMonth},
		Overdue:         overdue,
		DueSoon:         dueSoon,
		UserStats:       userStats,
	}, nil
}
