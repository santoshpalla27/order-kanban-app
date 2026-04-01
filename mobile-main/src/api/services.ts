import axios from 'axios';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import api from './client';
import { API_BASE_URL } from '../utils/config';
import { tokenManager } from '../utils/tokenManager';

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  register: (name: string, email: string, password: string) =>
    api.post('/auth/register', { name, email, password }),
  getMe: () => api.get('/auth/me'),
  logout: async () => {
    const refreshToken = await tokenManager.getRefreshToken();
    if (refreshToken) {
      try { await api.post('/auth/logout', { refresh_token: refreshToken }); } catch {}
    }
    await tokenManager.clearTokens();
  },
};

// ─── Products ─────────────────────────────────────────────────────────────────

export const productsApi = {
  getPaged: (params?: Record<string, string>, limit = 50, cursor?: number) =>
    api.get<{ data: any[]; next_cursor: number | null; has_more: boolean; total: number }>(
      '/products',
      { params: { ...params, limit: String(limit), ...(cursor != null ? { cursor: String(cursor) } : {}) } },
    ),
  getById: (id: number) => api.get(`/products/${id}`),
  create: (data: any) => api.post('/products', data),
  update: (id: number, data: any) => api.put(`/products/${id}`, data),
  updateStatus: (id: number, status: string) =>
    api.patch(`/products/${id}/status`, { status }),
  delete: (id: number) => api.delete(`/products/${id}`),
  getDeleted: () => api.get('/products/deleted'),
  restore: (id: number) => api.post(`/products/${id}/restore`),
};

// ─── Attachments ──────────────────────────────────────────────────────────────

export const attachmentsApi = {
  getByProduct: (productId: number) =>
    api.get(`/products/${productId}/attachments`),

  uploadWithProgress: async (
    productId: number,
    uri: string,
    fileName: string,
    fileSize: number,
    mimeType: string,
    onProgress: (pct: number) => void,
    source = 'direct',
  ) => {
    // 1. Get presigned upload URL
    const presignRes = await api.get(`/products/${productId}/attachments/presign`, {
      params: { filename: fileName },
    });
    const { upload_url, s3_key, content_type } = presignRes.data;

    // 2. Upload directly to R2.
    //    Web: XHR PUT (fetch→blob works in browsers, gives progress via xhr.upload).
    //    Native: expo-file-system createUploadTask (reliable on Android production APKs).
    if (Platform.OS === 'web') {
      const blobRes = await fetch(uri);
      const blob = await blobRes.blob();
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
        });
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) { onProgress(100); resolve(); }
          else reject(new Error(`Upload failed: ${xhr.status}`));
        });
        xhr.addEventListener('error', () => reject(new Error('Upload failed')));
        xhr.open('PUT', upload_url);
        xhr.setRequestHeader('Content-Type', content_type || mimeType);
        xhr.send(blob);
      });
    } else {
      const task = FileSystem.createUploadTask(
        upload_url,
        uri,
        {
          httpMethod: 'PUT',
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
          headers: { 'Content-Type': content_type || mimeType },
        },
        (progress) => {
          const total = progress.totalBytesExpectedToSend;
          if (total > 0) onProgress(Math.round((progress.totalBytesSent / total) * 100));
        },
      );
      const result = await task.uploadAsync();
      if (!result || result.status < 200 || result.status >= 300) {
        throw new Error(`Upload failed: ${result?.status ?? 'unknown'}`);
      }
    }

    // 3. Confirm upload
    const ext = '.' + fileName.split('.').pop()?.toLowerCase();
    return api.post(`/products/${productId}/attachments/confirm`, {
      s3_key,
      file_name: fileName,
      file_size: fileSize,
      file_type: ext,
      source,
    });
  },

  getDownloadUrl: (id: number) => api.get(`/attachments/${id}/download`),
  delete: (id: number) => api.delete(`/attachments/${id}`),
};

// ─── Comments ─────────────────────────────────────────────────────────────────

export const commentsApi = {
  getByProduct: (productId: number) =>
    api.get(`/products/${productId}/comments`),
  create: (productId: number, message: string) =>
    api.post(`/products/${productId}/comments`, { message }),
  update: (id: number, message: string) =>
    api.put(`/comments/${id}`, { message }),
  delete: (id: number) => api.delete(`/comments/${id}`),
};

// ─── Chat ─────────────────────────────────────────────────────────────────────

export const chatApi = {
  getMessages: (limit = 50, cursor?: number) =>
    api.get<{ data: any[]; next_cursor: number | null; has_more: boolean }>(
      '/chat/messages',
      { params: { limit, ...(cursor != null ? { cursor } : {}) } },
    ),
  sendMessage: (message: string) =>
    api.post('/chat/messages', { message }),
};

// ─── Notifications ────────────────────────────────────────────────────────────

export const notificationsApi = {
  getAll: (limit = 50, cursor?: number) =>
    api.get<{ data: any[]; next_cursor: number | null; has_more: boolean }>(
      '/notifications',
      { params: { limit, ...(cursor != null ? { cursor } : {}) } },
    ),
  getUnreadCount: () => api.get<{ count: number }>('/notifications/unread-count'),
  markAsRead: (id: number) => api.patch(`/notifications/${id}/read`),
  markAllAsRead: () => api.post('/notifications/read-all'),
  getUnreadSummary: (assignedTo?: number) =>
    api.get('/notifications/unread-summary', {
      params: assignedTo ? { assigned_to: assignedTo } : {},
    }),
  markReadByEntityAndTypes: (entityType: string, entityId: number, types: string[]) =>
    api.post('/notifications/read-by-entity-type', { entity_type: entityType, entity_id: entityId, types }),
};

// ─── Users ────────────────────────────────────────────────────────────────────

export const usersApi = {
  getAll: () => api.get('/users'),
  getList: () => api.get('/users/list'),
  create: (data: any) => api.post('/users', data),
  updateRole: (id: number, roleId: number) =>
    api.patch(`/users/${id}/role`, { role_id: roleId }),
  delete: (id: number) => api.delete(`/users/${id}`),
};

// ─── Profile ──────────────────────────────────────────────────────────────────

export const profileApi = {
  update: (data: { name?: string }) =>
    api.patch('/users/me', data),
  getMe: () => api.get('/auth/me'),
};

// ─── Activity ─────────────────────────────────────────────────────────────────

export const activityApi = {
  getRecent: (limit = 100) => api.get(`/activity?limit=${limit}`),
};

// ─── Stats ────────────────────────────────────────────────────────────────────

export const statsApi = {
  getStats: () => api.get('/stats'),
};

// ─── Customer Link ─────────────────────────────────────────────────────────────

export const customerLinkApi = {
  get: (productId: number) =>
    api.get<{ link: any }>(`/products/${productId}/customer-link`),
  create: (productId: number) =>
    api.post<{ link: any }>(`/products/${productId}/customer-link`),
  deactivate: (productId: number, linkId: number) =>
    api.delete(`/products/${productId}/customer-link/${linkId}`),
};
