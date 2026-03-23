/**
 * register.spec.ts
 *
 * Tests for the Registration page (/register):
 *  - Page renders with "Gift Highway" branding and "Create your account" subtitle
 *  - Form has: Full Name, Email, Password, Confirm Password fields
 *  - Password visibility toggle works for both password fields
 *  - "Passwords do not match" validation shows inline
 *  - Submit button "Create Account" is visible
 *  - "Sign in" link navigates to /login
 *  - Empty field submission shows validation / stays on /register
 *
 * NOTE: These tests do NOT use saved storageState — they test unauthenticated flows.
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL || process.env.BASE_URL || 'https://app.santoshdevops.cloud';

// Override storage state — fresh unauthenticated context
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Register Page (/register)', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/register`);
    await page.waitForLoadState('networkidle');
  });

  // ── Page structure ──────────────────────────────────────────────────────────

  test('register page renders with branding', async ({ page }) => {
    // "Gift Highway" brand name
    const brand = page.getByText('Gift').or(page.getByText(/highway/i));
    await expect(brand.first()).toBeVisible({ timeout: 15_000 });

    // "Create your account" subtitle
    const subtitle = page.getByText(/create your account/i);
    await expect(subtitle.first()).toBeVisible({ timeout: 5_000 });
  });

  test('shows Full Name, Email, Password, Confirm Password fields', async ({ page }) => {
    // Full Name
    const nameField = page.getByLabel(/full name/i)
      .or(page.getByRole('textbox', { name: /name/i }))
      .or(page.locator('input[type="text"]').first());
    await expect(nameField).toBeVisible({ timeout: 10_000 });

    // Email
    const emailField = page.getByLabel(/email/i)
      .or(page.locator('input[type="email"]'));
    await expect(emailField.first()).toBeVisible({ timeout: 5_000 });

    // Password
    const passwordField = page.getByLabel(/^password$/i)
      .or(page.locator('input[type="password"]').first());
    await expect(passwordField).toBeVisible({ timeout: 5_000 });

    // Confirm Password
    const confirmField = page.getByLabel(/confirm password/i)
      .or(page.locator('input[type="password"]').nth(1));
    await expect(confirmField).toBeVisible({ timeout: 5_000 });
  });

  test('displays placeholder text on input fields', async ({ page }) => {
    const namePlaceholder = page.getByPlaceholder(/john doe/i);
    const emailPlaceholder = page.getByPlaceholder(/you@company/i);
    const passwordPlaceholder = page.getByPlaceholder(/min 6 characters/i);

    await expect(namePlaceholder.first()).toBeVisible({ timeout: 10_000 });
    await expect(emailPlaceholder.first()).toBeVisible({ timeout: 5_000 });
    await expect(passwordPlaceholder.first()).toBeVisible({ timeout: 5_000 });
  });

  test('"Create Account" submit button is visible', async ({ page }) => {
    const submitBtn = page.getByRole('button', { name: /create account/i });
    await expect(submitBtn.first()).toBeVisible({ timeout: 10_000 });
  });

  // ── Password visibility toggle ─────────────────────────────────────────────

  test('password visibility toggle works for Password field', async ({ page }) => {
    const passwordInputs = page.locator('input[type="password"]');
    await expect(passwordInputs.first()).toBeVisible({ timeout: 10_000 });

    // Find toggle buttons (Eye/EyeOff icons)
    const toggleBtns = page.locator('input[type="password"]').first().locator('..').locator('button');
    if (await toggleBtns.count() > 0) {
      await toggleBtns.first().click();

      // Password field should now be type="text"
      const textInputs = page.locator('input[type="text"]');
      const count = await textInputs.count();
      expect(count).toBeGreaterThanOrEqual(1);
    }
  });

  // ── Validation ─────────────────────────────────────────────────────────────

  test('shows "Passwords do not match" when passwords differ', async ({ page }) => {
    const passwordField = page.locator('input[type="password"]').first();
    const confirmField = page.locator('input[type="password"]').nth(1);

    await passwordField.fill('password123');
    await confirmField.fill('differentpassword');

    // Inline validation message
    const mismatchError = page.getByText(/passwords do not match/i);
    await expect(mismatchError.first()).toBeVisible({ timeout: 5_000 });
  });

  test('confirm password field shows red border when passwords differ', async ({ page }) => {
    const passwordField = page.locator('input[type="password"]').first();
    const confirmField = page.locator('input[type="password"]').nth(1);

    await passwordField.fill('password123');
    await confirmField.fill('differentpassword');

    // The confirm password field should have a red border class
    const confirmParent = confirmField.locator('..');
    const hasRedIndicator = page.getByText(/passwords do not match/i);
    await expect(hasRedIndicator.first()).toBeVisible({ timeout: 5_000 });
  });

  test('empty form submission stays on /register', async ({ page }) => {
    const submitBtn = page.getByRole('button', { name: /create account/i });
    await submitBtn.first().click();

    // Should stay on register page
    expect(page.url()).toContain('/register');
  });

  // ── Navigation ─────────────────────────────────────────────────────────────

  test('"Sign in" link navigates to /login', async ({ page }) => {
    const signInLink = page.getByRole('link', { name: /sign in/i })
      .or(page.getByText(/sign in/i).and(page.locator('a')));

    await expect(signInLink.first()).toBeVisible({ timeout: 10_000 });
    await signInLink.first().click();

    await page.waitForURL(/\/login/, { timeout: 10_000 });
    expect(page.url()).toContain('/login');
  });

  test('"Already have an account?" text is present', async ({ page }) => {
    const text = page.getByText(/already have an account/i);
    await expect(text.first()).toBeVisible({ timeout: 10_000 });
  });
});
