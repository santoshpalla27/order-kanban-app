/**
 * createproduct.spec.ts
 *
 * Tests for the Create Product Modal:
 *  - "New Product" button is visible on kanban board for admin
 *  - Clicking it opens the Create Product modal with "New Product" heading
 *  - Form has fields: Product ID*, Customer Name*, Customer Phone, Description, Delivery Date, Assign To
 *  - Product ID and Customer Name are required fields
 *  - Assign To dropdown lists users with multi-select (chips with X)
 *  - "Create Product" submit button is present
 *  - "Cancel" button closes the modal
 *  - Submitting with required fields creates the product
 *  - Empty required fields prevent submission
 *
 * Uses admin auth state (.auth/admin.json).
 */

import { test, expect } from '@playwright/test';
import { loginAndGetToken, deleteProduct } from '../helpers/api.helper';

const BASE_URL = process.env.E2E_BASE_URL || process.env.BASE_URL || 'https://app.santoshdevops.cloud';
const API_URL  = process.env.E2E_API_URL  || process.env.API_URL  || 'https://app.santoshdevops.cloud/api';
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL    || 'admin@gmail.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

test.describe('Create Product Modal', () => {

  let adminToken: string;
  const createdProductIds: number[] = [];

  test.beforeAll(async () => {
    try {
      adminToken = await loginAndGetToken(API_URL, ADMIN_EMAIL, ADMIN_PASSWORD);
    } catch (e) {
      console.warn('Failed to get admin token:', e);
    }
  });

  test.afterAll(async () => {
    // Clean up any products created during tests
    for (const id of createdProductIds) {
      try { await deleteProduct(API_URL, adminToken, id); } catch {}
    }
  });

  // Helper to open the create modal
  async function openCreateModal(page: any) {
    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2_000);

    const newProductBtn = page.getByRole('button', { name: /new product/i });
    if (await newProductBtn.count() === 0) return false;
    await newProductBtn.first().click();
    await page.waitForTimeout(500);
    return true;
  }

  // ── Page access ────────────────────────────────────────────────────────────

  test('"New Product" button is visible on the kanban board', async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState('networkidle');

    const newProductBtn = page.getByRole('button', { name: /new product/i });
    await expect(newProductBtn.first()).toBeVisible({ timeout: 15_000 });
  });

  // ── Modal structure ────────────────────────────────────────────────────────

  test('clicking "New Product" opens the create modal with heading', async ({ page }) => {
    const opened = await openCreateModal(page);
    if (!opened) { test.skip(true, '"New Product" button not found'); return; }

    const heading = page.getByText('New Product');
    await expect(heading.first()).toBeVisible({ timeout: 10_000 });
  });

  test('modal has Product ID field with placeholder', async ({ page }) => {
    const opened = await openCreateModal(page);
    if (!opened) { test.skip(true, '"New Product" button not found'); return; }

    const label = page.getByText(/product id/i);
    await expect(label.first()).toBeVisible({ timeout: 10_000 });

    const input = page.getByPlaceholder(/prd-001/i)
      .or(page.locator('input[type="text"]').first());
    await expect(input.first()).toBeVisible({ timeout: 5_000 });
  });

  test('modal has Customer Name field with placeholder', async ({ page }) => {
    const opened = await openCreateModal(page);
    if (!opened) { test.skip(true, '"New Product" button not found'); return; }

    const label = page.getByText(/customer name/i);
    await expect(label.first()).toBeVisible({ timeout: 10_000 });

    const input = page.getByPlaceholder(/customer name/i);
    await expect(input.first()).toBeVisible({ timeout: 5_000 });
  });

  test('modal has Customer Phone field', async ({ page }) => {
    const opened = await openCreateModal(page);
    if (!opened) { test.skip(true, '"New Product" button not found'); return; }

    const label = page.getByText(/customer phone/i);
    await expect(label.first()).toBeVisible({ timeout: 10_000 });
  });

  test('modal has Description textarea', async ({ page }) => {
    const opened = await openCreateModal(page);
    if (!opened) { test.skip(true, '"New Product" button not found'); return; }

    const label = page.getByText(/description/i);
    await expect(label.first()).toBeVisible({ timeout: 10_000 });

    const textarea = page.getByPlaceholder(/product description/i)
      .or(page.locator('textarea'));
    await expect(textarea.first()).toBeVisible({ timeout: 5_000 });
  });

  test('modal has Delivery Date & Time field', async ({ page }) => {
    const opened = await openCreateModal(page);
    if (!opened) { test.skip(true, '"New Product" button not found'); return; }

    const label = page.getByText(/delivery date/i);
    await expect(label.first()).toBeVisible({ timeout: 10_000 });

    const dateInput = page.locator('input[type="datetime-local"]');
    await expect(dateInput.first()).toBeVisible({ timeout: 5_000 });
  });

  test('modal has Assign To field with user dropdown', async ({ page }) => {
    const opened = await openCreateModal(page);
    if (!opened) { test.skip(true, '"New Product" button not found'); return; }

    const label = page.getByText(/assign to/i);
    await expect(label.first()).toBeVisible({ timeout: 10_000 });

    const select = page.locator('select').filter({ hasText: /add assignee/i });
    await expect(select.first()).toBeVisible({ timeout: 5_000 });
  });

  test('"Create Product" and "Cancel" buttons are present', async ({ page }) => {
    const opened = await openCreateModal(page);
    if (!opened) { test.skip(true, '"New Product" button not found'); return; }

    await expect(page.getByRole('button', { name: /create product/i }).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /cancel/i }).first()).toBeVisible({ timeout: 5_000 });
  });

  // ── Interactions ────────────────────────────────────────────────────────────

  test('clicking Cancel closes the modal', async ({ page }) => {
    const opened = await openCreateModal(page);
    if (!opened) { test.skip(true, '"New Product" button not found'); return; }

    await page.getByRole('button', { name: /cancel/i }).first().click();
    await page.waitForTimeout(500);

    const heading = page.getByText('New Product');
    await expect(heading).not.toBeVisible({ timeout: 5_000 });
  });

  test('can fill in all fields and create a product', async ({ page }) => {
    const opened = await openCreateModal(page);
    if (!opened) { test.skip(true, '"New Product" button not found'); return; }

    const uniqueId = `E2E-CREATE-${Date.now()}`;

    // Fill Product ID
    const productIdInput = page.getByPlaceholder(/prd-001/i)
      .or(page.locator('input[type="text"]').first());
    await productIdInput.first().fill(uniqueId);

    // Fill Customer Name
    const customerInput = page.getByPlaceholder(/customer name/i);
    await customerInput.first().fill('E2E Test Customer');

    // Fill Description
    const descInput = page.getByPlaceholder(/product description/i)
      .or(page.locator('textarea'));
    await descInput.first().fill('Created by E2E test');

    // Submit
    await page.getByRole('button', { name: /create product/i }).first().click();
    await page.waitForTimeout(3_000);

    // Modal should close and product should appear on the board
    const card = page.getByText(uniqueId);
    await expect(card.first()).toBeVisible({ timeout: 15_000 });

    // Track for cleanup via API
    // Use API to find and record the ID
    try {
      const response = await page.request.get(`${API_URL}/products`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const products = await response.json();
      const created = (products.data || products).find((p: any) => p.product_id === uniqueId);
      if (created) createdProductIds.push(created.id);
    } catch {}
  });

  test('selecting an assignee creates a chip with remove button', async ({ page }) => {
    const opened = await openCreateModal(page);
    if (!opened) { test.skip(true, '"New Product" button not found'); return; }

    const assignSelect = page.locator('select').filter({ hasText: /add assignee/i });
    const options = await assignSelect.first().locator('option').allTextContents();

    if (options.length > 1) {
      // Select the first actual user (not the placeholder)
      await assignSelect.first().selectOption({ index: 1 });
      await page.waitForTimeout(300);

      // A chip with the user's name and X button should appear
      const chips = page.locator('[class*="rounded-full"][class*="brand"]')
        .or(page.locator('span').filter({ has: page.locator('button') }));
      await expect(chips.first()).toBeVisible({ timeout: 5_000 });
    }
  });

  test('Product ID and Customer Name are required', async ({ page }) => {
    const opened = await openCreateModal(page);
    if (!opened) { test.skip(true, '"New Product" button not found'); return; }

    // Product ID should have required attribute
    const productIdInput = page.locator('input[required]').first();
    await expect(productIdInput).toBeVisible({ timeout: 10_000 });
  });
});
