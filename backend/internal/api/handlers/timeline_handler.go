package handlers

import (
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"kanban-app/database"
	"kanban-app/internal/models"
	"kanban-app/internal/services"

	"github.com/gin-gonic/gin"
)

type TimelineHandler struct{}

func NewTimelineHandler() *TimelineHandler {
	return &TimelineHandler{}
}

// TimelineActor is a minimal actor representation for timeline items.
type TimelineActor struct {
	ID        uint   `json:"id"`
	Name      string `json:"name"`
	AvatarURL string `json:"avatar_url,omitempty"`
}

// TimelineItem is one event in the unified product timeline.
// type values: "comment" | "customer_message" | "status_change" | "attachment" | "system"
// source values: "internal" | "customer" | "system"
type TimelineItem struct {
	ID        string                 `json:"id"`
	Type      string                 `json:"type"`
	Source    string                 `json:"source"`
	Actor     TimelineActor          `json:"actor"`
	Content   string                 `json:"content"`
	Metadata  map[string]interface{} `json:"metadata,omitempty"`
	CommentID *uint                  `json:"comment_id,omitempty"`
	CreatedAt time.Time              `json:"created_at"`
}

// GetTimeline returns a merged, chronological timeline for a product.
// Combines comments (internal + customer) and activity_logs.
func (h *TimelineHandler) GetTimeline(c *gin.Context) {
	productID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid product ID"})
		return
	}

	// Fetch all comments for this product
	comments, err := services.GetCommentsByProduct(uint(productID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch comments"})
		return
	}

	// Fetch all attachments so we can resolve attachment references in comments
	attachments, err := services.GetAttachmentsByProduct(uint(productID))
	if err != nil {
		attachments = []models.Attachment{}
	}

	// Build attachment lookup by ID for view URLs
	attMap := map[uint]models.Attachment{}
	for _, a := range attachments {
		attMap[a.ID] = a
	}

	// Fetch activity logs for this product
	var activityLogs []models.ActivityLog
	database.DB.Preload("User").
		Where("entity = 'product' AND entity_id = ?", productID).
		Order("created_at ASC").
		Find(&activityLogs)

	var items []TimelineItem

	// ── Convert comments to timeline items ──
	for i := range comments {
		c := &comments[i]
		item := commentToTimelineItem(c, attMap)
		items = append(items, item)
	}

	// ── Convert activity logs to timeline items ──
	for i := range activityLogs {
		log := &activityLogs[i]
		item, skip := activityToTimelineItem(log)
		if skip {
			continue
		}
		items = append(items, item)
	}

	// ── Include direct-uploaded attachments as timeline items ──
	// source="comment" attachments are already covered via their comment record.
	// source="customer" attachments are shown inline with customer messages.
	for i := range attachments {
		att := &attachments[i]
		if att.Source != "direct" {
			continue
		}
		actor := TimelineActor{}
		if att.Uploader.ID > 0 {
			actor.ID = att.Uploader.ID
			actor.Name = att.Uploader.Name
		}
		metadata := map[string]interface{}{
			"attachment_id":   att.ID,
			"attachment_name": att.FileName,
			"attachment_type": att.FileType,
			"attachment_size": att.FileSize,
		}
		if isTimelineImageType(att.FileType) && services.R2 != nil {
			if url, err := services.R2.GenerateViewURL(att.FilePath); err == nil {
				metadata["view_url"] = url
			}
		}
		items = append(items, TimelineItem{
			ID:        fmt.Sprintf("att_%d", att.ID),
			Type:      "attachment",
			Source:    "internal",
			Actor:     actor,
			Content:   att.FileName,
			Metadata:  metadata,
			CreatedAt: att.UploadedAt,
		})
	}

	// Sort all items by created_at ascending
	sort.Slice(items, func(i, j int) bool {
		return items[i].CreatedAt.Before(items[j].CreatedAt)
	})

	c.JSON(http.StatusOK, gin.H{"items": items})
}

