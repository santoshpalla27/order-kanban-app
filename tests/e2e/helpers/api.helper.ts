/**
 * API Helper — uses Node 18+ built-in fetch (no axios).
 * All functions throw on non-2xx responses.
 */

const API_URL = process.env.API_URL || 'https://app.santoshdevops.cloud/api';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LoginResponse {
  access_token: string;
}

export interface Role {
  id: number;
  name: string;
}

export interface User {
  id: number;
  name: string;
  email: string;
  role_id: number;
}

export interface Product {
  id:            number;
  product_id:    string;
  customer_name: string;
  description:   string;
  status:        string;
}

export interface Comment {
  id: number;
  message: string;
}

export interface NotificationCount {
  count: number;
}

// ─── Role ID fallbacks ────────────────────────────────────────────────────────

export const ROLE_IDS: Record<string, number> = {
  admin:      1,
  manager:    2,
  organiser:  3,
  employee:   4,
  view_only:  5,
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function request<T>(
  method: string,
  path: string,
  token?: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept':       'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let message = `HTTP ${res.status} ${res.statusText}`;
    try {
      const json = await res.json() as { message?: string; error?: string };
      message += ` — ${json.message || json.error || JSON.stringify(json)}`;
    } catch {
      // ignore JSON parse errors on error responses
    }
    throw new Error(`[${method} ${path}] ${message}`);
  }

  // 204 No Content — return empty object
  if (res.status === 204) {
    return {} as T;
  }

  return res.json() as Promise<T>;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function apiLogin(email: string, password: string): Promise<string> {
  const data = await request<LoginResponse>('POST', '/auth/login', undefined, {
    email,
    password,
  });
  return data.access_token;
}

// ─── Roles ────────────────────────────────────────────────────────────────────

export async function getRoles(token: string): Promise<Role[]> {
  try {
    return await request<Role[]>('GET', '/roles', token);
  } catch {
    // Endpoint may not exist — return built-in fallback list
    return Object.entries(ROLE_IDS).map(([name, id]) => ({ id, name }));
  }
}

export async function getRoleId(token: string, roleName: string): Promise<number> {
  const roles = await getRoles(token);
  const role  = roles.find(
    (r) => r.name.toLowerCase() === roleName.toLowerCase(),
  );
  if (role) return role.id;
  // Fallback to static map
  const fallback = ROLE_IDS[roleName.toLowerCase()];
  if (fallback !== undefined) return fallback;
  throw new Error(`Role not found: ${roleName}`);
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function getUsers(token: string): Promise<User[]> {
  return request<User[]>('GET', '/users', token);
}

export interface CreateUserPayload {
  name:     string;
  email:    string;
  password: string;
  role_id:  number;
}

export async function createUser(token: string, payload: CreateUserPayload): Promise<User> {
  return request<User>('POST', '/users', token, payload);
}

export async function deleteUser(token: string, userId: number): Promise<void> {
  await request<unknown>('DELETE', `/users/${userId}`, token);
}

export async function changeUserRole(
  token:   string,
  userId:  number,
  roleId:  number,
): Promise<void> {
  await request<unknown>('PATCH', `/users/${userId}/role`, token, { role_id: roleId });
}

// ─── Products ─────────────────────────────────────────────────────────────────

export interface CreateProductPayload {
  product_id?:   string;
  customer_name: string;
  description?:  string;
}

export async function createProduct(
  token:   string,
  payload: CreateProductPayload,
): Promise<Product> {
  return request<Product>('POST', '/products', token, payload);
}

export async function getProducts(token: string): Promise<Product[]> {
  const res = await request<{ data: Product[] } | Product[]>('GET', '/products', token);
  if (Array.isArray(res)) return res;
  return (res as { data: Product[] }).data || [];
}

export async function deleteProduct(token: string, productId: number): Promise<void> {
  await request<unknown>('DELETE', `/products/${productId}`, token);
}

// ─── Comments ─────────────────────────────────────────────────────────────────

export async function createComment(
  token:     string,
  productId: number,
  message:   string,
): Promise<Comment> {
  return request<Comment>('POST', `/products/${productId}/comments`, token, { message });
}

export async function deleteComment(token: string, commentId: number): Promise<void> {
  await request<unknown>('DELETE', `/comments/${commentId}`, token);
}

// ─── Notifications ────────────────────────────────────────────────────────────

export async function getUnreadNotificationCount(token: string): Promise<number> {
  const data = await request<NotificationCount>('GET', '/notifications/unread-count', token);
  return data.count ?? 0;
}

export async function markAllNotificationsRead(token: string): Promise<void> {
  await request<unknown>('PATCH', '/notifications/mark-all-read', token);
}

export async function getNotifications(token: string): Promise<unknown[]> {
  const res = await request<{ data: unknown[] } | unknown[]>('GET', '/notifications?limit=20', token);
  if (Array.isArray(res)) return res;
  return (res as { data: unknown[] }).data || [];
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

export async function sendChatMessage(token: string, message: string): Promise<{ id: number }> {
  return request<{ id: number }>('POST', '/chat/messages', token, { message });
}
