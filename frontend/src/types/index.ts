export interface Role {
  id: number;
  name: string;
}

export const ALL_NOTIF_TYPES = [
  'status_change', 'comment', 'mention',
  'attachment', 'chat', 'product_created', 'product_deleted',
] as const;

export type NotifType = typeof ALL_NOTIF_TYPES[number];

// Types shown in the "My Orders" section (chat & product_created are global, not per-order).
export const MY_ORDERS_NOTIF_TYPES: NotifType[] = [
  'status_change', 'comment', 'mention',
  'attachment', 'product_created', 'product_deleted',
];

export interface NotificationPrefs {
  // @mention always bypasses both lists.
  custom_my_types: NotifType[];   // types for orders assigned to me
  custom_all_types: NotifType[];  // types for all other orders (+ team chat)
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  custom_my_types:  [...MY_ORDERS_NOTIF_TYPES],
  custom_all_types: [...ALL_NOTIF_TYPES],
};

export interface User {
  id: number;
  name: string;
  email: string;
  role_id: number;
  role: Role;
  avatar_url?: string;
  notification_prefs?: NotificationPrefs;
  created_at: string;
}

export type ProductStatus = 'yet_to_start' | 'working' | 'review' | 'done';

export interface Product {
  id: number;
  product_id: string;
  customer_name: string;
  customer_phone: string;
  description: string;
  status: ProductStatus;
  created_by: number;
  creator: User;
  attachments?: Attachment[];
  comments?: Comment[];
  delivery_at?: string | null;
  assignees?: User[];
  deleted_at?: string | null;
  deleted_by?: number;
  created_at: string;
}

export interface Attachment {
  id: number;
  product_id: number;
  file_path: string;
  file_name: string;
  file_type: string;
  file_size: number;
  uploaded_by: number;
  uploader?: User;
  uploaded_at: string;
  source?: string;
  portal_sender?: string;
  view_url?: string;
}

export interface Comment {
  id: number;
  product_id: number;
  user_id: number;
  user?: User;
  message: string;
  source?: string;
  portal_sender?: string;
  created_at: string;
  updated_at: string;
}

export interface CustomerLink {
  id: number;
  product_id: number;
  token: string;
  is_active: boolean;
  expires_at: string;
  created_at: string;
}

export interface CustomerPortalProduct {
  product_id: string;
  customer_name: string;
  status: ProductStatus;
  description: string;
  delivery_at?: string | null;
}

export interface ChatMessage {
  id: number;
  user_id: number;
  user?: User;
  user_name?: string;
  message: string;
  created_at: string;
}

export interface Notification {
  id: number;
  user_id: number;
  message: string;
  type: string;
  entity_type: string;
  entity_id: number;
  content?: string;
  sender_name?: string;
  is_read: boolean;
  created_at: string;
}

export interface WSMessage {
  type: string;
  payload: any;
}

export const STATUS_LABELS: Record<ProductStatus, string> = {
  yet_to_start: 'Yet to Start',
  working: 'Working',
  review: 'Review',
  done: 'Done',
};

export const STATUS_ORDER: ProductStatus[] = ['yet_to_start', 'working', 'review', 'done'];
