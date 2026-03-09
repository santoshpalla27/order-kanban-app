package database

import (
	"encoding/json"
	"log"
)

type realtimeEvent struct {
	EventType string `json:"event_type"`          // "broadcast" | "broadcast_except" | "user"
	ExcludeID uint   `json:"exclude_id,omitempty"` // for broadcast_except
	UserID    uint   `json:"user_id,omitempty"`    // for user
	WsMsg     string `json:"ws_msg"`               // raw JSON WS message
}

// EmitBroadcast sends a WS message to ALL connected clients via pg_notify.
func EmitBroadcast(msg []byte) {
	emit(realtimeEvent{EventType: "broadcast", WsMsg: string(msg)})
}

// EmitBroadcastExcept sends a WS message to all clients EXCEPT excludeID via pg_notify.
func EmitBroadcastExcept(excludeID uint, msg []byte) {
	emit(realtimeEvent{EventType: "broadcast_except", ExcludeID: excludeID, WsMsg: string(msg)})
}

// EmitToUser sends a WS message to a specific user via pg_notify.
func EmitToUser(userID uint, msg []byte) {
	emit(realtimeEvent{EventType: "user", UserID: userID, WsMsg: string(msg)})
}

func emit(e realtimeEvent) {
	payload, err := json.Marshal(e)
	if err != nil {
		log.Printf("EmitEvent marshal error: %v", err)
		return
	}
	if res := DB.Exec("SELECT pg_notify('kanban_realtime', $1)", string(payload)); res.Error != nil {
		log.Printf("pg_notify error: %v", res.Error)
	}
}
