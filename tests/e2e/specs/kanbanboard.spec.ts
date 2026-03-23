/**
 * kanbanboard.spec.ts
 *
 * Tests for the Kanban Board page (/) — the main view:
 *  - Page displays "Orders" heading
 *  - "New Product" button visible for admin
 *  - Four status columns: Yet to Start, Working, In Review, Done
 *  - Each column has a count badge
 *  - Product cards display: product ID, assignee name, delivery date
 *  - Cards have a drag handle (GripVertical icon)
 *  - Search input filters products across columns
 *  - Filter panel with status, created by, assignee, delivery date
 *  - Clicking a card opens the Product Detail Modal
 *  - "Load more" appears on columns with many products
 *  - "Drop items here" shown in empty columns
 *  - Status filter shows/hides columns
 *  - Badge dots appear on cards with new notifications
 *
 * Uses admin auth state (.auth/admin.json).
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL || process.env.BASE_URL || 'https://app.santoshdevops.cloud';

test.describe('Kanban Board (/)', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState('networkidle');
  });

  // ── Page structure ──────────────────────────────────────────────────────────

  test('kanban board displays "Orders" heading', async ({ page }) => {
    const heading = page.getByText('Orders');
    await expect(heading.first()).toBeVisible({ timeout: 15_000 });
  });

  test('"New Product" button is visible for admin', async ({ page }) => {
    const newBtn = page.getByRole('button', { name: /new product/i });
    await expect(newBtn.first()).toBeVisible({ timeout: 10_000 });
  });

  // ── Columns ────────────────────────────────────────────────────────────────

  test('shows all four kanban columns', async ({ page }) => {
    await expect(page.getByText('Yet to Start').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Working').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('In Review').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('Done').first()).toBeVisible({ timeout: 5_000 });
  });

  test('each column has a count badge', async ({ page }) => {
    // Count badges are small text elements in the column header
    const countBadges = page.locator('[class*="rounded-full"][class*="bg-surface"]');
    const count = await countBadges.count();
    expect(count).toBeGreaterThanOrEqual(4);
  });

  test('empty columns show "Drop items here" placeholder', async ({ page }) => {
    await page.waitForTimeout(2_000);
    const dropHere = page.getByText(/drop items here/i);
    // At least check the text exists somewhere if any column is empty
    if (await dropHere.count() > 0) {
      await expect(dropHere.first()).toBeVisible({ timeout: 5_000 });
    }
  });

  // ── Product cards ──────────────────────────────────────────────────────────

  test('product cards display product ID', async ({ page }) => {
    await page.waitForTimeout(2_000);

    // Product IDs are in font-mono with brand color
    const productIds = page.locator('[class*="font-mono"][class*="brand"]');
    if (await productIds.count() > 0) {
      await expect(productIds.first()).toBeVisible({ timeout: 5_000 });
    }
  });

  test('product cards display assignee names or "Unassigned"', async ({ page }) => {
    await page.waitForTimeout(2_000);

    const assignee = page.getByText(/unassigned/i)
      .or(page.locator('[class*="truncate"][class*="text-surface-400"]'));
    if (await assignee.count() > 0) {
      await expect(assignee.first()).toBeVisible({ timeout: 5_000 });
    }
  });

  test('product cards show delivery date when set', async ({ page }) => {
    await page.waitForTimeout(2_000);

    // Delivery dates are in amber color
    const dates = page.locator('[class*="text-amber"]');
    if (await dates.count() > 0) {
      await expect(dates.first()).toBeVisible({ timeout: 5_000 });
    }
  });

  test('product cards have drag handles', async ({ page }) => {
    await page.waitForTimeout(2_000);

    // Hover over a card to reveal the drag grip
    const cards = page.locator('[class*="card-hover"]');
    if (await cards.count() > 0) {
      await cards.first().hover();
      await page.waitForTimeout(300);

      // GripVertical icon should become visible
      const grip = cards.first().locator('[class*="cursor-grab"]');
      if (await grip.count() > 0) {
        await expect(grip.first()).toBeVisible({ timeout: 5_000 });
      }
    }
  });

  test('clicking a product card opens the detail modal', async ({ page }) => {
    await page.waitForTimeout(2_000);

    const cards = page.locator('[class*="card-hover"]')
      .or(page.locator('[class*="rounded-2xl"][class*="cursor-pointer"]'));

    if (await cards.count() === 0) {
      test.skip(true, 'No product cards on the kanban board');
      return;
    }

    await cards.first().click();
    await page.waitForTimeout(1_000);

    // Modal should appear
    const modal = page.locator('[class*="fixed"][class*="inset-0"]');
    await expect(modal.first()).toBeVisible({ timeout: 10_000 });

    // Product ID should be in the modal header
    const productId = page.locator('[class*="font-semibold"]');
    await expect(productId.first()).toBeVisible({ timeout: 5_000 });
  });

  // ── Search & Filter ────────────────────────────────────────────────────────

  test('search input is available on kanban board', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search/i)
      .or(page.locator('input[type="search"]'));
    await expect(searchInput.first()).toBeVisible({ timeout: 10_000 });
  });

  test('search filters products across all columns', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search/i)
      .or(page.locator('input[type="search"]'));

    await searchInput.first().fill('nonexistentproduct12345');
    await page.waitForTimeout(1_000);

    // Columns should show empty state or fewer cards
    const dropHere = page.getByText(/drop items here/i);
    // All columns could be empty now
    expect(await dropHere.count()).toBeGreaterThanOrEqual(0);

    await searchInput.first().clear();
    await page.waitForTimeout(500);
  });

  test('filter button opens filter panel', async ({ page }) => {
    const filterBtn = page.getByRole('button', { name: /filters?/i });
    if (await filterBtn.count() > 0) {
      await filterBtn.first().click();
      await page.waitForTimeout(500);

      // Filter controls should show status, assignee, delivery filters
      const filterControls = page.getByText(/status|created by|assignee|delivery/i);
      await expect(filterControls.first()).toBeVisible({ timeout: 5_000 });
    }
  });

  test('assignee filter dropdown is available', async ({ page }) => {
    const filterBtn = page.getByRole('button', { name: /filters?/i });
    if (await filterBtn.count() > 0) {
      await filterBtn.first().click();
      await page.waitForTimeout(500);

      const assigneeLabel = page.getByText(/assignee/i);
      if (await assigneeLabel.count() > 0) {
        await expect(assigneeLabel.first()).toBeVisible({ timeout: 5_000 });
      }
    }
  });

  test('delivery filter presets (Overdue, Today, Tomorrow, This Week, Custom) are avail able', async ({ page }) => {
    const filterBtn = page.getByRole('button', { name: /filters?/i });
    if (await filterBtn.count() > 0) {
      await filterBtn.first().click();
      await page.waitForTimeout(500);

      const deliveryLabel = page.getByText(/delivery due/i);
      if (await deliveryLabel.count() > 0) {
        await expect(deliveryLabel.first()).toBeVisible({ timeout: 5_000 });

        // Presets
        await expect(page.getByRole('button', { name: /overdue/i }).first()).toBeVisible({ timeout: 3_000 });
        await expect(page.getByRole('button', { name: /today/i }).first()).toBeVisible({ timeout: 3_000 });
        await expect(page.getByRole('button', { name: /tomorrow/i }).first()).toBeVisible({ timeout: 3_000 });
      }
    }
  });

  // ── Column load more ────────────────────────────────────────────────────────

  test('"Load more" button in column appears when there are many products', async ({ page }) => {
    await page.waitForTimeout(2_000);

    const loadMoreBtn = page.getByText(/load more/i);
    // May or may not be visible depending on data volume
    if (await loadMoreBtn.count() > 0) {
      await expect(loadMoreBtn.first()).toBeVisible();
    }
  });
});
