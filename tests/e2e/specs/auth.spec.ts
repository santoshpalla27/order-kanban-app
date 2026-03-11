/**
 * Auth Spec — Login, logout, token handling, protected routes.
 */

import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test.use({ storageState: { cookies: [], origins: [] } }); // fresh context — no saved auth

  test('shows login page at /login', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('h1, h2').first()).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('redirects unauthenticated user from / to /login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
  });

  test('shows error on wrong credentials', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin@test.com');
    await page.fill('input[type="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');

    // Error message visible, still on login page
    await expect(page.locator('[role="alert"], .error, [data-testid="error"]').or(
      page.locator('text=/invalid|incorrect|wrong|unauthorized/i')
    )).toBeVisible({ timeout: 5_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test('shows error on empty fields', async ({ page }) => {
    await page.goto('/login');
    await page.click('button[type="submit"]');
    // HTML5 validation or custom error
    const emailInput = page.locator('input[type="email"]');
    const isInvalid = await emailInput.evaluate((el: HTMLInputElement) => !el.validity.valid);
    expect(isInvalid).toBe(true);
  });

  test('successful login redirects to kanban board', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', process.env.ADMIN_EMAIL || 'admin@test.com');
    await page.fill('input[type="password"]', process.env.ADMIN_PASSWORD || 'password123');
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/(kanban|$)/, { timeout: 10_000 });
    await expect(page.locator('h1')).toContainText(/kanban/i, { timeout: 8_000 });
  });

  test('logout clears session and redirects to login', async ({ page }) => {
    // Login first
    await page.goto('/login');
    await page.fill('input[type="email"]', process.env.ADMIN_EMAIL || 'admin@test.com');
    await page.fill('input[type="password"]', process.env.ADMIN_PASSWORD || 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/(kanban|$)/);

    // Logout — look for a logout button or avatar menu
    const logoutBtn = page.locator('button:has-text("Logout"), [data-testid="logout"], button[aria-label="logout"]').first();
    if (await logoutBtn.isVisible()) {
      await logoutBtn.click();
    } else {
      // Try avatar/profile menu
      await page.locator('[data-testid="avatar"], img[alt*="avatar"], button[aria-label*="profile"]').first().click();
      await page.locator('text=/logout|sign out/i').click();
    }

    await expect(page).toHaveURL(/\/login/, { timeout: 8_000 });

    // Verify protected route is inaccessible
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
  });
});
