import axios from 'axios';
import { useAuthStore } from '../store/authStore';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;

// Auth
export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  register: (name: string, email: string, password: string) =>
    api.post('/auth/register', { name, email, password }),
  getMe: () => api.get('/auth/me'),
};

// Products
export const productsApi = {
  getAll: (params?: Record<string, string>) =>
    api.get('/products', { params }),
  getById: (id: number) => api.get(`/products/${id}`),
  create: (data: any) => api.post('/products', data),
  update: (id: number, data: any) => api.put(`/products/${id}`, data),
  updateStatus: (id: number, status: string) =>
    api.patch(`/products/${id}/status`, { status }),
  delete: (id: number) => api.delete(`/products/${id}`),
};

// Attachments — R2 only, no local fallback
export const attachmentsApi = {
  getByProduct: (productId: number) =>
    api.get(`/products/${productId}/attachments`),

  upload: async (productId: number, file: File) => {
    // Step 1: Get presigned upload URL from backend
    const presignRes = await api.get(`/products/${productId}/attachments/presign`, {
      params: { filename: file.name },
    });

    const { upload_url, s3_key, content_type } = presignRes.data;

    // Step 2: Upload directly to R2
    try {
      await axios.put(upload_url, file, {
        headers: { 'Content-Type': content_type },
      });
    } catch (uploadError: any) {
      // Provide a clear error message for R2 upload failures
      const msg = uploadError?.response?.status
        ? `R2 upload failed (${uploadError.response.status}). Check CORS settings on your R2 bucket.`
        : 'R2 upload failed. Check your network connection and R2 bucket CORS settings.';
      throw new Error(msg);
    }

    // Step 3: Confirm upload with backend
    return api.post(`/products/${productId}/attachments/confirm`, {
      s3_key: s3_key,
      file_name: file.name,
      file_size: file.size,
      file_type: '.' + file.name.split('.').pop()?.toLowerCase(),
    });
  },

  download: (id: number) => `/api/attachments/${id}/download`,
  delete: (id: number) => api.delete(`/attachments/${id}`),
};

// Comments
export const commentsApi = {
  getByProduct: (productId: number) =>
    api.get(`/products/${productId}/comments`),
  create: (productId: number, message: string) =>
    api.post(`/products/${productId}/comments`, { message }),
  update: (id: number, message: string) =>
    api.put(`/comments/${id}`, { message }),
  delete: (id: number) => api.delete(`/comments/${id}`),
};

// Chat
export const chatApi = {
  getMessages: (limit?: number) =>
    api.get('/chat/messages', { params: { limit } }),
  sendMessage: (message: string) =>
    api.post('/chat/messages', { message }),
};

// Notifications
export const notificationsApi = {
  getAll: () => api.get('/notifications'),
  getUnreadCount: () => api.get('/notifications/unread-count'),
  markAsRead: (id: number) => api.patch(`/notifications/${id}/read`),
  markAllAsRead: () => api.post('/notifications/read-all'),
};

// Users
export const usersApi = {
  getAll: () => api.get('/users'),
  getList: () => api.get('/users/list'),
  create: (data: any) => api.post('/users', data),
  updateRole: (id: number, roleId: number) =>
    api.patch(`/users/${id}/role`, { role_id: roleId }),
  delete: (id: number) => api.delete(`/users/${id}`),
};

export const activityApi = {
  getRecent: (limit = 100) => api.get(`/activity?limit=${limit}`),
};
