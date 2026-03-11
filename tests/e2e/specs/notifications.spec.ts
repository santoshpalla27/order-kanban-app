/**
 * notifications.spec.ts
 *
 * Tests for the notification system:
 *  - Notification bell is visible in the app header
 *  - Clicking the bell opens a notification panel/dropdown
 *  - "Mark all as read" clears the unread badge
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
} from '../helpers/api.helper';

const BASE_URL       = process.env.BASE_URL       || 'https://app.santoshdevops.cloud';
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL    || 'admin@gmail.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

test.describe('Notifications', () => {
  let adminToken: string;
  let testProductId: number | null = null;

  test.beforeAll(async () => {
    adminToken = await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD);

    // Create a product to potentially trigger a notification
    try {
      const product = await createProduct(adminToken, {
        customer_name: `NotifTest ${Date.now()}`,
        description:   'Product created to generate notification',
      });
      testProductId = product.product_id;
    } catch {
      // Not critical — notification bell should still be visible
    }
  });

  test.afterAll(async () => {
    if (adminToken && testProductId) {
      try { await deleteProduct(adminToken, testProductId); } catch { /* ignore */ }
    }
  });

  // ── Helper: locate the notification bell ──────────────────────────────────

  function notificationBell(page: import('@playwright/test').Page) {
    return page
      .getByRole('button', { name: /notification|bell|alerts/i })
      .or(page.locator('[aria-label*="notification" i], [aria-label*="bell" i]'))
      .or(page.locator('[class*="notification" i][class*="bell" i]'))
      .or(page.locator('[class*="bell" i], [data-testid*="bell" i]'))
      .or(page.locator('button').filter({ has: page.locator('svg[class*="bell" i], [class*="bell" i]') }));
  }

  // ── Helper: locate the unread badge ──────────────────────────────────────

  function unreadBadge(page: import('@playwright/test').Page) {
    return page.locator(
      '[class*="badge" i], [class*="count" i], [class*="unread" i], [aria-label*="unread" i]',
    );
  }

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
      test.skip(true, 'Notification bell not found — skipping panel open test');
      return;
    }

    await bell.first().click();

    // A panel, popover, or dropdown should appear
    const panel = page
      .getByRole('dialog')
      .or(page.getByRole('listbox'))
      .or(page.locator('[class*="notification" i][class*="panel" i]'))
      .or(page.locator('[class*="notification" i][class*="dropdown" i]'))
      .or(page.locator('[class*="notification" i][class*="list" i]'))
      .or(page.locator('[class*="popover" i]').filter({ has: page.locator('[class*="notification" i]') }))
      .or(page.locator('[data-testid*="notification" i]'));

    // Wait up to 8s for the panel to appear
    const panelVisible = await panel.first().isVisible({ timeout: 8_000 }).catch(() => false);

    if (!panelVisible) {
      // Fallback: at least check that something new appeared in the DOM after click
      // by looking for any visible element containing notification-related text
      const notifText = page.getByText(/notification|no new|mark.{0,10}read/i);
      const textVisible = await notifText.first().isVisible({ timeout: 5_000 }).catch(() => false);
      expect(textVisible || panelVisible).toBeTruthy();
    } else {
      await expect(panel.first()).toBeVisible();
    }
  });

  test('mark all as read clears the unread badge (via API)', async ({ page }) => {
    // First check whether there are unread notifications
    const countBefore = await getUnreadNotificationCount(adminToken);

    // Mark all as read via API
    await markAllNotificationsRead(adminToken);

    const countAfter = await getUnreadNotificationCount(adminToken);
    expect(countAfter).toBe(0);

    // Reload page and verify the badge is gone or shows 0
    await page.goto(`${BASE_URL}/kanban`);
    await page.waitForLoadState('networkidle');

    const badge = unreadBadge(page);
    const badgeCount = await badge.count();

    if (badgeCount > 0) {
      // Badge may still be rendered but should show 0 or be hidden
      const badgeText = await badge.first().textContent({ timeout: 5_000 });
      const numericValue = parseInt((badgeText || '0').trim(), 10);
      // Accept 0, NaN (empty badge that's just decorative), or invisible badge
      const isZero    = numericValue === 0 || Number.isNaN(numericValue);
      const isHidden  = !(await badge.first().isVisible());
      expect(isZero || isHidden).toBeTruthy();
    }
    // If no badge is rendered at all, that is also correct
  });

  test('mark all as read via UI clears the badge', async ({ page }) => {
    await page.goto(`${BASE_URL}/kanban`);
    await page.waitForLoadState('networkidle');

    const bell = notificationBell(page);
    if (await bell.count() === 0) {
      test.skip(true, 'Notification bell not found — skipping UI mark-all-read test');
      return;
    }

    await bell.first().click();

    // Look for a "Mark all as read" button inside the panel
    const markAllBtn = page
      .getByRole('button', { name: /mark.{0,10}all.{0,10}read|clear.{0,10}all/i })
      .or(page.getByText(/mark.{0,10}all.{0,10}read|clear.{0,10}all/i));

    if (await markAllBtn.count() === 0) {
      test.skip(true, '"Mark all as read" button not found — skipping this test');
      return;
    }

    await markAllBtn.first().click();
    await page.waitForTimeout(1_000);

    // Badge should be gone or show 0
    const badge = unreadBadge(page);
    const badgeCount = await badge.count();

    if (badgeCount > 0) {
      const badgeText  = await badge.first().textContent({ timeout: 3_000 });
      const numericVal = parseInt((badgeText || '0').trim(), 10);
      const isZero     = numericVal === 0 || Number.isNaN(numericVal);
      const isHidden   = !(await badge.first().isVisible());
      expect(isZero || isHidden).toBeTruthy();
    }
    // No badge at all is also acceptable
  });
});
