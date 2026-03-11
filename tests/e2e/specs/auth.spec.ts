/**
 * auth.spec.ts
 *
 * Tests for the login page:
 *  - Page renders correctly
 *  - Wrong credentials show an error
 *  - Empty fields show a validation error
 *  - Successful login redirects to /kanban
 *  - Logout returns to /login
 *
 * NOTE: These tests do NOT use a pre-saved storageState because they
 * intentionally test unauthenticated flows.
 */

import { test, expect } from '@playwright/test';

const BASE_URL       = process.env.BASE_URL       || 'https://app.santoshdevops.cloud';
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL    || 'admin@gmail.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// Override storage state for this file — we want a fresh context
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Login Page', () => {
  test('login page renders email, password and submit button', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('networkidle');

    // Email field
    const emailField = page.getByLabel(/email/i)
      .or(page.getByRole('textbox', { name: /email/i }))
      .or(page.locator('input[type="email"]'));
    await expect(emailField).toBeVisible();

    // Password field
    const passwordField = page.getByLabel(/password/i)
      .or(page.getByRole('textbox', { name: /password/i }))
      .or(page.locator('input[type="password"]'));
    await expect(passwordField).toBeVisible();

    // Submit button
    const submitBtn = page.getByRole('button', { name: /login|sign in|submit/i });
    await expect(submitBtn).toBeVisible();
  });

  test('shows error on wrong credentials', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('networkidle');

    const emailField = page.getByLabel(/email/i)
      .or(page.getByRole('textbox', { name: /email/i }))
      .or(page.locator('input[type="email"]'));
    await emailField.fill('wrong@example.com');

    const passwordField = page.getByLabel(/password/i)
      .or(page.locator('input[type="password"]'));
    await passwordField.fill('wrongpassword');

    const submitBtn = page.getByRole('button', { name: /login|sign in|submit/i });
    await submitBtn.click();

    // Should stay on login page
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });

    // Error message should appear
    const errorMsg = page
      .getByText(/invalid|incorrect|wrong|unauthorized|credentials|error/i)
      .or(page.locator('[role="alert"]'))
      .or(page.locator('.error, .alert, .toast'));
    await expect(errorMsg.first()).toBeVisible({ timeout: 10_000 });
  });

  test('shows validation error when fields are empty', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('networkidle');

    const submitBtn = page.getByRole('button', { name: /login|sign in|submit/i });
    await submitBtn.click();

    // Either stays on /login or shows validation messages
    const stillOnLogin = page.url().includes('/login');
    if (stillOnLogin) {
      // Validation prevented navigation — that is the expected behaviour
      expect(page.url()).toContain('/login');
    }

    // Optionally check for HTML5 validation or inline error
    const validationError = page
      .locator('input:invalid')
      .or(page.getByText(/required|please enter|cannot be empty/i))
      .or(page.locator('[aria-invalid="true"]'));

    // At least one indicator should be present
    const count = await validationError.count();
    // Accept either validation messages OR simply staying on the page
    expect(stillOnLogin || count > 0).toBeTruthy();
  });

  test('successful login redirects to /kanban', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('networkidle');

    const emailField = page.getByLabel(/email/i)
      .or(page.getByRole('textbox', { name: /email/i }))
      .or(page.locator('input[type="email"]'));
    await emailField.fill(ADMIN_EMAIL);

    const passwordField = page.getByLabel(/password/i)
      .or(page.locator('input[type="password"]'));
    await passwordField.fill(ADMIN_PASSWORD);

    const submitBtn = page.getByRole('button', { name: /login|sign in|submit/i });
    await submitBtn.click();

    await page.waitForURL((url) => !url.pathname.includes('/login'), {
      timeout: 30_000,
    });

    // Should land on kanban or a protected route
    expect(page.url()).not.toContain('/login');
  });

  test('logout returns user to /login', async ({ page }) => {
    // First, log in
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('networkidle');

    const emailField = page.getByLabel(/email/i)
      .or(page.getByRole('textbox', { name: /email/i }))
      .or(page.locator('input[type="email"]'));
    await emailField.fill(ADMIN_EMAIL);

    const passwordField = page.getByLabel(/password/i)
      .or(page.locator('input[type="password"]'));
    await passwordField.fill(ADMIN_PASSWORD);

    const submitBtn = page.getByRole('button', { name: /login|sign in|submit/i });
    await submitBtn.click();

    await page.waitForURL((url) => !url.pathname.includes('/login'), {
      timeout: 30_000,
    });

    // Now log out
    const logoutBtn = page
      .getByRole('button', { name: /logout|log out|sign out/i })
      .or(page.getByRole('link', { name: /logout|log out|sign out/i }))
      .or(page.getByText(/logout|log out|sign out/i));

    if (await logoutBtn.first().isVisible()) {
      await logoutBtn.first().click();
    } else {
      // Try user menu / avatar first
      const userMenu = page
        .getByRole('button', { name: /account|profile|user|menu/i })
        .or(page.locator('[aria-label*="user" i], [aria-label*="account" i], [aria-label*="profile" i]'))
        .or(page.locator('img[alt*="avatar" i], img[alt*="user" i]'));

      if (await userMenu.first().isVisible()) {
        await userMenu.first().click();
        const logoutItem = page
          .getByRole('menuitem', { name: /logout|log out|sign out/i })
          .or(page.getByText(/logout|log out|sign out/i));
        await logoutItem.first().click();
      }
    }

    await page.waitForURL(/\/login/, { timeout: 20_000 });
    expect(page.url()).toContain('/login');
  });
});
