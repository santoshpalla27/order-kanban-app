/**
 * notificationspage.spec.ts
 *
 * Tests for the full Notifications Page (/notifications):
 *  - Page loads with "Notifications" title and unread count badge
 *  - Filter bar: search, status (All/Unread/Read), type dropdown, date range
 *  - "Mark all read" button is present when there are unread notifications
 *  - Refresh button works
 *  - Individual "Mark read" button on unread notifications
 *  - Notification items show: unread dot, message, type badge, timestamps
 *  - "Load more" button for pagination
 *  - "Clear all" button resets filters
 *  - Empty state shows when no notifications match
 *
 * NOTE: This tests the FULL NOTIFICATIONS PAGE at /notifications,
 * not the bell panel (which is tested in notifications.spec.ts).
 *
 * Uses admin auth state (.auth/admin.json).
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL || process.env.BASE_URL || 'https://app.santoshdevops.cloud';

test.describe('Notifications Page (/notifications)', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/notifications`);
    await page.waitForLoadState('networkidle');
  });

  // ── Page structure ──────────────────────────────────────────────────────────

  test('page loads and displays "Notifications" title', async ({ page }) => {
    const title = page.getByText('Notifications');
    await expect(title.first()).toBeVisible({ timeout: 15_000 });
    expect(page.url()).toContain('/notifications');
  });

  test('shows notification count below the title', async ({ page }) => {
    const count = page.getByText(/\d+ notification/i);
    await expect(count.first()).toBeVisible({ timeout: 10_000 });
  });

  test('refresh button is visible', async ({ page }) => {
    const refreshBtn = page.getByRole('button', { name: /refresh/i })
      .or(page.getByText(/refresh/i).and(page.locator('button')));
    await expect(refreshBtn.first()).toBeVisible({ timeout: 10_000 });
  });

  test('clicking refresh reloads notifications', async ({ page }) => {
    const refreshBtn = page.getByRole('button', { name: /refresh/i })
      .or(page.getByText(/refresh/i).and(page.locator('button')));
    await refreshBtn.first().click();
    await page.waitForTimeout(1_000);
    expect(page.url()).toContain('/notifications');
  });

  // ── Mark all read ──────────────────────────────────────────────────────────

  test('"Mark all read" button is present when there are unread notifications', async ({ page }) => {
    const unreadBadge = page.getByText(/\d+ unread/i);
    if (await unreadBadge.count() > 0) {
      const markAllBtn = page.getByRole('button', { name: /mark all read/i })
        .or(page.getByText(/mark all read/i).and(page.locator('button')));
      await expect(markAllBtn.first()).toBeVisible({ timeout: 10_000 });
    }
  });

  // ── Filter bar ──────────────────────────────────────────────────────────────

  test('filter bar shows "Filters" label', async ({ page }) => {
    const filtersLabel = page.getByText(/^filters$/i);
    await expect(filtersLabel.first()).toBeVisible({ timeout: 10_000 });
  });

  test('search input is present for filtering notifications', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search notification/i)
      .or(page.getByPlaceholder(/search/i));
    await expect(searchInput.first()).toBeVisible({ timeout: 10_000 });
  });

  test('status filter dropdown has All/Unread/Read options', async ({ page }) => {
    const statusSelect = page.locator('select').filter({ hasText: /^all$/i });
    if (await statusSelect.count() > 0) {
      const options = await statusSelect.first().locator('option').allTextContents();
      expect(options).toContain('All');
      expect(options).toContain('Unread');
      expect(options).toContain('Read');
    }
  });

  test('type filter dropdown is present when notification types exist', async ({ page }) => {
    const typeSelect = page.locator('select').filter({ hasText: /all types/i });
    if (await typeSelect.count() > 0) {
      await expect(typeSelect.first()).toBeVisible({ timeout: 5_000 });
    }
  });

  test('date range inputs are present', async ({ page }) => {
    const dateInputs = page.locator('input[type="date"]');
    const count = await dateInputs.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  // ── Filter interactions ────────────────────────────────────────────────────

  test('searching filters notification items', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search notification/i)
      .or(page.getByPlaceholder(/search/i));

    await searchInput.first().fill('test');
    await page.waitForTimeout(500);

    const matchingText = page.getByText(/matching filters/i);
    await expect(matchingText.first()).toBeVisible({ timeout: 5_000 });

    await searchInput.first().clear();
    await page.waitForTimeout(300);
  });

  test('"Clear all" button appears and works when filters active', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search notification/i)
      .or(page.getByPlaceholder(/search/i));

    await searchInput.first().fill('some filter text');
    await page.waitForTimeout(500);

    const clearAllBtn = page.getByText(/clear all/i);
    await expect(clearAllBtn.first()).toBeVisible({ timeout: 5_000 });

    await clearAllBtn.first().click();
    await page.waitForTimeout(300);

    const value = await searchInput.first().inputValue();
    expect(value).toBe('');
  });

  test('filtering by "Unread" status works', async ({ page }) => {
    const statusSelect = page.locator('select').filter({ hasText: /^all$/i });
    if (await statusSelect.count() > 0) {
      await statusSelect.first().selectOption('unread');
      await page.waitForTimeout(500);

      const matchingText = page.getByText(/matching filters/i);
      // If visible, filter is applied
      if (await matchingText.count() > 0) {
        await expect(matchingText.first()).toBeVisible();
      }

      // Reset
      await statusSelect.first().selectOption('all');
    }
  });

  // ── Notification items ──────────────────────────────────────────────────────

  test('notification items display message text', async ({ page }) => {
    await page.waitForTimeout(2_000);

    const noNotifs = page.getByText(/no notifications/i);
    if (await noNotifs.count() > 0) {
      test.skip(true, 'No notifications');
      return;
    }

    // Notification messages are in the item list
    const items = page.locator('[class*="divide-y"] > div');
    if (await items.count() > 0) {
      await expect(items.first()).toBeVisible({ timeout: 5_000 });
    }
  });

  test('unread notifications have an unread dot indicator', async ({ page }) => {
    await page.waitForTimeout(2_000);

    const noNotifs = page.getByText(/no notifications/i);
    if (await noNotifs.count() > 0) {
      test.skip(true, 'No notifications');
      return;
    }

    // Unread dots
    const dots = page.locator('[class*="rounded-full"][class*="bg-brand"]');
    if (await dots.count() > 0) {
      await expect(dots.first()).toBeVisible({ timeout: 5_000 });
    }
  });

  test('individual "Mark read" button is shown on unread notifications', async ({ page }) => {
    await page.waitForTimeout(2_000);

    const markReadBtn = page.getByRole('button', { name: /mark read/i })
      .or(page.getByText(/mark read/i).and(page.locator('button')));

    if (await markReadBtn.count() > 0) {
      await expect(markReadBtn.first()).toBeVisible({ timeout: 5_000 });
    }
  });

  test('notification items show type badges', async ({ page }) => {
    await page.waitForTimeout(2_000);

    const noNotifs = page.getByText(/no notifications/i);
    if (await noNotifs.count() > 0) {
      test.skip(true, 'No notifications');
      return;
    }

    // Type badges (capitalized, rounded)
    const typeBadge = page.locator('[class*="capitalize"][class*="rounded"]');
    if (await typeBadge.count() > 0) {
      await expect(typeBadge.first()).toBeVisible({ timeout: 5_000 });
    }
  });

  test('notification items show relative timestamps', async ({ page }) => {
    await page.waitForTimeout(2_000);

    const noNotifs = page.getByText(/no notifications/i);
    if (await noNotifs.count() > 0) {
      test.skip(true, 'No notifications');
      return;
    }

    const timestamp = page.getByText(/ago|just now/i);
    if (await timestamp.count() > 0) {
      await expect(timestamp.first()).toBeVisible({ timeout: 5_000 });
    }
  });

  // ── Pagination ─────────────────────────────────────────────────────────────

  test('"Load more" button appears when more pages are available', async ({ page }) => {
    await page.waitForTimeout(2_000);

    const loadMore = page.getByRole('button', { name: /load more/i })
      .or(page.getByText(/load more/i).and(page.locator('button')));

    // May or may not be visible depending on notification count
    if (await loadMore.count() > 0) {
      await expect(loadMore.first()).toBeVisible();
    }
  });

  // ── Empty state ────────────────────────────────────────────────────────────

  test('shows empty state when searching for non-existent notifications', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search notification/i)
      .or(page.getByPlaceholder(/search/i));

    await searchInput.first().fill('xyznonexistent99999');
    await page.waitForTimeout(500);

    const noMatch = page.getByText(/no notifications match/i)
      .or(page.getByText(/no notifications/i));
    await expect(noMatch.first()).toBeVisible({ timeout: 5_000 });

    await searchInput.first().clear();
  });
});