// commentToTimelineItem converts a Comment into a TimelineItem.
func commentToTimelineItem(c *models.Comment, attMap map[uint]models.Attachment) TimelineItem {
	itemType := "comment"
	source := "internal"
	if c.Source == "customer" {
		itemType = "customer_message"
		source = "customer"
	}

	actor := TimelineActor{}
	if c.Source == "customer" {
		actor.Name = c.PortalSender
		if actor.Name == "" {
			actor.Name = "Customer"
		}
	} else if c.User.ID > 0 {
		actor.ID = c.User.ID
		actor.Name = c.User.Name
	}

	// Check if this is an attachment comment (📎 Uploaded: ...)
	isAttachmentMsg := strings.HasPrefix(c.Message, "📎 Uploaded: ") && strings.Contains(c.Message, "[attachment:")
	if isAttachmentMsg {
		itemType = "attachment"
	}

	// Extract attachment metadata for the response
	var metadata map[string]interface{}
	if strings.Contains(c.Message, "[attachment:") {
		parsed := parseTimelineCommentMessage(c.Message)
		if parsed.attachmentID > 0 {
			att, ok := attMap[parsed.attachmentID]
			if ok {
				metadata = map[string]interface{}{
					"attachment_id":   att.ID,
					"attachment_name": att.FileName,
					"attachment_type": att.FileType,
					"attachment_size": att.FileSize,
				}
				// Generate view URL for images
				if isTimelineImageType(att.FileType) {
					if url, err := services.R2.GenerateViewURL(att.FilePath); err == nil {
						metadata["view_url"] = url
					}
				}
			}
		}
	}

	commentID := c.ID
	return TimelineItem{
		ID:        fmt.Sprintf("comment_%d", c.ID),
		Type:      itemType,
		Source:    source,
		Actor:     actor,
		Content:   c.Message,
		Metadata:  metadata,
		CommentID: &commentID,
		CreatedAt: c.CreatedAt,
	}
}

// activityToTimelineItem converts an ActivityLog into a TimelineItem.
// Returns skip=true for activity types we don't want shown (e.g. comment edits).
func activityToTimelineItem(log *models.ActivityLog) (TimelineItem, bool) {
	actor := TimelineActor{}
	if log.User.ID > 0 {
		actor.ID = log.User.ID
		actor.Name = log.User.Name
	}

	var itemType string
	var metadata map[string]interface{}

	switch log.Action {
	case "status_changed":
		itemType = "status_change"
		// Parse "moved from X to Y" from Details
		from, to := parseStatusChangeDetails(log.Details)
		if from != "" || to != "" {
			metadata = map[string]interface{}{"from": from, "to": to}
		}
	case "created":
		itemType = "system"
		metadata = map[string]interface{}{"action": "created"}
	case "updated":
		itemType = "system"
		metadata = map[string]interface{}{"action": "updated"}
	case "deleted":
		itemType = "system"
		metadata = map[string]interface{}{"action": "deleted"}
	case "restored":
		itemType = "system"
		metadata = map[string]interface{}{"action": "restored"}
	case "commented", "edited", "uploaded":
		// These are covered by the comment/attachment entries; skip duplicates
		return TimelineItem{}, true
	default:
		return TimelineItem{}, true
	}

	return TimelineItem{
		ID:        fmt.Sprintf("activity_%d", log.ID),
		Type:      itemType,
		Source:    "system",
		Actor:     actor,
		Content:   log.Details,
		Metadata:  metadata,
		CreatedAt: log.CreatedAt,
	}, false
}

// parseStatusChangeDetails extracts from/to from strings like
// "Order ORD-001 moved from Working to Review"
func parseStatusChangeDetails(details string) (string, string) {
	lower := strings.ToLower(details)
	fromIdx := strings.Index(lower, " from ")
	toIdx := strings.Index(lower, " to ")
	if fromIdx < 0 || toIdx < 0 || toIdx <= fromIdx {
		return "", ""
	}
	from := strings.TrimSpace(details[fromIdx+6 : toIdx])
	to := strings.TrimSpace(details[toIdx+4:])
	return from, to
}

type parsedTimelineComment struct {
	attachmentID uint
}

// parseTimelineCommentMessage extracts attachment ID from [attachment:ID:name] tokens.
func parseTimelineCommentMessage(raw string) parsedTimelineComment {
	result := parsedTimelineComment{}
	for _, line := range strings.Split(raw, "\n") {
		if strings.HasPrefix(line, "[attachment:") && strings.HasSuffix(line, "]") {
			inner := line[len("[attachment:") : len(line)-1]
			parts := strings.SplitN(inner, ":", 2)
			if len(parts) >= 1 {
				if id, err := strconv.ParseUint(parts[0], 10, 32); err == nil {
					result.attachmentID = uint(id)
				}
			}
		}
	}
	return result
}

func isTimelineImageType(ext string) bool {
	switch strings.ToLower(ext) {
	case ".jpg", ".jpeg", ".png", ".gif", ".webp":
		return true
	}
	return false
}
