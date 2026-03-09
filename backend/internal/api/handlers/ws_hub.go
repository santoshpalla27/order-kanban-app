package handlers

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type WSClient struct {
	UserID   uint
	UserName string
	Conn     *websocket.Conn
	Send     chan []byte
}

type directMsg struct {
	userID uint
	data   []byte
}

type excludeMsg struct {
	excludeID uint
	data      []byte
}

type WSHub struct {
	clients         map[*WSClient]bool
	broadcast       chan []byte
	register        chan *WSClient
	unregister      chan *WSClient
	sendDirect      chan directMsg
	broadcastExcept chan excludeMsg
}

type WSMessage struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload"`
}

var Hub = &WSHub{
	clients:         make(map[*WSClient]bool),
	broadcast:       make(chan []byte, 256),
	register:        make(chan *WSClient),
	unregister:      make(chan *WSClient),
	sendDirect:      make(chan directMsg, 256),
	broadcastExcept: make(chan excludeMsg, 256),
}

// Run is the sole goroutine that owns the clients map.
// No mutex is needed because only this goroutine reads or writes the map.
// All external callers communicate through channels, eliminating all races.
func (h *WSHub) Run() {
	for {
		select {
		case client := <-h.register:
			h.clients[client] = true
			log.Printf("WS connected: %s (ID: %d)", client.UserName, client.UserID)

		case client := <-h.unregister:
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.Send)
				log.Printf("WS disconnected: %s (ID: %d)", client.UserName, client.UserID)
			}

		case message := <-h.broadcast:
			for client := range h.clients {
				select {
				case client.Send <- message:
				default:
					// Slow client: drop and disconnect.
					// Only Run() ever calls close(), so no double-close is possible.
					delete(h.clients, client)
					close(client.Send)
				}
			}

		case dm := <-h.sendDirect:
			for client := range h.clients {
				if client.UserID == dm.userID {
					select {
					case client.Send <- dm.data:
					default:
						delete(h.clients, client)
						close(client.Send)
					}
				}
			}

		case em := <-h.broadcastExcept:
			for client := range h.clients {
				if client.UserID == em.excludeID {
					continue
				}
				select {
				case client.Send <- em.data:
				default:
					delete(h.clients, client)
					close(client.Send)
				}
			}
		}
	}
}

// BroadcastMessage sends a message to all connected clients.
func (h *WSHub) BroadcastMessage(msg []byte) {
	h.broadcast <- msg
}

// SendToUser sends a message to all connections for a specific user.
// It communicates through a channel so Run() handles it safely.
func (h *WSHub) SendToUser(userID uint, msg []byte) {
	h.sendDirect <- directMsg{userID: userID, data: msg}
}

// NotifPayload holds all fields sent in a "notification" WS event.
type NotifPayload struct {
	Message    string
	NotifType  string
	EntityType string
	EntityID   uint
	Content    string // actual message body (comment text, chat text)
	SenderName string // display name of the person who triggered the event
}

func buildNotifMsg(p NotifPayload) []byte {
	wsMsg, _ := json.Marshal(WSMessage{
		Type: "notification",
		Payload: map[string]interface{}{
			"message":     p.Message,
			"notif_type":  p.NotifType,
			"entity_type": p.EntityType,
			"entity_id":   p.EntityID,
			"content":     p.Content,
			"sender_name": p.SenderName,
		},
	})
	return wsMsg
}

// BroadcastNotificationExcept sends a "notification" WS event to all clients except the sender.
func BroadcastNotificationExcept(excludeID uint, p NotifPayload) {
	Hub.broadcastExcept <- excludeMsg{excludeID: excludeID, data: buildNotifMsg(p)}
}

// SendNotificationToUser sends a "notification" WS event to a specific user.
func SendNotificationToUser(userID uint, p NotifPayload) {
	Hub.SendToUser(userID, buildNotifMsg(p))
}

func HandleWebSocket(c *gin.Context) {
	userID, _ := c.Get("user_id")
	userName, _ := c.Get("user_name")

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}

	client := &WSClient{
		UserID:   userID.(uint),
		UserName: userName.(string),
		Conn:     conn,
		Send:     make(chan []byte, 256),
	}

	Hub.register <- client

	go client.writePump()
	go client.readPump()
}

func (c *WSClient) writePump() {
	defer c.Conn.Close()
	for msg := range c.Send {
		if err := c.Conn.WriteMessage(websocket.TextMessage, msg); err != nil {
			return
		}
	}
}

func (c *WSClient) readPump() {
	defer func() {
		Hub.unregister <- c
		c.Conn.Close()
	}()
	for {
		_, _, err := c.Conn.ReadMessage()
		if err != nil {
			break
		}
	}
}
