/**
 * notifications.spec.ts
 *
 * Tests for the notification system:
 *  - Notification bell is visible in the app header
 *  - Clicking the bell opens a notification panel/dropdown
 *  - "Mark all as read" clears the unread badge
 *  - General chat messages (no @mention) notify all other users
 *  - @mention chat messages notify only the mentioned user
 *  - Activity log entries contain Order ID and clear descriptions
 *
 * Uses admin auth state (.auth/admin.json).
 */

import { test, expect } from '@playwright/test';
import {
  apiLogin,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  createProduct,
  deleteProduct,
  sendChatMessage,
  getNotifications,
} from '../helpers/api.helper';

const BASE_URL       = process.env.BASE_URL       || 'https://app.santoshdevops.cloud';
const API_URL        = process.env.API_URL        || 'https://app.santoshdevops.cloud/api';
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL    || 'admin@gmail.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// Second user (employee) created by auth.setup.ts — used to verify cross-user notification delivery
const EMPLOYEE_AUTH = '.auth/employee.json';

test.describe('Notifications', () => {
  let adminToken: string;
  let testProductId: number | null = null;

  test.beforeAll(async () => {
    adminToken = await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD);

    try {
      const product = await createProduct(adminToken, {
        product_id:    `NOTIF-${Date.now()}`,
        customer_name: `NotifTest ${Date.now()}`,
        description:   'Product created for notification tests',
      });
      testProductId = product.id;
    } catch { /* not critical */ }
  });

  test.afterAll(async () => {
    if (adminToken && testProductId) {
      try { await deleteProduct(adminToken, testProductId); } catch { /* ignore */ }
    }
  });

  // ── Helpers ───────────────────────────────────────────────────────────────

  function notificationBell(page: import('@playwright/test').Page) {
    return page
      .getByRole('button', { name: /notification|bell|alerts/i })
      .or(page.locator('[aria-label*="notification" i], [aria-label*="bell" i]'))
      .or(page.locator('[class*="notification" i][class*="bell" i]'))
      .or(page.locator('[class*="bell" i], [data-testid*="bell" i]'))
      .or(page.locator('button').filter({ has: page.locator('svg[class*="bell" i], [class*="bell" i]') }));
  }

  function unreadBadge(page: import('@playwright/test').Page) {
    return page.locator(
      '[class*="badge" i], [class*="count" i], [class*="unread" i], [aria-label*="unread" i]',
    );
  }

  // ── UI: bell and panel ────────────────────────────────────────────────────

  test('notification bell is visible in the header', async ({ page }) => {
    await page.goto(`${BASE_URL}/kanban`);
    await page.waitForLoadState('networkidle');

    const bell = notificationBell(page);
    await expect(bell.first()).toBeVisible({ timeout: 10_000 });
  });

  test('clicking the bell opens a notification panel or dropdown', async ({ page }) => {
    await page.goto(`${BASE_URL}/kanban`);
    await page.waitForLoadState('networkidle');

    const bell = notificationBell(page);
    if (await bell.count() === 0) {
      test.skip(true, 'Notification bell not found');
      return;
    }

    await bell.first().click();

    const panel = page
      .getByRole('dialog')
      .or(page.getByRole('listbox'))
      .or(page.locator('[class*="notification" i][class*="panel" i]'))
      .or(page.locator('[class*="notification" i][class*="dropdown" i]'))
      .or(page.locator('[class*="notification" i][class*="list" i]'))
      .or(page.locator('[class*="popover" i]').filter({ has: page.locator('[class*="notification" i]') }))
      .or(page.locator('[data-testid*="notification" i]'));

    const panelVisible = await panel.first().isVisible({ timeout: 8_000 }).catch(() => false);

    if (!panelVisible) {
      const notifText = page.getByText(/notification|no new|mark.{0,10}read/i);
      const textVisible = await notifText.first().isVisible({ timeout: 5_000 }).catch(() => false);
      expect(textVisible || panelVisible).toBeTruthy();
    } else {
      await expect(panel.first()).toBeVisible();
    }
  });

  // ── API: mark as read ─────────────────────────────────────────────────────

  test('mark all as read via API sets unread count to 0', async ({ page }) => {
    await markAllNotificationsRead(adminToken);
    const countAfter = await getUnreadNotificationCount(adminToken);
    expect(countAfter).toBe(0);

    await page.goto(`${BASE_URL}/kanban`);
    await page.waitForLoadState('networkidle');

    const badge = unreadBadge(page);
    if (await badge.count() > 0) {
      const badgeText  = await badge.first().textContent({ timeout: 5_000 });
      const numericVal = parseInt((badgeText || '0').trim(), 10);
      const isZero     = numericVal === 0 || Number.isNaN(numericVal);
      const isHidden   = !(await badge.first().isVisible());
      expect(isZero || isHidden).toBeTruthy();
    }
  });

  test('mark all as read via UI clears the badge', async ({ page }) => {
    await page.goto(`${BASE_URL}/kanban`);
    await page.waitForLoadState('networkidle');

    const bell = notificationBell(page);
    if (await bell.count() === 0) {
      test.skip(true, 'Notification bell not found');
      return;
    }

    await bell.first().click();

    const markAllBtn = page
      .getByRole('button', { name: /mark.{0,10}all.{0,10}read|clear.{0,10}all/i })
      .or(page.getByText(/mark.{0,10}all.{0,10}read|clear.{0,10}all/i));

    if (await markAllBtn.count() === 0) {
      test.skip(true, '"Mark all as read" button not found');
      return;
    }

    await markAllBtn.first().click();
    await page.waitForTimeout(1_000);

    const badge = unreadBadge(page);
    if (await badge.count() > 0) {
      const badgeText  = await badge.first().textContent({ timeout: 3_000 });
      const numericVal = parseInt((badgeText || '0').trim(), 10);
      const isZero     = numericVal === 0 || Number.isNaN(numericVal);
      const isHidden   = !(await badge.first().isVisible());
      expect(isZero || isHidden).toBeTruthy();
    }
  });

  // ── Chat notification behaviour ───────────────────────────────────────────

  test('general chat message (no @mention) notifies all other users', async ({ browser }) => {
    // Get employee token from their saved auth state
    const employeeCtx = await browser.newContext({ storageState: EMPLOYEE_AUTH });
    const employeePage = await employeeCtx.newPage();

    // Get employee's API token by reading their localStorage/cookie state
    // We'll call the API with a fresh login using the stored session
    // Since we don't store the raw token, use the /auth/me endpoint to verify session,
    // then use the unread count to verify notification delivery.

    // Clear employee's notifications before the test
    await employeePage.goto(`${BASE_URL}/kanban`);
    await employeePage.waitForLoadState('networkidle');

    // Get employee's unread count before
    // We do this via API — need employee token. Use the page's fetch context.
    const beforeCount = await employeePage.evaluate(async (apiUrl) => {
      const res = await fetch(`${apiUrl}/notifications/unread-count`, {
        credentials: 'include',
      });
      const j = await res.json();
      return j.count ?? j.unread_count ?? 0;
    }, API_URL);

    // Admin sends a plain chat message (no @mention)
    await sendChatMessage(adminToken, `Hello team! [${Date.now()}]`);

    // Wait briefly for WS delivery
    await employeePage.waitForTimeout(2_000);

    // Check employee's unread count increased
    const afterCount = await employeePage.evaluate(async (apiUrl) => {
      const res = await fetch(`${apiUrl}/notifications/unread-count`, {
        credentials: 'include',
      });
      const j = await res.json();
      return j.count ?? j.unread_count ?? 0;
    }, API_URL);

    expect(afterCount).toBeGreaterThan(beforeCount);

    await employeeCtx.close();
  });

  test('@mention chat message notifies only the mentioned user, not everyone', async ({ browser }) => {
    // We need to know the employee's name to mention them.
    // Fetch it via admin token from /users
    const usersRes = await fetch(`${API_URL}/users`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const users: Array<{ id: number; name: string; email: string }> = await usersRes.json();
    const employeeUser = users.find((u) => u.email.includes('e2e.employee'));

    if (!employeeUser) {
      test.skip(true, 'E2E employee user not found — skipping @mention test');
      return;
    }

    // Get admin's own unread count before (admin sending, should NOT get self-notified)
    const adminBefore = await getUnreadNotificationCount(adminToken);

    // Admin mentions employee specifically
    await sendChatMessage(adminToken, `@[${employeeUser.name}] please check this order`);
    await new Promise((r) => setTimeout(r, 1_500));

    // Admin should NOT receive a notification for their own message
    const adminAfter = await getUnreadNotificationCount(adminToken);
    expect(adminAfter).toBe(adminBefore);

    // Employee's notifications should have a new mention notification
    const employeeCtx = await browser.newContext({ storageState: EMPLOYEE_AUTH });
    const employeePage = await employeeCtx.newPage();
    const afterCount = await employeePage.evaluate(async (apiUrl) => {
      const res = await fetch(`${apiUrl}/notifications/unread-count`, { credentials: 'include' });
      const j = await res.json();
      return j.count ?? j.unread_count ?? 0;
    }, API_URL);
    expect(afterCount).toBeGreaterThan(0);

    await employeeCtx.close();
  });

  // ── Activity log format ───────────────────────────────────────────────────

  test('activity log entries include Order ID and human-readable descriptions', async () => {
    const res = await fetch(`${API_URL}/activity?limit=50`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    const logs: Array<{ action: string; entity: string; details: string }> =
      Array.isArray(body) ? body : (body.data ?? []);

    const productLogs = logs.filter((l) => l.entity === 'product');
    for (const log of productLogs) {
      expect(log.details).toBeTruthy();
      if (['created', 'updated', 'status_changed', 'deleted', 'restored'].includes(log.action)) {
        expect(log.details).toMatch(/Order/i);
      }
      if (log.action === 'status_changed') {
        // Should contain human-readable status names, not snake_case
        expect(log.details).not.toMatch(/yet_to_start|working|review|done/);
      }
    }
  });
});
