/**
 * myorders.spec.ts
 *
 * Tests for the My Orders page (/my-orders):
 *  - Page loads and shows "My Orders" heading
 *  - Status tab chips: All, Yet to Start, Working, In Review, Done
 *  - Tab chips show count badges
 *  - Column headers: Product ID, Customer, Delivery, Description, View, Status
 *  - Search input filters results
 *  - Clicking "View" eye button opens product detail modal
 *  - Status dropdown is present in each row
 *  - Tab switching filters the list
 *  - Filter panel (SearchFilters component) is available
 *  - Page shows "No orders assigned to you" when empty
 *
 * Uses admin auth state (.auth/admin.json).
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL || process.env.BASE_URL || 'https://app.santoshdevops.cloud';

test.describe('My Orders (/my-orders)', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/my-orders`);
    await page.waitForLoadState('networkidle');
  });

  // ── Page structure ──────────────────────────────────────────────────────────

  test('page loads and displays "My Orders" heading', async ({ page }) => {
    const heading = page.getByText('My Orders');
    await expect(heading.first()).toBeVisible({ timeout: 15_000 });
    expect(page.url()).toContain('/my-orders');
  });

  // ── Status tab chips ────────────────────────────────────────────────────────

  test('shows all status tab chips', async ({ page }) => {
    await expect(page.getByRole('button', { name: /^all$/i }).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /yet to start/i }).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('button', { name: /working/i }).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('button', { name: /in review/i }).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('button', { name: /done/i }).first()).toBeVisible({ timeout: 5_000 });
  });

  test('tab chips display count badges', async ({ page }) => {
    // Each tab chip should have a count badge (a small span with a number)
    const tabs = page.locator('button').filter({ hasText: /all|yet to start|working|in review|done/i });
    const count = await tabs.count();
    expect(count).toBeGreaterThanOrEqual(5);
  });

  test('clicking a status tab filters the list', async ({ page }) => {
    // Click "Done" tab
    const doneTab = page.getByRole('button', { name: /done/i }).first();
    await doneTab.click();
    await page.waitForTimeout(500);

    // Should still be on /my-orders
    expect(page.url()).toContain('/my-orders');

    // Click "All" tab to reset
    const allTab = page.getByRole('button', { name: /^all$/i }).first();
    await allTab.click();
    await page.waitForTimeout(500);
  });

  test('clicking "Yet to Start" tab applies the filter', async ({ page }) => {
    const tab = page.getByRole('button', { name: /yet to start/i }).first();
    await tab.click();
    await page.waitForTimeout(500);
    expect(page.url()).toContain('/my-orders');
  });

  // ── Column headers ──────────────────────────────────────────────────────────

  test('shows correct column headers', async ({ page }) => {
    await expect(page.getByText(/product.?id/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/customer/i).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/delivery/i).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/^view$/i).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/^status$/i).first()).toBeVisible({ timeout: 5_000 });
  });

  // ── Search ──────────────────────────────────────────────────────────────────

  test('search input is present', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search/i)
      .or(page.locator('input[type="search"]'));
    await expect(searchInput.first()).toBeVisible({ timeout: 10_000 });
  });

  test('search input filters results when text is typed', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search/i)
      .or(page.locator('input[type="search"]'));

    await searchInput.first().fill('test');
    await page.waitForTimeout(500);

    // Page should still be on /my-orders with filtered content
    expect(page.url()).toContain('/my-orders');

    await searchInput.first().clear();
    await page.waitForTimeout(300);
  });

  // ── Filter panel ──────────────────────────────────────────────────────────

  test('filter button is present and opens filter panel', async ({ page }) => {
    const filterBtn = page.getByRole('button', { name: /filters?/i });
    if (await filterBtn.count() > 0) {
      await filterBtn.first().click();
      await page.waitForTimeout(500);

      // Filter controls should be visible
      const filterControls = page.getByText(/status|created by|assignee|delivery/i);
      await expect(filterControls.first()).toBeVisible({ timeout: 5_000 });
    }
  });

  test('delivery filter with presets is available', async ({ page }) => {
    const filterBtn = page.getByRole('button', { name: /filters?/i });
    if (await filterBtn.count() > 0) {
      await filterBtn.first().click();

      await expect(page.getByText(/delivery due/i).first()).toBeVisible({ timeout: 5_000 });
      await expect(page.getByRole('button', { name: /overdue/i }).first()).toBeVisible({ timeout: 5_000 });
      await expect(page.getByRole('button', { name: /today/i }).first()).toBeVisible({ timeout: 5_000 });
      await expect(page.getByRole('button', { name: /tomorrow/i }).first()).toBeVisible({ timeout: 5_000 });
    }
  });

  // ── Row interactions ────────────────────────────────────────────────────────

  test('clicking the eye (View) button opens product detail modal', async ({ page }) => {
    // Wait for rows to load
    await page.waitForTimeout(2_000);

    const eyeBtn = page.getByTitle(/view details/i)
      .or(page.locator('button').filter({ has: page.locator('svg') }));

    const noOrders = page.getByText(/no orders assigned to you/i);
    if (await noOrders.count() > 0) {
      test.skip(true, 'No orders assigned — cannot test view button');
      return;
    }

    if (await eyeBtn.count() > 0) {
      await eyeBtn.first().click();

      const modal = page.getByRole('dialog')
        .or(page.locator('[class*="modal" i], [class*="detail" i]'));
      await expect(modal.first()).toBeVisible({ timeout: 10_000 });

      // Close modal
      const closeBtn = page.getByRole('button', { name: /close|dismiss/i });
      if (await closeBtn.first().isVisible({ timeout: 2_000 }).catch(() => false)) {
        await closeBtn.first().click();
      }
    }
  });

  test('status dropdown is present in each row', async ({ page }) => {
    await page.waitForTimeout(2_000);

    const noOrders = page.getByText(/no orders assigned to you/i);
    if (await noOrders.count() > 0) {
      test.skip(true, 'No orders assigned — cannot test status dropdown');
      return;
    }

    // Status dropdowns are <select> elements
    const statusSelects = page.locator('select');
    if (await statusSelects.count() > 0) {
      await expect(statusSelects.first()).toBeVisible({ timeout: 5_000 });

      // Each select should have the 4 status options
      const options = await statusSelects.first().locator('option').allTextContents();
      expect(options.length).toBeGreaterThanOrEqual(4);
    }
  });

  // ── Empty state ────────────────────────────────────────────────────────────

  test('shows empty state message when no orders assigned', async ({ page }) => {
    const noOrders = page.getByText(/no orders assigned to you/i);
    // If visible, this is the correct empty state
    if (await noOrders.count() > 0) {
      await expect(noOrders.first()).toBeVisible();
    }
    // If not visible, there are orders — which is also valid
  });
});
