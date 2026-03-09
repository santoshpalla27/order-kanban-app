package database

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"github.com/jackc/pgx/v5"
)

// Dispatcher is called by the listener for every incoming pg_notify event.
// main.go wires this to the WS Hub to avoid a circular import.
type Dispatcher func(eventType string, excludeID, userID uint, wsMsg []byte)

// StartListener opens a dedicated pgx connection for LISTEN/NOTIFY on the
// "kanban_realtime" channel and calls dispatcher for each notification.
// Automatically reconnects on connection loss.
func StartListener(dsn string, dispatcher Dispatcher) {
	go func() {
		for {
			if err := runListener(dsn, dispatcher); err != nil {
				log.Printf("PG listener disconnected (%v) — reconnecting in 5s", err)
				time.Sleep(5 * time.Second)
			}
		}
	}()
}

func runListener(dsn string, dispatcher Dispatcher) error {
	ctx := context.Background()
	conn, err := pgx.Connect(ctx, dsn)
	if err != nil {
		return err
	}
	defer conn.Close(ctx)

	if _, err := conn.Exec(ctx, "LISTEN kanban_realtime"); err != nil {
		return err
	}
	log.Println("PG listener: subscribed to kanban_realtime")

	for {
		n, err := conn.WaitForNotification(ctx)
		if err != nil {
			return err
		}

		var e realtimeEvent
		if err := json.Unmarshal([]byte(n.Payload), &e); err != nil {
			log.Printf("PG listener: bad payload: %v", err)
			continue
		}
		dispatcher(e.EventType, e.ExcludeID, e.UserID, []byte(e.WsMsg))
	}
}
