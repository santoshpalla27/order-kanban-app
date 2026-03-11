/**
 * RBAC Spec — UI elements shown/hidden by role, protected route access.
 */

import { test, expect } from '@playwright/test';
import * as path from 'path';

const AUTH = {
  admin:     path.join(__dirname, '../.auth/admin.json'),
  manager:   path.join(__dirname, '../.auth/manager.json'),
  organiser: path.join(__dirname, '../.auth/organiser.json'),
  employee:  path.join(__dirname, '../.auth/employee.json'),
  viewonly:  path.join(__dirname, '../.auth/viewonly.json'),
};

// ─── Admin ────────────────────────────────────────────────────────────────────

test.describe('Admin role', () => {
  test.use({ storageState: AUTH.admin });

  test('sees New Product button', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('button:has-text("New Product")')).toBeVisible();
  });

  test('sees Trash nav link', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('nav a[href="/trash"], a:has-text("Trash")')).toBeVisible();
  });

  test('can access /admin panel', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('can access /trash', async ({ page }) => {
    await page.goto('/trash');
    await expect(page).not.toHaveURL(/\/login/);
  });
});

// ─── Manager ──────────────────────────────────────────────────────────────────

test.describe('Manager role', () => {
  test.use({ storageState: AUTH.manager });

  test('sees New Product button', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('button:has-text("New Product")')).toBeVisible();
  });

  test('sees Trash nav link', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('nav a[href="/trash"], a:has-text("Trash")')).toBeVisible();
  });

  test('cannot access /admin panel — redirected', async ({ page }) => {
    await page.goto('/admin');
    // Should redirect away from admin
    await expect(page).not.toHaveURL('/admin');
  });
});

// ─── Organiser ────────────────────────────────────────────────────────────────

test.describe('Organiser role', () => {
  test.use({ storageState: AUTH.organiser });

  test('sees New Product button', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('button:has-text("New Product")')).toBeVisible();
  });

  test('does NOT see Trash nav link', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('nav a[href="/trash"], a:has-text("Trash")')).not.toBeVisible();
  });

  test('cannot access /trash — redirected', async ({ page }) => {
    await page.goto('/trash');
    await expect(page).not.toHaveURL('/trash');
  });

  test('cannot access /admin — redirected', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).not.toHaveURL('/admin');
  });
});

// ─── Employee ─────────────────────────────────────────────────────────────────

test.describe('Employee role', () => {
  test.use({ storageState: AUTH.employee });

  test('does NOT see New Product button', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('button:has-text("New Product")')).not.toBeVisible();
  });

  test('does NOT see Trash nav link', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('nav a[href="/trash"], a:has-text("Trash")')).not.toBeVisible();
  });

  test('can see the kanban board', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=Yet to Start')).toBeVisible({ timeout: 8_000 });
  });

  test('can post a comment (comment textarea visible)', async ({ page }) => {
    await page.goto('/');
    // Click any product card
    const card = page.locator('.card, [class*="card"]').first();
    if (await card.isVisible()) {
      await card.click();
      const modal = page.locator('[role="dialog"]').first();
      const commentsTab = modal.locator('button:has-text("Comments"), [role="tab"]:has-text("Comments")').first();
      if (await commentsTab.isVisible()) await commentsTab.click();

      // Comment input should be visible for employee
      const textarea = modal.locator('textarea, input[placeholder*="comment" i]').last();
      await expect(textarea).toBeVisible();
    }
  });
});

// ─── View Only ────────────────────────────────────────────────────────────────

test.describe('View Only role', () => {
  test.use({ storageState: AUTH.viewonly });

  test('does NOT see New Product button', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('button:has-text("New Product")')).not.toBeVisible();
  });

  test('does NOT see Trash nav link', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('nav a[href="/trash"], a:has-text("Trash")')).not.toBeVisible();
  });

  test('can view the kanban board', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=Yet to Start')).toBeVisible({ timeout: 8_000 });
  });

  test('cannot post a comment — input hidden or disabled', async ({ page }) => {
    await page.goto('/');
    const card = page.locator('.card, [class*="card"]').first();
    if (await card.isVisible()) {
      await card.click();
      const modal = page.locator('[role="dialog"]').first();
      const commentsTab = modal.locator('button:has-text("Comments"), [role="tab"]:has-text("Comments")').first();
      if (await commentsTab.isVisible()) await commentsTab.click();

      // Comment input should NOT be visible for view_only
      const textarea = modal.locator('textarea, input[placeholder*="comment" i]').last();
      await expect(textarea).not.toBeVisible();
    }
  });
});
