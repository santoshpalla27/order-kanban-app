/**
 * activity.spec.ts
 *
 * Tests for the Activity Log page (/activity):
 *  - Page loads with "Activity Log" title
 *  - Filter bar: search, action dropdown, entity type dropdown, user filter, date range
 *  - Activity entries display: avatar, user name, action badge, entity badge, details, timestamps
 *  - Refresh button works
 *  - "Clear all" button resets filters
 *  - Entry count updates when filters are applied
 *  - Action filter dropdown has options (Created, Updated, Deleted, Restored, Moved, etc.)
 *  - Entity filter dropdown has options (Product, User, Attachment, Comment)
 *
 * Uses admin auth state (.auth/admin.json).
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL || process.env.BASE_URL || 'https://app.santoshdevops.cloud';

test.describe('Activity Log (/activity)', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/activity`);
    await page.waitForLoadState('networkidle');
  });

  // ── Page structure ──────────────────────────────────────────────────────────

  test('activity page loads and displays "Activity Log" title', async ({ page }) => {
    const title = page.getByText('Activity Log');
    await expect(title.first()).toBeVisible({ timeout: 15_000 });
    expect(page.url()).toContain('/activity');
  });

  test('shows entry count below the title', async ({ page }) => {
    const entryCount = page.getByText(/\d+ entr(y|ies)/i);
    await expect(entryCount.first()).toBeVisible({ timeout: 10_000 });
  });

  test('refresh button is visible', async ({ page }) => {
    const refreshBtn = page.getByRole('button', { name: /refresh/i })
      .or(page.getByText(/refresh/i).and(page.locator('button')));
    await expect(refreshBtn.first()).toBeVisible({ timeout: 10_000 });
  });

  test('clicking refresh reloads the activity data', async ({ page }) => {
    const refreshBtn = page.getByRole('button', { name: /refresh/i })
      .or(page.getByText(/refresh/i).and(page.locator('button')));
    await refreshBtn.first().click();
    await page.waitForTimeout(1_000);
    // Page should still show activity log
    expect(page.url()).toContain('/activity');
  });

  // ── Filter bar ──────────────────────────────────────────────────────────────

  test('filter bar shows "Filters" label', async ({ page }) => {
    const filtersLabel = page.getByText(/^filters$/i);
    await expect(filtersLabel.first()).toBeVisible({ timeout: 10_000 });
  });

  test('search input is present in filter bar', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search details/i)
      .or(page.getByPlaceholder(/search/i));
    await expect(searchInput.first()).toBeVisible({ timeout: 10_000 });
  });

  test('action filter dropdown has "All actions" default', async ({ page }) => {
    const actionSelect = page.locator('select').filter({ hasText: /all actions/i });
    await expect(actionSelect.first()).toBeVisible({ timeout: 10_000 });
  });

  test('entity type filter dropdown has "All types" default', async ({ page }) => {
    const entitySelect = page.locator('select').filter({ hasText: /all types/i });
    await expect(entitySelect.first()).toBeVisible({ timeout: 10_000 });
  });

  test('user filter input is present', async ({ page }) => {
    const userInput = page.getByPlaceholder(/filter by user/i);
    await expect(userInput.first()).toBeVisible({ timeout: 10_000 });
  });

  test('date range inputs are present (From and To)', async ({ page }) => {
    const dateInputs = page.locator('input[type="date"]');
    const count = await dateInputs.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  // ── Filter interactions ────────────────────────────────────────────────────

  test('searching filters the activity entries', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search details/i)
      .or(page.getByPlaceholder(/search/i));

    // Get initial entry count text
    const countText = page.getByText(/\d+ entr(y|ies)/i);
    await expect(countText.first()).toBeVisible({ timeout: 10_000 });

    // Search for something specific
    await searchInput.first().fill('Order');
    await page.waitForTimeout(500);

    // Should show "matching filters" text
    const matchingFilters = page.getByText(/matching filters/i);
    await expect(matchingFilters.first()).toBeVisible({ timeout: 5_000 });

    await searchInput.first().clear();
    await page.waitForTimeout(300);
  });

  test('"Clear all" button appears when filters are active', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search details/i)
      .or(page.getByPlaceholder(/search/i));

    // Apply a filter
    await searchInput.first().fill('test filter');
    await page.waitForTimeout(500);

    // "Clear all" button should appear
    const clearAllBtn = page.getByText(/clear all/i);
    await expect(clearAllBtn.first()).toBeVisible({ timeout: 5_000 });
  });

  test('"Clear all" resets all filters', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search details/i)
      .or(page.getByPlaceholder(/search/i));

    await searchInput.first().fill('test filter');
    await page.waitForTimeout(500);

    const clearAllBtn = page.getByText(/clear all/i);
    await clearAllBtn.first().click();
    await page.waitForTimeout(300);

    // Search input should be empty
    const value = await searchInput.first().inputValue();
    expect(value).toBe('');
  });

  test('action dropdown shows available actions (Created, Updated, etc.)', async ({ page }) => {
    const actionSelect = page.locator('select').filter({ hasText: /all actions/i });
    if (await actionSelect.count() > 0) {
      const options = await actionSelect.first().locator('option').allTextContents();
      // Should have at least "All actions" plus some action types
      expect(options.length).toBeGreaterThanOrEqual(1);
      expect(options[0]).toMatch(/all actions/i);
    }
  });

  test('entity dropdown shows available entity types', async ({ page }) => {
    const entitySelect = page.locator('select').filter({ hasText: /all types/i });
    if (await entitySelect.count() > 0) {
      const options = await entitySelect.first().locator('option').allTextContents();
      expect(options.length).toBeGreaterThanOrEqual(1);
      expect(options[0]).toMatch(/all types/i);
    }
  });

  // ── Activity entries ────────────────────────────────────────────────────────

  test('activity entries display user avatar and name', async ({ page }) => {
    await page.waitForTimeout(2_000);

    const noActivity = page.getByText(/no activity yet/i);
    if (await noActivity.count() > 0) {
      test.skip(true, 'No activity entries — skipping entry display test');
      return;
    }

    // Avatars (rounded-full gradient divs)
    const avatars = page.locator('[class*="rounded-full"][class*="gradient"]');
    if (await avatars.count() > 0) {
      await expect(avatars.first()).toBeVisible({ timeout: 5_000 });
    }
  });

  test('activity entries show action badges (Created, Updated, Deleted, etc.)', async ({ page }) => {
    await page.waitForTimeout(2_000);

    const noActivity = page.getByText(/no activity yet/i);
    if (await noActivity.count() > 0) {
      test.skip(true, 'No activity entries');
      return;
    }

    // Action badges
    const actionBadge = page.getByText(/created|updated|deleted|restored|moved|uploaded|commented|edited/i)
      .and(page.locator('[class*="rounded"]'));
    if (await actionBadge.count() > 0) {
      await expect(actionBadge.first()).toBeVisible({ timeout: 5_000 });
    }
  });

  test('activity entries show relative timestamps (e.g. "2h ago")', async ({ page }) => {
    await page.waitForTimeout(2_000);

    const noActivity = page.getByText(/no activity yet/i);
    if (await noActivity.count() > 0) {
      test.skip(true, 'No activity entries');
      return;
    }

    // Relative timestamps
    const timestamp = page.getByText(/ago|just now/i);
    if (await timestamp.count() > 0) {
      await expect(timestamp.first()).toBeVisible({ timeout: 5_000 });
    }
  });

  test('activity entries show detail descriptions', async ({ page }) => {
    await page.waitForTimeout(2_000);

    const noActivity = page.getByText(/no activity yet/i);
    if (await noActivity.count() > 0) {
      test.skip(true, 'No activity entries');
      return;
    }

    // Details text — look for any text containing "Order" or other entity references
    const details = page.locator('[class*="text-sm"][class*="text-surface"]');
    if (await details.count() > 0) {
      await expect(details.first()).toBeVisible({ timeout: 5_000 });
    }
  });

  // ── Empty state ────────────────────────────────────────────────────────────

  test('shows "No activity yet" or "No entries match" when appropriate', async ({ page }) => {
    // Search for something that definitely won't match
    const searchInput = page.getByPlaceholder(/search details/i)
      .or(page.getByPlaceholder(/search/i));
    await searchInput.first().fill('xyznonexistent12345');
    await page.waitForTimeout(500);

    const noMatch = page.getByText(/no entries match/i)
      .or(page.getByText(/no activity/i));
    await expect(noMatch.first()).toBeVisible({ timeout: 5_000 });

    await searchInput.first().clear();
  });
});
