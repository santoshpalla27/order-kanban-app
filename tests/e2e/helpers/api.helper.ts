/**
 * API helpers for test setup/teardown.
 * Calls the backend directly (bypassing the browser) to seed or clean data.
 */

const BASE = process.env.API_URL || 'http://localhost:8080/api';

export async function loginAPI(email: string, password: string): Promise<{ accessToken: string; userId: number }> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Login failed for ${email}: ${res.status}`);
  const body = await res.json();
  return { accessToken: body.access_token, userId: body.user.id };
}

export async function createProduct(
  token: string,
  data: { product_id: string; customer_name: string; description?: string }
): Promise<number> {
  const res = await fetch(`${BASE}/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Create product failed: ${res.status}`);
  const body = await res.json();
  return body.id;
}

export async function deleteProduct(token: string, id: number): Promise<void> {
  await fetch(`${BASE}/products/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function createComment(token: string, productId: number, message: string): Promise<number> {
  const res = await fetch(`${BASE}/products/${productId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) throw new Error(`Create comment failed: ${res.status}`);
  const body = await res.json();
  return body.id;
}

export async function getProducts(token: string): Promise<any[]> {
  const res = await fetch(`${BASE}/products?limit=5`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json();
  return body.data ?? [];
}
