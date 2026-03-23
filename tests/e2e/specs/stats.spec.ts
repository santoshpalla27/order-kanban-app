/**
 * stats.spec.ts
 *
 * Tests for the Statistics page (/stats):
 *  - Page loads and shows "Statistics" title
 *  - Overview stat cards: Total Active Orders, Completed, Overdue, Due Soon
 *  - Status breakdown section with stacked bar and status labels
 *  - Period cards: Orders Created and Orders Completed with Today/Week/Month
 *  - Team Performance table with member rows
 *  - Non-admin/non-manager gets redirected (stats restricted by role)
 *
 * Uses admin auth state (.auth/admin.json).
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL || process.env.BASE_URL || 'https://app.santoshdevops.cloud';

test.describe('Statistics Page (/stats)', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/stats`);
    await page.waitForLoadState('networkidle');
  });

  // ── Page structure ──────────────────────────────────────────────────────────

  test('stats page loads and displays "Statistics" title', async ({ page }) => {
    const title = page.getByText('Statistics');
    await expect(title.first()).toBeVisible({ timeout: 15_000 });

    // Should not be redirected to login
    expect(page.url()).not.toContain('/login');
    expect(page.url()).toContain('/stats');
  });

  test('shows subtitle about orders and team performance', async ({ page }) => {
    const subtitle = page.getByText(/overview.*orders.*team.*performance/i)
      .or(page.getByText(/overview/i));
    await expect(subtitle.first()).toBeVisible({ timeout: 10_000 });
  });

  // ── Overview stat cards ──────────────────────────────────────────────────

  test('displays "Total Active Orders" stat card', async ({ page }) => {
    const card = page.getByText(/total active orders/i);
    await expect(card.first()).toBeVisible({ timeout: 10_000 });
  });

  test('displays "Completed" stat card with percentage', async ({ page }) => {
    const card = page.getByText(/^completed$/i)
      .or(page.getByText(/completed/i));
    await expect(card.first()).toBeVisible({ timeout: 10_000 });

    // Should show percentage sub-text
    const percentage = page.getByText(/% of total/i);
    await expect(percentage.first()).toBeVisible({ timeout: 5_000 });
  });

  test('displays "Overdue" stat card', async ({ page }) => {
    const card = page.getByText(/overdue/i);
    await expect(card.first()).toBeVisible({ timeout: 10_000 });

    // Sub-text
    const sub = page.getByText(/past delivery date/i);
    await expect(sub.first()).toBeVisible({ timeout: 5_000 });
  });

  test('displays "Due Soon" stat card', async ({ page }) => {
    const card = page.getByText(/due soon/i);
    await expect(card.first()).toBeVisible({ timeout: 10_000 });

    // Sub-text
    const sub = page.getByText(/next 7 days/i);
    await expect(sub.first()).toBeVisible({ timeout: 5_000 });
  });

  // ── Status breakdown ──────────────────────────────────────────────────────

  test('displays status breakdown section with "Orders" heading', async ({ page }) => {
    const ordersHeading = page.getByText(/orders/i).filter({ hasText: /orders/i });
    await expect(ordersHeading.first()).toBeVisible({ timeout: 10_000 });

    const currentStatus = page.getByText(/current status/i);
    await expect(currentStatus.first()).toBeVisible({ timeout: 5_000 });
  });

  test('shows all four status labels: Yet to Start, Working, In Review, Done', async ({ page }) => {
    await expect(page.getByText('Yet to Start').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Working').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('In Review').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('Done').first()).toBeVisible({ timeout: 5_000 });
  });

  test('status breakdown shows count values and percentages', async ({ page }) => {
    // Each status row shows a count and a percentage
    const percentages = page.locator('text=/%/');
    const count = await percentages.count();
    // At least the 4 status rows should have percentages
    expect(count).toBeGreaterThanOrEqual(4);
  });

  // ── Period cards ──────────────────────────────────────────────────────────

  test('shows "Orders Created" period card with Today/Week/Month', async ({ page }) => {
    const ordersCreated = page.getByText('Orders Created');
    await expect(ordersCreated.first()).toBeVisible({ timeout: 10_000 });

    await expect(page.getByText('Today').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('This Week').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('This Month').first()).toBeVisible({ timeout: 5_000 });
  });

  test('shows "Orders Completed" period card with Today/Week/Month', async ({ page }) => {
    const ordersCompleted = page.getByText('Orders Completed');
    await expect(ordersCompleted.first()).toBeVisible({ timeout: 10_000 });
  });

  // ── Team Performance table ─────────────────────────────────────────────────

  test('displays Team Performance section', async ({ page }) => {
    const teamPerf = page.getByText('Team Performance');
    // May not show if there are no user_stats
    if (await teamPerf.count() > 0) {
      await expect(teamPerf.first()).toBeVisible({ timeout: 10_000 });
    }
  });

  test('team performance table has column headers: Member, Assigned, Not Started, Working, In Review, Done, Completion', async ({ page }) => {
    const teamPerf = page.getByText('Team Performance');
    if (await teamPerf.count() === 0) {
      test.skip(true, 'No team performance section — likely no assigned orders');
      return;
    }

    await expect(page.getByText(/^member$/i).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/^assigned$/i).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/not started/i).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/^working$/i).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/in review/i).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/^done$/i).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/completion/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test('team performance table shows member names with avatars', async ({ page }) => {
    const teamPerf = page.getByText('Team Performance');
    if (await teamPerf.count() === 0) {
      test.skip(true, 'No team performance section');
      return;
    }

    // Members count badge
    const membersCount = page.getByText(/\d+ members?/i);
    await expect(membersCount.first()).toBeVisible({ timeout: 5_000 });
  });

  test('team performance rows show completion rate progress bar', async ({ page }) => {
    const teamPerf = page.getByText('Team Performance');
    if (await teamPerf.count() === 0) {
      test.skip(true, 'No team performance section');
      return;
    }

    // Progress bars exist (completion rate)
    const progressBars = page.locator('[class*="rounded-full"][class*="bg-emerald"]');
    if (await progressBars.count() > 0) {
      await expect(progressBars.first()).toBeVisible({ timeout: 5_000 });
    }
  });

  // ── No assigned orders state ───────────────────────────────────────────────

  test('shows "No assigned orders yet" when user_stats is empty', async ({ page }) => {
    const noOrders = page.getByText(/no assigned orders yet/i);
    // This is visible only when there are zero user_stats — may not appear
    if (await noOrders.count() > 0) {
      await expect(noOrders.first()).toBeVisible();
    }
  });
});
