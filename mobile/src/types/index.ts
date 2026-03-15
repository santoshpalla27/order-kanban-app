// ─── Auth ─────────────────────────────────────────────────────────────────────
export interface LoginRequest  { email: string; password: string }
export interface RefreshRequest { refresh_token: string }
export interface AuthResponse {
  access_token: string
  refresh_token: string
  user: User
}

// ─── User ─────────────────────────────────────────────────────────────────────
export interface Role { id: number; name: string }
export interface User {
  id: number
  name: string
  email: string
  role: Role
  avatar_key?: string
  created_at?: string
}
export interface CreateUserRequest {
  name: string; email: string; password: string; role_id: number
}

// ─── Product ─────────────────────────────────────────────────────────────────
export type ProductStatus = 'yet_to_start' | 'working' | 'review' | 'done'
export interface Product {
  id: number
  product_id: string
  customer_name: string
  customer_phone: string
  description: string
  status: ProductStatus
  creator?: User
  attachments?: Attachment[]
  comments?: Comment[]
  created_at: string
  updated_at?: string
}
export interface ProductListResponse {
  data: Product[]
  has_more: boolean
  next_cursor: number | null
  total: number
}
export interface CreateProductRequest {
  product_id: string
  customer_name: string
  customer_phone: string
  description: string
  status?: ProductStatus
}
export interface UpdateProductRequest {
  customer_name: string
  customer_phone: string
  description: string
}

// ─── Comment ─────────────────────────────────────────────────────────────────
export interface Comment {
  id: number
  product_id: number
  user_id: number
  user?: User
  message: string
  created_at: string
  updated_at?: string
}

// ─── Attachment ───────────────────────────────────────────────────────────────
export interface Attachment {
  id: number
  product_id: number
  file_path: string
  file_name: string
  file_type: string
  file_size: number
  uploader?: User
  uploaded_at: string
}
export interface PresignResponse { upload_url: string; s3_key: string }

// ─── Chat ─────────────────────────────────────────────────────────────────────
export interface ChatMessage {
  id: number
  user_id: number
  user?: User
  message: string
  created_at: string
}
export interface ChatListResponse {
  data: ChatMessage[]
  has_more: boolean
  next_cursor: number | null
}

// ─── Notification ─────────────────────────────────────────────────────────────
export interface Notification {
  id: number
  user_id: number
  message: string
  type: string
  entity_type: string
  entity_id: number
  content: string
  sender_name: string
  is_read: boolean
  created_at: string
}
export interface NotificationListResponse {
  data: Notification[]
  has_more: boolean
  next_cursor: number | null
}

// ─── Activity Log ─────────────────────────────────────────────────────────────
export interface ActivityLog {
  id: number
  user_id: number
  user?: User
  action: string
  entity: string
  entity_id: number
  details: string
  created_at: string
}

// ─── WebSocket ────────────────────────────────────────────────────────────────
export interface WsEvent {
  type: string
  payload: Record<string, unknown>
}

// ─── Navigation ───────────────────────────────────────────────────────────────
export type RootStackParams = {
  Login: undefined
  Main: undefined
  ProductDetail: { id: number }
  CreateEditProduct: { id?: number }
  Notifications: undefined
}
export type MainTabParams = {
  Board: undefined
  List: undefined
  Chat: undefined
  Profile: undefined
}
