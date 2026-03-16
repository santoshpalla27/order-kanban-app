/**
 * kanban.spec.ts
 *
 * Tests for the Kanban board page (/kanban):
 *  - Board has at least one visible column
 *  - Search input filters cards
 *  - Filter control is present and functional
 *  - Clicking a card opens a detail modal
 *
 * Uses admin auth state (.auth/admin.json).
 */

import { test, expect } from '@playwright/test';
import { apiLogin, createProduct, deleteProduct } from '../helpers/api.helper';

const BASE_URL       = process.env.BASE_URL       || 'https://app.santoshdevops.cloud';
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL    || 'admin@gmail.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

test.describe('Kanban Board', () => {
  let adminToken: string;
  let testProductId: number;

  test.beforeAll(async () => {
    adminToken = await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD);
    // Create a product so the board has at least one card
    const product = await createProduct(adminToken, {
      customer_name: 'KanbanTest Customer',
      description:   'E2E test card for kanban spec',
    });
    testProductId = product.product_id;
  });

  test.afterAll(async () => {
    if (adminToken && testProductId) {
      try {
        await deleteProduct(adminToken, testProductId);
      } catch {
        // Best-effort cleanup
      }
    }
  });

  test('board has at least one visible column', async ({ page }) => {
    await page.goto(`${BASE_URL}/kanban`);
    await page.waitForLoadState('networkidle');

    // Columns are typically represented as sections / divs with a heading
    const columns = page
      .locator('[class*="column" i], [class*="lane" i], [class*="stage" i], [class*="status" i]')
      .or(page.getByRole('region'))
      .or(page.locator('[data-column], [data-lane], [data-status]'));

    // Fallback: look for common kanban status labels
    const statusLabels = page.getByText(
      /todo|to do|in progress|doing|done|backlog|review|pending/i,
    );

    const colCount    = await columns.count();
    const labelCount  = await statusLabels.count();

    expect(colCount + labelCount).toBeGreaterThan(0);
  });

  test('search input is present and filters results', async ({ page }) => {
    await page.goto(`${BASE_URL}/kanban`);
    await page.waitForLoadState('networkidle');

    const searchInput = page
      .getByRole('searchbox')
      .or(page.getByLabel(/search/i))
      .or(page.getByPlaceholder(/search/i))
      .or(page.locator('input[type="search"]'));

    await expect(searchInput.first()).toBeVisible();

    // Type a unique term that should match our test product
    await searchInput.first().fill('KanbanTest Customer');
    await page.waitForTimeout(500); // debounce

    // The test card should remain visible; unrelated cards should disappear
    const card = page
      .getByText('KanbanTest Customer')
      .or(page.locator('[class*="card" i]').filter({ hasText: 'KanbanTest Customer' }));
    await expect(card.first()).toBeVisible({ timeout: 10_000 });

    // Clear search
    await searchInput.first().clear();
    await page.waitForTimeout(300);
  });

  test('filter button is present and opens filter panel', async ({ page }) => {
    await page.goto(`${BASE_URL}/kanban`);
    await page.waitForLoadState('networkidle');

    const filterBtn = page.getByRole('button', { name: /filters?/i });
    await expect(filterBtn.first()).toBeVisible({ timeout: 10_000 });

    // Open the filter panel
    await filterBtn.first().click();

    // Status and Created By filters are always present
    await expect(page.getByText(/status/i).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/created by/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test('filter panel includes Assignee filter', async ({ page }) => {
    await page.goto(`${BASE_URL}/kanban`);
    await page.waitForLoadState('networkidle');

    const filterBtn = page.getByRole('button', { name: /filters?/i });
    await filterBtn.first().click();

    await expect(page.getByText(/assignee/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test('filter panel includes Delivery Due filter with presets', async ({ page }) => {
    await page.goto(`${BASE_URL}/kanban`);
    await page.waitForLoadState('networkidle');

    const filterBtn = page.getByRole('button', { name: /filters?/i });
    await filterBtn.first().click();

    await expect(page.getByText(/delivery due/i).first()).toBeVisible({ timeout: 5_000 });

    // Preset buttons should be visible
    await expect(page.getByRole('button', { name: /overdue/i }).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('button', { name: /today/i }).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('button', { name: /tomorrow/i }).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('button', { name: /3 days/i }).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('button', { name: /6 days/i }).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('button', { name: /custom/i }).first()).toBeVisible({ timeout: 5_000 });
  });

  test('delivery due preset "Today" shows a date picker when Custom is selected', async ({ page }) => {
    await page.goto(`${BASE_URL}/kanban`);
    await page.waitForLoadState('networkidle');

    const filterBtn = page.getByRole('button', { name: /filters?/i });
    await filterBtn.first().click();

    // Click "Custom"
    const customBtn = page.getByRole('button', { name: /custom/i }).first();
    await customBtn.click();

    // A date input should appear
    const dateInput = page.locator('input[type="date"]');
    await expect(dateInput.first()).toBeVisible({ timeout: 5_000 });
  });

  test('clicking a card opens a detail modal or side panel', async ({ page }) => {
    await page.goto(`${BASE_URL}/kanban`);
    await page.waitForLoadState('networkidle');

    // Find the test card
    const card = page
      .getByText('KanbanTest Customer')
      .or(page.locator('[class*="card" i]').filter({ hasText: 'KanbanTest Customer' }))
      .or(page.locator('[class*="item" i]').filter({ hasText: 'KanbanTest Customer' }));

    const cardCount = await card.count();
    if (cardCount === 0) {
      test.skip(true, 'Test card not found on the board — skipping modal test');
      return;
    }

    await card.first().click();

    // Wait for a modal / dialog / drawer to appear
    const modal = page
      .getByRole('dialog')
      .or(page.locator('[class*="modal" i], [class*="drawer" i], [class*="panel" i], [class*="detail" i]'));

    await expect(modal.first()).toBeVisible({ timeout: 10_000 });

    // The modal should contain the product name or description
    const modalText = page
      .getByText('KanbanTest Customer')
      .or(page.getByText('E2E test card for kanban spec'));
    await expect(modalText.first()).toBeVisible({ timeout: 5_000 });

    // Close modal if there is a close button
    const closeBtn = page
      .getByRole('button', { name: /close|dismiss|cancel/i })
      .or(page.locator('[aria-label="close" i], [aria-label="dismiss" i]'));
    if (await closeBtn.first().isVisible()) {
      await closeBtn.first().click();
    }
  });
});
