export interface Role {
  id: number;
  name: string;
}

export const ALL_NOTIF_TYPES = [
  'status_change', 'comment', 'mention',
  'attachment', 'chat', 'product_created', 'product_deleted',
] as const;

export type NotifType = typeof ALL_NOTIF_TYPES[number];

export const MY_ORDERS_NOTIF_TYPES: NotifType[] = [
  'status_change', 'comment', 'mention',
  'attachment', 'product_created', 'product_deleted',
];

export interface NotificationPrefs {
  custom_my_types: NotifType[];
  custom_all_types: NotifType[];
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

export interface Attachment {
  id: number;
  product_id: number;
  file_path: string;
  file_name: string;
  file_type: string;
  file_size: number;
  uploaded_by: number;
  uploader: User;
  uploaded_at: string;
  view_url?: string;
  source?: string;
}

export interface CustomerLink {
  id: number;
  product_id: number;
  token: string;
  is_active: boolean;
  expires_at: string;
  created_at: string;
}

export interface Comment {
  id: number;
  product_id: number;
  user_id: number;
  user: User;
  message: string;
  created_at: string;
  updated_at: string;
  source?: string;
  portal_sender?: string;
}

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
  pinned_at?: string | null;
  assignees?: User[];
  deleted_at?: string | null;
  deleted_by?: number;
  created_at: string;
  updated_at?: string;
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

export interface ActivityLog {
  id: number;
  user_id: number;
  user: User;
  action: string;
  entity: string;
  entity_id: number;
  details: string;
  created_at: string;
}

export interface WSMessage {
  type: string;
  payload: any;
}

export interface Toast {
  id: string;
  message: string;
  content: string;
  type: string;
  entityType: string;
  entityId: number;
  senderName: string;
}

export const STATUS_LABELS: Record<ProductStatus, string> = {
  yet_to_start: 'Yet to Start',
  working:      'Working',
  review:       'Review',
  done:         'Done',
};

export const STATUS_ORDER: ProductStatus[] = ['yet_to_start', 'working', 'review', 'done'];

export const STATUS_COLORS: Record<ProductStatus, { bg: string; text: string; border: string; dot: string }> = {
  yet_to_start: { bg: 'rgba(239,68,68,0.12)', text: '#EF4444', border: 'rgba(239,68,68,0.2)', dot: '#EF4444' },
  working:      { bg: '#1E3A5F', text: '#60A5FA', border: '#2563EB', dot: '#60A5FA' },
  review:       { bg: '#3D2A00', text: '#FBBF24', border: '#D97706', dot: '#FBBF24' },
  done:         { bg: '#064E3B', text: '#34D399', border: '#059669', dot: '#34D399' },
};
