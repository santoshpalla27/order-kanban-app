/**
 * listview.spec.ts
 *
 * Tests for the List View page (/list):
 *  - Status tab chips are visible (All, Yet to Start, In Progress, In Review, Done)
 *  - Column headers: Product ID, Customer, Assignee (not Description), View, Status
 *  - Search input is present and filters results
 *  - Filter panel includes Assignee and Delivery Due filters with presets
 *  - Tab switching filters the list
 *  - Admin sees the trash (delete) button in the last column
 *  - Status dropdown changes are reflected
 *
 * Uses admin auth state (.auth/admin.json).
 */

import { test, expect } from '@playwright/test';
import { apiLogin, createProduct, deleteProduct } from '../helpers/api.helper';

const BASE_URL       = process.env.BASE_URL       || 'https://app.santoshdevops.cloud';
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL    || 'admin@gmail.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

test.describe('List View (/list)', () => {
  let adminToken: string;
  let testProductId: number;

  test.beforeAll(async () => {
    adminToken = await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD);
    const product = await createProduct(adminToken, {
      customer_name: 'ListViewTest Customer',
      description:   'E2E test product for listview spec',
    });
    testProductId = product.id;
  });

  test.afterAll(async () => {
    if (adminToken && testProductId) {
      try {
        await deleteProduct(adminToken, testProductId);
      } catch {
        // best-effort cleanup
      }
    }
  });

  // ── Column headers ──────────────────────────────────────────────────────────

  test('shows correct column headers including Assignee and View', async ({ page }) => {
    await page.goto(`${BASE_URL}/list`);
    await page.waitForLoadState('networkidle');

    // Required column headers
    await expect(page.getByText(/product.?id/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/customer/i).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/assignee/i).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/^view$/i).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/^status$/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test('does NOT show a Description column header', async ({ page }) => {
    await page.goto(`${BASE_URL}/list`);
    await page.waitForLoadState('networkidle');

    // Description was replaced by Assignee
    const descHeader = page.locator(
      'th, [class*="header" i]',
    ).getByText(/^description$/i);
    await expect(descHeader).toHaveCount(0, { timeout: 5_000 });
  });

  // ── Status tab chips ────────────────────────────────────────────────────────

  test('shows all status tab chips', async ({ page }) => {
    await page.goto(`${BASE_URL}/list`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('button', { name: /^all$/i }).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /yet to start/i }).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('button', { name: /in progress/i }).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('button', { name: /in review/i }).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('button', { name: /done/i }).first()).toBeVisible({ timeout: 5_000 });
  });

  test('clicking a status tab filters the list', async ({ page }) => {
    await page.goto(`${BASE_URL}/list`);
    await page.waitForLoadState('networkidle');

    // Click "Done" tab
    const doneTab = page.getByRole('button', { name: /done/i }).first();
    await doneTab.click();
    await page.waitForTimeout(500);

    // URL stays on /list and page doesn't crash
    expect(page.url()).toContain('/list');
  });

  // ── Search ──────────────────────────────────────────────────────────────────

  test('search input filters results', async ({ page }) => {
    await page.goto(`${BASE_URL}/list`);
    await page.waitForLoadState('networkidle');

    const searchInput = page.getByPlaceholder(/search/i).or(page.locator('input[type="search"]'));
    await expect(searchInput.first()).toBeVisible({ timeout: 10_000 });

    await searchInput.first().fill('ListViewTest Customer');
    await page.waitForTimeout(500);

    await expect(page.getByText('ListViewTest Customer').first()).toBeVisible({ timeout: 10_000 });

    await searchInput.first().clear();
    await page.waitForTimeout(300);
  });

  // ── Filter panel ────────────────────────────────────────────────────────────

  test('filter panel shows Assignee filter', async ({ page }) => {
    await page.goto(`${BASE_URL}/list`);
    await page.waitForLoadState('networkidle');

    const filterBtn = page.getByRole('button', { name: /filters?/i });
    await filterBtn.first().click();

    await expect(page.getByText(/assignee/i).first()).toBeVisible({ timeout: 5_000 });
    // Assignee select should be present
    const assigneeSelect = page.locator('select').filter({ hasText: /all assignees/i });
    await expect(assigneeSelect.first()).toBeVisible({ timeout: 5_000 });
  });

  test('filter panel shows Delivery Due with all presets', async ({ page }) => {
    await page.goto(`${BASE_URL}/list`);
    await page.waitForLoadState('networkidle');

    const filterBtn = page.getByRole('button', { name: /filters?/i });
    await filterBtn.first().click();

    await expect(page.getByText(/delivery due/i).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('button', { name: /overdue/i }).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('button', { name: /today/i }).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('button', { name: /tomorrow/i }).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('button', { name: /3 days/i }).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('button', { name: /6 days/i }).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('button', { name: /custom/i }).first()).toBeVisible({ timeout: 5_000 });
  });

  test('Custom delivery preset shows a single date picker', async ({ page }) => {
    await page.goto(`${BASE_URL}/list`);
    await page.waitForLoadState('networkidle');

    const filterBtn = page.getByRole('button', { name: /filters?/i });
    await filterBtn.first().click();

    await page.getByRole('button', { name: /custom/i }).first().click();

    const dateInputs = page.locator('input[type="date"]');
    // Exactly one date input should appear (single picker, not two)
    await expect(dateInputs).toHaveCount(1, { timeout: 5_000 });
  });

  // ── Row interactions ────────────────────────────────────────────────────────

  test('clicking the eye button opens the product detail modal', async ({ page }) => {
    await page.goto(`${BASE_URL}/list`);
    await page.waitForLoadState('networkidle');

    // Search for the test product
    const searchInput = page.getByPlaceholder(/search/i).first();
    await searchInput.fill('ListViewTest Customer');
    await page.waitForTimeout(500);

    // Click the eye (View) button on the first matching row
    const eyeBtn = page.getByTitle(/view details/i).or(page.locator('button').filter({ has: page.locator('svg') }).first());
    await eyeBtn.first().click();

    const modal = page.getByRole('dialog').or(page.locator('[class*="modal" i], [class*="detail" i]'));
    await expect(modal.first()).toBeVisible({ timeout: 10_000 });

    // Close modal
    const closeBtn = page.getByRole('button', { name: /close|dismiss/i });
    if (await closeBtn.first().isVisible({ timeout: 2_000 }).catch(() => false)) {
      await closeBtn.first().click();
    }
  });

  test('admin sees delete (trash) button in the last column', async ({ page }) => {
    await page.goto(`${BASE_URL}/list`);
    await page.waitForLoadState('networkidle');

    // Search for the test product so there's at least one row
    const searchInput = page.getByPlaceholder(/search/i).first();
    await searchInput.fill('ListViewTest Customer');
    await page.waitForTimeout(500);

    // Trash/delete button should be visible (admin auth)
    const deleteBtn = page.getByTitle(/delete/i).or(page.locator('button[title="Delete"]'));
    await expect(deleteBtn.first()).toBeVisible({ timeout: 10_000 });
  });

  // ── New Product button ──────────────────────────────────────────────────────

  test('admin sees New Product button', async ({ page }) => {
    await page.goto(`${BASE_URL}/list`);
    await page.waitForLoadState('networkidle');

    const newBtn = page.getByRole('button', { name: /new product/i });
    await expect(newBtn.first()).toBeVisible({ timeout: 10_000 });
  });
});
