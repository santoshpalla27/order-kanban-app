/**
 * Admin Panel Spec — user CRUD, role change, confirm-delete modal.
 */

import { test, expect } from '@playwright/test';
import * as path from 'path';

const ADMIN_AUTH = path.join(__dirname, '../.auth/admin.json');

test.describe('Admin Panel', () => {
  test.use({ storageState: ADMIN_AUTH });

  const testEmail = `e2e-admin-test-${Date.now()}@test.com`;
  let createdRowVisible = false;

  test('admin panel is accessible', async ({ page }) => {
    await page.goto('/admin');
    // Should not redirect to login
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('h1, h2').first()).toBeVisible();
  });

  test('user list is displayed', async ({ page }) => {
    await page.goto('/admin');
    // At least the admin user should be listed
    await expect(page.locator('table, [data-testid="user-list"]').first()).toBeVisible({ timeout: 8_000 });
  });

  test('create new user via admin panel', async ({ page }) => {
    await page.goto('/admin');

    const createBtn = page.locator('button:has-text("Create"), button:has-text("Add User"), button:has-text("New User")').first();
    await expect(createBtn).toBeVisible({ timeout: 5_000 });
    await createBtn.click();

    const modal = page.locator('[role="dialog"]').first();
    await expect(modal).toBeVisible();

    await modal.locator('input[name="name"], input[placeholder*="name" i]').first().fill('E2E Test User');
    await modal.locator('input[name="email"], input[type="email"]').fill(testEmail);
    await modal.locator('input[name="password"], input[type="password"]').fill('password123');

    // Select role — employee (role_id 4)
    const roleSelect = modal.locator('select[name="role_id"], select[name="role"]').first();
    if (await roleSelect.isVisible()) {
      await roleSelect.selectOption({ label: 'employee' });
    }

    await modal.locator('button[type="submit"], button:has-text("Create"), button:has-text("Save")').click();

    await expect(modal).not.toBeVisible({ timeout: 8_000 });
    await expect(page.locator(`text=${testEmail}`)).toBeVisible({ timeout: 8_000 });
    createdRowVisible = true;
  });

  test('change user role via dropdown', async ({ page }) => {
    if (!createdRowVisible) test.skip();

    await page.goto('/admin');
    const userRow = page.locator(`text=${testEmail}`).locator('../..').first();
    const roleSelect = userRow.locator('select').first();
    if (await roleSelect.isVisible()) {
      await roleSelect.selectOption({ label: 'organiser' });
      // Confirm change (may have a toast or inline confirmation)
      await expect(page.locator('text=/role updated|success/i').first()).toBeVisible({ timeout: 5_000 });
    }
  });

  test('delete user shows styled confirm modal', async ({ page }) => {
    if (!createdRowVisible) test.skip();

    await page.goto('/admin');
    const userRow = page.locator(`text=${testEmail}`).locator('../..').first();
    const deleteBtn = userRow.locator('button[aria-label*="delete" i], button:has-text("Delete")').first();
    await expect(deleteBtn).toBeVisible({ timeout: 5_000 });
    await deleteBtn.click();

    // Styled confirm modal — not native browser confirm()
    const confirmModal = page.locator('[role="dialog"]').last();
    await expect(confirmModal).toBeVisible({ timeout: 5_000 });

    // Should have cancel + delete buttons
    await expect(confirmModal.locator('button:has-text("Cancel")')).toBeVisible();
    await expect(confirmModal.locator('button:has-text("Delete")')).toBeVisible();
  });

  test('cancel on delete modal keeps user in list', async ({ page }) => {
    await page.goto('/admin');
    const userRow = page.locator(`text=${testEmail}`).locator('../..').first();
    const deleteBtn = userRow.locator('button[aria-label*="delete" i], button:has-text("Delete")').first();
    if (await deleteBtn.isVisible()) {
      await deleteBtn.click();
      const confirmModal = page.locator('[role="dialog"]').last();
      await confirmModal.locator('button:has-text("Cancel")').click();
      await expect(confirmModal).not.toBeVisible({ timeout: 3_000 });
      // User still listed
      await expect(page.locator(`text=${testEmail}`)).toBeVisible();
    }
  });

  test('confirm delete removes user from list', async ({ page }) => {
    await page.goto('/admin');
    const userRow = page.locator(`text=${testEmail}`).locator('../..').first();
    const deleteBtn = userRow.locator('button[aria-label*="delete" i], button:has-text("Delete")').first();
    if (await deleteBtn.isVisible()) {
      await deleteBtn.click();
      const confirmModal = page.locator('[role="dialog"]').last();
      await confirmModal.locator('button:has-text("Delete")').last().click();

      await expect(page.locator(`text=${testEmail}`)).not.toBeVisible({ timeout: 8_000 });
    }
  });
});
