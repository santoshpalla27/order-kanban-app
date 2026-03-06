import axios from 'axios';
import { useAuthStore } from '../store/authStore';

const api = axios.create({
  baseURL: '/api',
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

// Attachments
export const attachmentsApi = {
  getByProduct: (productId: number) =>
    api.get(`/products/${productId}/attachments`),
  upload: (productId: number, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/products/${productId}/attachments`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
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
