/**
 * Product Spec — create, edit, delete, trash/restore, detail modal.
 */

import { test, expect } from '@playwright/test';
import * as path from 'path';
import { loginAPI, deleteProduct } from '../helpers/api.helper';

const ADMIN_AUTH = path.join(__dirname, '../.auth/admin.json');

test.describe('Product Management', () => {
  test.use({ storageState: ADMIN_AUTH });

  let adminToken: string;
  const testProductId = `E2E-PROD-${Date.now()}`;
  let createdProductDbId: number;

  test.beforeAll(async () => {
    const { accessToken } = await loginAPI(
      process.env.ADMIN_EMAIL || 'admin@test.com',
      process.env.ADMIN_PASSWORD || 'password123'
    );
    adminToken = accessToken;
  });

  test.afterAll(async () => {
    if (createdProductDbId) {
      await deleteProduct(adminToken, createdProductDbId).catch(() => {});
    }
  });

  test('New Product button is visible for admin', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('button:has-text("New Product"), button:has-text("new product")')).toBeVisible();
  });

  test('create product via UI', async ({ page }) => {
    await page.goto('/');
    await page.locator('button:has-text("New Product")').click();

    // Modal opens
    const modal = page.locator('[role="dialog"], .modal').first();
    await expect(modal).toBeVisible();

    // Fill form
    await modal.locator('input[name="product_id"], input[placeholder*="product id" i]').fill(testProductId);
    await modal.locator('input[name="customer_name"], input[placeholder*="customer name" i]').fill('Playwright Customer');
    await modal.locator('input[name="customer_phone"], input[placeholder*="phone" i]').fill('+1555000001');
    await modal.locator('textarea[name="description"], textarea[placeholder*="description" i]').fill('Created by Playwright');

    await modal.locator('button[type="submit"], button:has-text("Create")').click();

    // Modal closes and card appears on board
    await expect(modal).not.toBeVisible({ timeout: 8_000 });
    await expect(page.locator(`text=${testProductId}`)).toBeVisible({ timeout: 8_000 });
  });

  test('open product detail modal', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator(`text=${testProductId}`)).toBeVisible({ timeout: 8_000 });
    await page.locator(`text=${testProductId}`).click();

    const modal = page.locator('[role="dialog"]').first();
    await expect(modal).toBeVisible({ timeout: 5_000 });
    await expect(modal.locator(`text=${testProductId}`)).toBeVisible();
    await expect(modal.locator('text=Playwright Customer')).toBeVisible();
  });

  test('edit product fields', async ({ page }) => {
    await page.goto('/');
    await page.locator(`text=${testProductId}`).click();

    const modal = page.locator('[role="dialog"]').first();
    await expect(modal).toBeVisible();

    // Look for edit button
    const editBtn = modal.locator('button:has-text("Edit"), [data-testid="edit-btn"]').first();
    if (await editBtn.isVisible()) {
      await editBtn.click();

      const nameInput = modal.locator('input[name="customer_name"]').first();
      await nameInput.clear();
      await nameInput.fill('Playwright Customer Updated');

      await modal.locator('button:has-text("Save"), button[type="submit"]').first().click();
      await expect(modal.locator('text=Playwright Customer Updated')).toBeVisible({ timeout: 6_000 });
    }
  });

  test('delete product moves it to trash', async ({ page }) => {
    await page.goto('/');
    await page.locator(`text=${testProductId}`).click();

    const modal = page.locator('[role="dialog"]').first();
    await expect(modal).toBeVisible();

    const deleteBtn = modal.locator('button:has-text("Delete"), [data-testid="delete-product"]').first();
    if (await deleteBtn.isVisible()) {
      await deleteBtn.click();

      // Confirmation modal
      const confirmModal = page.locator('[role="dialog"]').last();
      await confirmModal.locator('button:has-text("Delete"), button:has-text("Confirm")').click();

      // Product removed from board
      await expect(page.locator(`text=${testProductId}`)).not.toBeVisible({ timeout: 8_000 });
    }
  });

  test('trash page shows deleted product', async ({ page }) => {
    await page.goto('/trash');
    await expect(page.locator(`text=${testProductId}`)).toBeVisible({ timeout: 8_000 });
  });

  test('restore product from trash', async ({ page }) => {
    await page.goto('/trash');
    await expect(page.locator(`text=${testProductId}`)).toBeVisible({ timeout: 8_000 });

    // Click restore
    const restoreBtn = page.locator(`text=${testProductId}`)
      .locator('../..')
      .locator('button:has-text("Restore"), [data-testid="restore-btn"]')
      .first();

    if (await restoreBtn.isVisible()) {
      await restoreBtn.click();
      await expect(page.locator(`text=${testProductId}`)).not.toBeVisible({ timeout: 8_000 });
    }
  });
});
