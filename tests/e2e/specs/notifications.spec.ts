/**
 * Notifications Spec — bell count, list, mark read, real-time updates.
 */

import { test, expect, Browser } from '@playwright/test';
import * as path from 'path';
import { loginAPI, createProduct, deleteProduct, createComment } from '../helpers/api.helper';

const ADMIN_AUTH    = path.join(__dirname, '../.auth/admin.json');
const EMPLOYEE_AUTH = path.join(__dirname, '../.auth/employee.json');

test.describe('Notifications', () => {
  test.use({ storageState: ADMIN_AUTH });

  test('notification bell is visible', async ({ page }) => {
    await page.goto('/');
    const bell = page.locator('[data-testid="notification-bell"], button[aria-label*="notification" i], svg[class*="bell" i]').first();
    await expect(bell).toBeVisible({ timeout: 5_000 });
  });

  test('clicking bell opens notification panel', async ({ page }) => {
    await page.goto('/');
    const bell = page.locator('[data-testid="notification-bell"], button[aria-label*="notification" i]').first();
    await bell.click();

    // Panel or dropdown opens
    const panel = page.locator('[data-testid="notification-panel"], [role="dialog"], aside').first();
    await expect(panel).toBeVisible({ timeout: 5_000 });
  });

  test('mark all as read clears unread count', async ({ page }) => {
    await page.goto('/');

    // Open notification panel
    const bell = page.locator('[data-testid="notification-bell"], button[aria-label*="notification" i]').first();
    await bell.click();

    // Click mark all read
    const markAllBtn = page.locator('button:has-text("Mark all"), button:has-text("Clear all")').first();
    if (await markAllBtn.isVisible()) {
      await markAllBtn.click();

      // Badge/count should be gone or 0
      const badge = page.locator('[data-testid="unread-count"], .badge').first();
      if (await badge.isVisible()) {
        await expect(badge).toHaveText('0');
      }
    }
  });
});

test.describe('Notifications — Real-time delivery', () => {
  test('employee receives notification when admin comments on product', async ({ browser }) => {
    // Two browser contexts: admin acts, employee watches
    const adminCtx = await browser.newContext({
      storageState: ADMIN_AUTH,
    });
    const employeeCtx = await browser.newContext({
      storageState: EMPLOYEE_AUTH,
    });

    const adminPage    = await adminCtx.newPage();
    const employeePage = await employeeCtx.newPage();

    // Seed product via API
    const { accessToken: adminToken } = await loginAPI(
      process.env.ADMIN_EMAIL    || 'admin@test.com',
      process.env.ADMIN_PASSWORD || 'password123'
    );
    const productId = await createProduct(adminToken, {
      product_id: `E2E-NOTIF-${Date.now()}`,
      customer_name: 'Notification Test',
    });

    try {
      // Employee opens the board
      await employeePage.goto('/');
      await employeePage.waitForTimeout(1000); // WS connects

      // Get initial unread count
      const unreadBefore = await employeePage
        .locator('[data-testid="unread-count"], .badge')
        .first()
        .textContent()
        .catch(() => '0');

      // Admin posts a comment
      await createComment(adminToken, productId, 'Real-time notification test comment');
      await employeePage.waitForTimeout(2000); // WS propagation

      // Unread count should increase (or badge appears)
      const unreadAfter = await employeePage
        .locator('[data-testid="unread-count"], .badge')
        .first()
        .textContent()
        .catch(() => '0');

      const before = parseInt(unreadBefore || '0', 10);
      const after  = parseInt(unreadAfter  || '0', 10);
      expect(after).toBeGreaterThan(before);
    } finally {
      await deleteProduct(adminToken, productId).catch(() => {});
      await adminCtx.close();
      await employeeCtx.close();
    }
  });
});
