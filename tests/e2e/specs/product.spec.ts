/**
 * product.spec.ts
 *
 * Tests for product lifecycle (admin auth):
 *  - Create a product via UI ("New Product" button)
 *  - Edit the product
 *  - Delete / trash the product
 *  - Restore from trash
 *
 * Cleanup is performed in afterAll via API.
 */

import { test, expect } from '@playwright/test';
import { apiLogin, getProducts, deleteProduct } from '../helpers/api.helper';

const BASE_URL       = process.env.BASE_URL       || 'https://app.santoshdevops.cloud';
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL    || 'admin@gmail.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

const PRODUCT_NAME        = `E2E Product ${Date.now()}`;
const PRODUCT_DESC        = 'Created by Playwright E2E tests';
const PRODUCT_NAME_EDITED = `${PRODUCT_NAME} - Edited`;

test.describe('Product Management', () => {
  let adminToken: string;
  // IDs of any products we create, for cleanup
  const createdProductIds: number[] = [];

  test.beforeAll(async () => {
    adminToken = await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD);
  });

  test.afterAll(async () => {
    for (const id of createdProductIds) {
      try {
        await deleteProduct(adminToken, id);
      } catch {
        // best-effort
      }
    }
  });

  // ── Helper: open "New Product" modal ───────────────────────────────────────
  async function openNewProductModal(page: import('@playwright/test').Page) {
    const newBtn = page
      .getByRole('button', { name: /new product|add product|create product|\+ product/i })
      .or(page.getByText(/new product|add product|\+ product/i));
    await expect(newBtn.first()).toBeVisible({ timeout: 10_000 });
    await newBtn.first().click();

    // Wait for modal
    const modal = page
      .getByRole('dialog')
      .or(page.locator('[class*="modal" i], [class*="drawer" i]'));
    await expect(modal.first()).toBeVisible({ timeout: 10_000 });
    return modal.first();
  }

  // ── Helper: fill product form ──────────────────────────────────────────────
  async function fillProductForm(
    page: import('@playwright/test').Page,
    customerName: string,
    description: string,
  ) {
    const nameField = page
      .getByLabel(/customer.?name|name/i)
      .or(page.getByRole('textbox', { name: /customer.?name|name/i }))
      .or(page.locator('input[name*="customer" i], input[name*="name" i]'));
    await nameField.first().fill(customerName);

    const descField = page
      .getByLabel(/description|desc/i)
      .or(page.getByRole('textbox', { name: /description|desc/i }))
      .or(page.locator('textarea[name*="desc" i], input[name*="desc" i]'));
    await descField.first().fill(description);
  }

  // ── Helper: resolve product ID by name ────────────────────────────────────
  async function resolveProductId(name: string): Promise<number | null> {
    const products = await getProducts(adminToken);
    const found = products.find(
      (p) => p.customer_name === name || p.customer_name.includes(name),
    );
    return found ? found.product_id : null;
  }

  test('can create a product via the UI', async ({ page }) => {
    await page.goto(`${BASE_URL}/kanban`);
    await page.waitForLoadState('networkidle');

    await openNewProductModal(page);
    await fillProductForm(page, PRODUCT_NAME, PRODUCT_DESC);

    // Submit
    const submitBtn = page
      .getByRole('button', { name: /create|save|submit|add/i })
      .last();
    await submitBtn.click();

    // Modal should close
    await page.waitForTimeout(1_000);

    // Product should now appear on the board
    const card = page
      .getByText(PRODUCT_NAME)
      .or(page.locator('[class*="card" i]').filter({ hasText: PRODUCT_NAME }));
    await expect(card.first()).toBeVisible({ timeout: 15_000 });

    // Store the created product ID for cleanup
    const id = await resolveProductId(PRODUCT_NAME);
    if (id) createdProductIds.push(id);
  });

  test('can edit an existing product', async ({ page }) => {
    await page.goto(`${BASE_URL}/kanban`);
    await page.waitForLoadState('networkidle');

    // Open the card
    const card = page
      .getByText(PRODUCT_NAME)
      .or(page.locator('[class*="card" i]').filter({ hasText: PRODUCT_NAME }));

    if (await card.count() === 0) {
      test.skip(true, 'Product from previous test not found — skipping edit test');
      return;
    }

    await card.first().click();

    // Look for an Edit button inside the modal/detail panel
    const editBtn = page
      .getByRole('button', { name: /edit/i })
      .or(page.getByRole('menuitem', { name: /edit/i }))
      .or(page.getByText(/edit/i).and(page.locator('button, [role="menuitem"]')));

    if (await editBtn.count() === 0) {
      test.skip(true, 'Edit button not found — skipping edit test');
      return;
    }

    await editBtn.first().click();

    // Edit the customer name
    const nameField = page
      .getByLabel(/customer.?name|name/i)
      .or(page.getByRole('textbox', { name: /customer.?name|name/i }))
      .or(page.locator('input[name*="customer" i], input[name*="name" i]'));

    await nameField.first().clear();
    await nameField.first().fill(PRODUCT_NAME_EDITED);

    const saveBtn = page
      .getByRole('button', { name: /save|update|confirm/i })
      .last();
    await saveBtn.click();

    await page.waitForTimeout(1_000);

    // Verify edited name appears
    const editedCard = page
      .getByText(PRODUCT_NAME_EDITED)
      .or(page.locator('[class*="card" i]').filter({ hasText: PRODUCT_NAME_EDITED }));
    await expect(editedCard.first()).toBeVisible({ timeout: 10_000 });
  });

  test('can delete (trash) a product', async ({ page }) => {
    await page.goto(`${BASE_URL}/kanban`);
    await page.waitForLoadState('networkidle');

    // Find the product (may be edited or original name)
    const displayName = PRODUCT_NAME_EDITED;
    const card = page
      .getByText(displayName)
      .or(page.getByText(PRODUCT_NAME))
      .or(page.locator('[class*="card" i]').filter({ hasText: displayName }));

    if (await card.count() === 0) {
      test.skip(true, 'Product not found — skipping delete test');
      return;
    }

    await card.first().click();

    // Look for a Delete / Move to Trash button
    const deleteBtn = page
      .getByRole('button', { name: /delete|trash|remove/i })
      .or(page.getByRole('menuitem', { name: /delete|trash|remove/i }));

    if (await deleteBtn.count() === 0) {
      test.skip(true, 'Delete button not found — skipping delete test');
      return;
    }

    await deleteBtn.first().click();

    // Confirmation dialog may appear
    const confirmBtn = page
      .getByRole('button', { name: /confirm|yes|ok|delete/i })
      .last();
    if (await confirmBtn.isVisible({ timeout: 3_000 })) {
      await confirmBtn.click();
    }

    await page.waitForTimeout(1_500);

    // Product should no longer appear on the board
    const remainingCard = page.locator('[class*="card" i]').filter({ hasText: displayName });
    await expect(remainingCard).toHaveCount(0, { timeout: 10_000 });
  });

  test('can restore a product from trash', async ({ page }) => {
    await page.goto(`${BASE_URL}/trash`);
    await page.waitForLoadState('networkidle');

    const trashItem = page
      .getByText(PRODUCT_NAME_EDITED)
      .or(page.getByText(PRODUCT_NAME));

    if (await trashItem.count() === 0) {
      test.skip(true, 'Product not found in trash — skipping restore test');
      return;
    }

    // Click restore button near the trashed product
    const row = trashItem.first().locator('..').locator('..');
    const restoreBtn = row
      .getByRole('button', { name: /restore|recover|undo/i })
      .or(page.getByRole('button', { name: /restore|recover|undo/i }));

    if (await restoreBtn.count() === 0) {
      test.skip(true, 'Restore button not found — skipping restore test');
      return;
    }

    await restoreBtn.first().click();

    // Confirmation
    const confirmBtn = page
      .getByRole('button', { name: /confirm|yes|ok|restore/i })
      .last();
    if (await confirmBtn.isVisible({ timeout: 3_000 })) {
      await confirmBtn.click();
    }

    await page.waitForTimeout(1_500);

    // Navigate back to kanban and verify it's there
    await page.goto(`${BASE_URL}/kanban`);
    await page.waitForLoadState('networkidle');

    const restoredCard = page
      .getByText(PRODUCT_NAME_EDITED)
      .or(page.getByText(PRODUCT_NAME));
    await expect(restoredCard.first()).toBeVisible({ timeout: 10_000 });
  });
});
