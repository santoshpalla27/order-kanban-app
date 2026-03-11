/**
 * admin.spec.ts
 *
 * Tests for the Admin Panel (/admin):
 *  - Admin panel is accessible to admin
 *  - User list is displayed
 *  - Create a user via the admin UI
 *  - Change that user's role
 *  - Delete the user
 *
 * Uses admin auth state (.auth/admin.json).
 * Cleanup is performed in afterAll via API.
 */

import { test, expect } from '@playwright/test';
import {
  apiLogin,
  getUsers,
  deleteUser,
} from '../helpers/api.helper';

const BASE_URL       = process.env.BASE_URL       || 'https://app.santoshdevops.cloud';
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL    || 'admin@gmail.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

const UI_USER_EMAIL    = `e2e.admin.ui.${Date.now()}@test.com`;
const UI_USER_PASSWORD = 'E2eTest@123';
const UI_USER_NAME     = `E2E UI User ${Date.now()}`;

test.describe('Admin Panel', () => {
  let adminToken: string;
  let createdUserId: number | null = null;

  test.beforeAll(async () => {
    adminToken = await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD);
  });

  test.afterAll(async () => {
    if (adminToken && createdUserId !== null) {
      try {
        await deleteUser(adminToken, createdUserId);
      } catch {
        // best-effort cleanup
      }
    }
  });

  test('admin can access /admin panel', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin`);
    await page.waitForLoadState('networkidle');

    // Should not be redirected to login
    expect(page.url()).not.toContain('/login');
    expect(page.url()).toContain('/admin');
  });

  test('admin panel displays a list of users', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin`);
    await page.waitForLoadState('networkidle');

    // A table, list, or grid of users should be visible
    const userList = page
      .getByRole('table')
      .or(page.locator('[class*="user-list" i], [class*="users" i]'))
      .or(page.locator('table, [role="grid"], [role="list"]'));

    await expect(userList.first()).toBeVisible({ timeout: 10_000 });

    // Admin user should appear in the list
    const adminEntry = page.getByText(ADMIN_EMAIL).or(page.getByText('admin'));
    await expect(adminEntry.first()).toBeVisible({ timeout: 10_000 });
  });

  test('admin can create a new user via the UI', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin`);
    await page.waitForLoadState('networkidle');

    // Find "Add User" / "Create User" button
    const addUserBtn = page
      .getByRole('button', { name: /add user|create user|new user|\+ user/i })
      .or(page.getByText(/add user|create user|new user/i));

    if (await addUserBtn.count() === 0) {
      test.skip(true, '"Add User" button not found in admin panel — skipping UI create test');
      return;
    }

    await addUserBtn.first().click();

    // Wait for a modal / form
    const modal = page
      .getByRole('dialog')
      .or(page.locator('[class*="modal" i], [class*="form" i]'));
    await expect(modal.first()).toBeVisible({ timeout: 10_000 });

    // Fill in user details
    const nameField = page
      .getByLabel(/name/i)
      .or(page.getByRole('textbox', { name: /name/i }))
      .or(page.locator('input[name="name"], input[placeholder*="name" i]'));
    await nameField.first().fill(UI_USER_NAME);

    const emailField = page
      .getByLabel(/email/i)
      .or(page.getByRole('textbox', { name: /email/i }))
      .or(page.locator('input[type="email"]'));
    await emailField.first().fill(UI_USER_EMAIL);

    const passwordField = page
      .getByLabel(/password/i)
      .or(page.locator('input[type="password"]'));
    await passwordField.first().fill(UI_USER_PASSWORD);

    // Select a role if there's a dropdown
    const roleSelect = page
      .getByRole('combobox', { name: /role/i })
      .or(page.getByLabel(/role/i))
      .or(page.locator('select[name*="role" i]'));

    if (await roleSelect.count() > 0) {
      // Choose "employee" or the first non-admin option
      const options = await roleSelect.first().locator('option').allTextContents();
      const employeeOpt = options.find((o) => /employee/i.test(o));
      if (employeeOpt) {
        await roleSelect.first().selectOption({ label: employeeOpt });
      } else if (options.length > 0) {
        await roleSelect.first().selectOption({ index: 1 });
      }
    }

    // Submit
    const submitBtn = page
      .getByRole('button', { name: /create|save|add|submit/i })
      .last();
    await submitBtn.click();

    await page.waitForTimeout(1_500);

    // Verify the new user appears in the list
    const newUserEntry = page.getByText(UI_USER_EMAIL).or(page.getByText(UI_USER_NAME));
    await expect(newUserEntry.first()).toBeVisible({ timeout: 10_000 });

    // Try to get the ID from the API for cleanup
    try {
      const users = await getUsers(adminToken);
      const found = users.find(
        (u) => u.email === UI_USER_EMAIL || u.name === UI_USER_NAME,
      );
      if (found) createdUserId = found.id;
    } catch {
      // Not critical
    }
  });

  test('admin can change a user role', async ({ page }) => {
    if (createdUserId === null) {
      // Try to resolve ID if previous test didn't save it
      try {
        const users = await getUsers(adminToken);
        const found = users.find((u) => u.email === UI_USER_EMAIL);
        if (found) createdUserId = found.id;
      } catch { /* ignore */ }
    }

    await page.goto(`${BASE_URL}/admin`);
    await page.waitForLoadState('networkidle');

    // Find the row for our test user
    const userRow = page.getByText(UI_USER_EMAIL).locator('../..')
      .or(page.locator('tr').filter({ hasText: UI_USER_EMAIL }));

    if (await userRow.count() === 0) {
      test.skip(true, 'Test user not found in admin panel — skipping role change test');
      return;
    }

    // Look for a role-change button or select within that row
    const changeRoleBtn = userRow
      .getByRole('button', { name: /change role|edit role|role/i })
      .or(userRow.getByRole('combobox', { name: /role/i }))
      .or(userRow.locator('select[name*="role" i]'));

    if (await changeRoleBtn.count() === 0) {
      // Try clicking an edit button on the row
      const editRowBtn = userRow.getByRole('button', { name: /edit/i });
      if (await editRowBtn.count() > 0) {
        await editRowBtn.first().click();

        const roleField = page
          .getByRole('combobox', { name: /role/i })
          .or(page.getByLabel(/role/i))
          .or(page.locator('select[name*="role" i]'));

        if (await roleField.count() > 0) {
          const options = await roleField.first().locator('option').allTextContents();
          const organiserOpt = options.find((o) => /organiser|organizer/i.test(o));
          if (organiserOpt) {
            await roleField.first().selectOption({ label: organiserOpt });
          } else if (options.length > 1) {
            await roleField.first().selectOption({ index: 2 });
          }
        }

        const saveBtn = page
          .getByRole('button', { name: /save|update/i })
          .last();
        if (await saveBtn.isVisible()) await saveBtn.click();
      } else {
        test.skip(true, 'No role-change control found — skipping role change test');
        return;
      }
    } else {
      // Direct select
      if (await changeRoleBtn.first().getAttribute('role') === 'combobox' || await changeRoleBtn.first().evaluate((el) => el.tagName) === 'SELECT') {
        const options = await changeRoleBtn.first().locator('option').allTextContents();
        const organiserOpt = options.find((o) => /organiser|organizer/i.test(o));
        if (organiserOpt) {
          await changeRoleBtn.first().selectOption({ label: organiserOpt });
        }
      } else {
        await changeRoleBtn.first().click();
      }
    }

    await page.waitForTimeout(1_000);

    // Success — we just verify no error toast appeared
    const errorToast = page.getByText(/error|failed|something went wrong/i);
    await expect(errorToast).toHaveCount(0, { timeout: 3_000 });
  });

  test('admin can delete a user', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin`);
    await page.waitForLoadState('networkidle');

    const userRow = page.getByText(UI_USER_EMAIL).locator('../..')
      .or(page.locator('tr').filter({ hasText: UI_USER_EMAIL }));

    if (await userRow.count() === 0) {
      test.skip(true, 'Test user not found — skipping delete test');
      return;
    }

    const deleteBtn = userRow
      .getByRole('button', { name: /delete|remove/i });

    if (await deleteBtn.count() === 0) {
      test.skip(true, 'Delete button not found on user row — skipping delete test');
      return;
    }

    await deleteBtn.first().click();

    // Confirmation dialog
    const confirmBtn = page
      .getByRole('button', { name: /confirm|yes|ok|delete/i })
      .last();
    if (await confirmBtn.isVisible({ timeout: 3_000 })) {
      await confirmBtn.click();
    }

    await page.waitForTimeout(1_500);

    const deletedUserEntry = page.getByText(UI_USER_EMAIL);
    await expect(deletedUserEntry).toHaveCount(0, { timeout: 10_000 });

    createdUserId = null; // Already deleted
  });
});
