package handlers

import (
	"log"
	"net/http"
	"sync"

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

type WSHub struct {
	clients    map[*WSClient]bool
	broadcast  chan []byte
	register   chan *WSClient
	unregister chan *WSClient
	mu         sync.RWMutex
}

type WSMessage struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload"`
}

var Hub = &WSHub{
	clients:    make(map[*WSClient]bool),
	broadcast:  make(chan []byte, 256),
	register:   make(chan *WSClient),
	unregister: make(chan *WSClient),
}

func (h *WSHub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.mu.Unlock()
			log.Printf("Client connected: %s (ID: %d)", client.UserName, client.UserID)

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.Send)
			}
			h.mu.Unlock()
			log.Printf("Client disconnected: %s (ID: %d)", client.UserName, client.UserID)

		case message := <-h.broadcast:
			h.mu.RLock()
			for client := range h.clients {
				select {
				case client.Send <- message:
				default:
					close(client.Send)
					delete(h.clients, client)
				}
			}
			h.mu.RUnlock()
		}
	}
}

func (h *WSHub) BroadcastMessage(msg []byte) {
	h.broadcast <- msg
}

func (h *WSHub) SendToUser(userID uint, msg []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for client := range h.clients {
		if client.UserID == userID {
			select {
			case client.Send <- msg:
			default:
				close(client.Send)
				delete(h.clients, client)
			}
		}
	}
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
	defer func() {
		c.Conn.Close()
	}()
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
