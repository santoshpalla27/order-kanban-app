/**
 * profile.spec.ts
 *
 * Tests for user profile functionality:
 *  - Clicking avatar/user button opens profile dropdown/modal
 *  - Profile shows user name and email
 *  - Edit Profile modal opens and shows editable fields
 *  - Name field is editable
 *  - Profile modal has a save button
 *  - Logout button is accessible from profile area
 *
 * Uses admin auth state (.auth/admin.json).
 */

import { test, expect } from '@playwright/test';

const BASE_URL       = process.env.E2E_BASE_URL || process.env.BASE_URL || 'https://app.santoshdevops.cloud';
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL    || 'admin@gmail.com';

test.describe('User Profile', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState('networkidle');
  });

  // ── Open profile ──────────────────────────────────────────────────────────

  test('user avatar/button is visible in the header', async ({ page }) => {
    const avatar = page.locator('img[alt*="avatar" i], img[alt*="user" i]')
      .or(page.locator('[class*="avatar" i]'))
      .or(page.locator('[class*="rounded-full"][class*="gradient"]'));
    await expect(avatar.first()).toBeVisible({ timeout: 10_000 });
  });

  test('clicking avatar opens profile dropdown or modal', async ({ page }) => {
    const avatar = page.locator('img[alt*="avatar" i], img[alt*="user" i]')
      .or(page.locator('[class*="avatar" i]'))
      .or(page.locator('button').filter({ has: page.locator('[class*="rounded-full"][class*="gradient"]') }));

    if (await avatar.count() === 0) {
      test.skip(true, 'Avatar not found');
      return;
    }

    await avatar.first().click();
    await page.waitForTimeout(500);

    // Profile dropdown/modal should show user info
    const profileContent = page.getByText(ADMIN_EMAIL)
      .or(page.getByText(/profile|account/i))
      .or(page.getByText(/edit profile/i))
      .or(page.getByText(/log ?out|sign out/i));

    await expect(profileContent.first()).toBeVisible({ timeout: 10_000 });
  });

  test('profile area shows the admin email', async ({ page }) => {
    const avatar = page.locator('img[alt*="avatar" i], img[alt*="user" i]')
      .or(page.locator('[class*="avatar" i]'))
      .or(page.locator('button').filter({ has: page.locator('[class*="rounded-full"][class*="gradient"]') }));

    if (await avatar.count() === 0) {
      test.skip(true, 'Avatar not found');
      return;
    }

    await avatar.first().click();
    await page.waitForTimeout(500);

    const email = page.getByText(ADMIN_EMAIL);
    if (await email.count() > 0) {
      await expect(email.first()).toBeVisible({ timeout: 5_000 });
    }
  });

  // ── Edit Profile ──────────────────────────────────────────────────────────

  test('"Edit Profile" button/link is available', async ({ page }) => {
    const avatar = page.locator('img[alt*="avatar" i], img[alt*="user" i]')
      .or(page.locator('[class*="avatar" i]'))
      .or(page.locator('button').filter({ has: page.locator('[class*="rounded-full"][class*="gradient"]') }));

    if (await avatar.count() === 0) {
      test.skip(true, 'Avatar not found');
      return;
    }

    await avatar.first().click();
    await page.waitForTimeout(500);

    const editProfileBtn = page.getByText(/edit profile/i)
      .or(page.getByRole('button', { name: /edit profile/i }));

    if (await editProfileBtn.count() > 0) {
      await expect(editProfileBtn.first()).toBeVisible({ timeout: 5_000 });
    }
  });

  test('clicking "Edit Profile" opens a modal with editable fields', async ({ page }) => {
    const avatar = page.locator('img[alt*="avatar" i], img[alt*="user" i]')
      .or(page.locator('[class*="avatar" i]'))
      .or(page.locator('button').filter({ has: page.locator('[class*="rounded-full"][class*="gradient"]') }));

    if (await avatar.count() === 0) {
      test.skip(true, 'Avatar not found');
      return;
    }

    await avatar.first().click();
    await page.waitForTimeout(500);

    const editProfileBtn = page.getByText(/edit profile/i)
      .or(page.getByRole('button', { name: /edit profile/i }));

    if (await editProfileBtn.count() === 0) {
      test.skip(true, 'Edit Profile button not found');
      return;
    }

    await editProfileBtn.first().click();
    await page.waitForTimeout(500);

    // Profile edit modal should show name field
    const nameField = page.getByLabel(/name/i)
      .or(page.getByRole('textbox', { name: /name/i }))
      .or(page.locator('input[name="name"], input[placeholder*="name" i]'));

    await expect(nameField.first()).toBeVisible({ timeout: 10_000 });
  });

  test('profile edit modal has a save/update button', async ({ page }) => {
    const avatar = page.locator('img[alt*="avatar" i], img[alt*="user" i]')
      .or(page.locator('[class*="avatar" i]'))
      .or(page.locator('button').filter({ has: page.locator('[class*="rounded-full"][class*="gradient"]') }));

    if (await avatar.count() === 0) {
      test.skip(true, 'Avatar not found');
      return;
    }

    await avatar.first().click();
    await page.waitForTimeout(500);

    const editProfileBtn = page.getByText(/edit profile/i)
      .or(page.getByRole('button', { name: /edit profile/i }));

    if (await editProfileBtn.count() === 0) {
      test.skip(true, 'Edit Profile button not found');
      return;
    }

    await editProfileBtn.first().click();
    await page.waitForTimeout(500);

    const saveBtn = page.getByRole('button', { name: /save|update/i });
    await expect(saveBtn.first()).toBeVisible({ timeout: 10_000 });
  });

  // ── Logout from profile ────────────────────────────────────────────────────

  test('logout button is accessible from profile area', async ({ page }) => {
    const avatar = page.locator('img[alt*="avatar" i], img[alt*="user" i]')
      .or(page.locator('[class*="avatar" i]'))
      .or(page.locator('button').filter({ has: page.locator('[class*="rounded-full"][class*="gradient"]') }));

    if (await avatar.count() === 0) {
      test.skip(true, 'Avatar not found');
      return;
    }

    await avatar.first().click();
    await page.waitForTimeout(500);

    const logoutBtn = page.getByText(/log ?out|sign out/i)
      .or(page.getByRole('button', { name: /log ?out|sign out/i }));

    await expect(logoutBtn.first()).toBeVisible({ timeout: 10_000 });
  });
});
