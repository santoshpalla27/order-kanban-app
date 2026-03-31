export interface Role {
  id: number;
  name: string;
}

export interface User {
  id: number;
  name: string;
  email: string;
  role_id: number;
  role: Role;
  created_at: string;
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
  assignees?: User[];
  deleted_at?: string | null;
  deleted_by?: number;
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
  uploader?: User;
  uploaded_at: string;
  source?: string; // "direct" | "comment" | "customer"
  portal_sender?: string;
  view_url?: string; // S3 presigned view URL (when S3 enabled)
}

export interface Comment {
  id: number;
  product_id: number;
  user_id: number;
  user?: User;
  message: string;
  source?: string; // "internal" | "customer"
  portal_sender?: string;
  created_at: string;
  updated_at: string;
}

export interface CustomerLink {
  id: number;
  product_id: number;
  token: string;
  is_active: boolean;
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
