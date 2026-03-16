import { api } from './client'
import type {
  AuthResponse, LoginRequest, User, CreateUserRequest,
  Product, ProductListResponse, CreateProductRequest, UpdateProductRequest,
  Comment, Attachment, PresignResponse,
  ChatListResponse, ChatMessage,
  Notification, NotificationListResponse,
  ActivityLog,
} from '../types'

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  login:   (b: LoginRequest)           => api.post<AuthResponse>('/auth/login', b).then(r => r.data),
  refresh: (refresh_token: string)     => api.post<AuthResponse>('/auth/refresh', { refresh_token }).then(r => r.data),
  logout:  ()                          => api.post('/auth/logout'),
  me:      ()                          => api.get<User>('/auth/me').then(r => r.data),
}

// ─── Products ─────────────────────────────────────────────────────────────────
export const productApi = {
  list: (params?: {
    status?: string
    search?: string
    cursor?: number
    limit?: number
    created_by?: string
    assigned_to?: string
    date_from?: string
    date_to?: string
    delivery_from?: string
    delivery_to?: string
  }) => api.get<ProductListResponse>('/products', { params }).then(r => r.data),

  get: (id: number)                          => api.get<Product>(`/products/${id}`).then(r => r.data),
  create: (b: CreateProductRequest)          => api.post<Product>('/products', b).then(r => r.data),
  update: (id: number, b: UpdateProductRequest) => api.put<Product>(`/products/${id}`, b).then(r => r.data),
  updateStatus: (id: number, status: string) => api.patch<Product>(`/products/${id}/status`, { status }).then(r => r.data),
  delete: (id: number)                       => api.delete(`/products/${id}`),
  restore: (id: number)                      => api.post<Product>(`/products/${id}/restore`).then(r => r.data),

  // API returns Comment[] directly
  getComments: (id: number)           => api.get<Comment[]>(`/products/${id}/comments`).then(r => r.data ?? []),
  postComment: (id: number, message: string) => api.post<Comment>(`/products/${id}/comments`, { message }).then(r => r.data),
  deleteComment: (id: number)         => api.delete(`/comments/${id}`),

  // API returns Attachment[] directly (with optional view_url for images)
  getAttachments: (id: number)        => api.get<Attachment[]>(`/products/${id}/attachments`).then(r => r.data ?? []),
  presignUpload: (id: number, filename: string) =>
    api.get<PresignResponse>(`/products/${id}/attachments/presign`, { params: { filename } }).then(r => r.data),
  confirmUpload: (id: number, body: object) =>
    api.post<Attachment>(`/products/${id}/attachments/confirm`, body).then(r => r.data),
  getDownloadUrl: (id: number)        => api.get<{ url: string }>(`/attachments/${id}/download`).then(r => r.data.url),
  deleteAttachment: (id: number)      => api.delete(`/attachments/${id}`),

  // API returns { data: ActivityLog[] }
  getActivity: (limit = 50)           => api.get<{ data: ActivityLog[] }>('/activity', { params: { limit } }).then(r => r.data.data ?? []),
}

// ─── Chat ─────────────────────────────────────────────────────────────────────
export const chatApi = {
  getMessages: (cursor?: number) =>
    api.get<ChatListResponse>('/chat/messages', { params: { limit: 50, cursor } }).then(r => r.data),
  sendMessage: (message: string) =>
    api.post<ChatMessage>('/chat/messages', { message }).then(r => r.data),
}

// ─── Notifications ─────────────────────────────────────────────────────────────
export const notifApi = {
  list: (cursor?: number) =>
    api.get<NotificationListResponse>('/notifications', { params: { limit: 30, cursor } }).then(r => r.data),
  // API returns { count: number }
  unreadCount: ()         => api.get<{ count: number }>('/notifications/unread-count').then(r => r.data.count ?? 0),
  markRead: (id: number)  => api.patch(`/notifications/${id}/read`),
  markAllRead: ()         => api.post('/notifications/read-all'),
}

// ─── Users ────────────────────────────────────────────────────────────────────
export const userApi = {
  // /users/list returns a plain array (not wrapped in { data: [] })
  list:       ()                             => api.get<User[]>('/users/list').then(r => r.data ?? []),
  all:        ()                             => api.get<{ data: User[] }>('/users').then(r => r.data.data ?? []),
  create:     (b: CreateUserRequest)         => api.post<User>('/users', b).then(r => r.data),
  updateRole: (id: number, role_id: number)  => api.patch(`/users/${id}/role`, { role_id }),
  delete:     (id: number)                   => api.delete(`/users/${id}`),
  updateMe:   (b: { name?: string; avatar_key?: string }) =>
    api.patch<User>('/users/me', b).then(r => r.data),
  savePushToken: (token: string) => api.post('/users/me/push-token', { token }),
}
