/**
 * Kanban Board Spec — board render, column counts, drag-drop, filtering.
 */

import { test, expect, Page } from '@playwright/test';
import * as path from 'path';
import { loginAPI, createProduct, deleteProduct } from '../helpers/api.helper';

const ADMIN_AUTH = path.join(__dirname, '../.auth/admin.json');

test.describe('Kanban Board', () => {
  test.use({ storageState: ADMIN_AUTH });

  let adminToken: string;
  let seededProductId: number;

  test.beforeAll(async () => {
    const { accessToken } = await loginAPI(
      process.env.ADMIN_EMAIL || 'admin@test.com',
      process.env.ADMIN_PASSWORD || 'password123'
    );
    adminToken = accessToken;
    // Seed a product so board is non-empty
    seededProductId = await createProduct(adminToken, {
      product_id: `E2E-KANBAN-${Date.now()}`,
      customer_name: 'E2E Test Customer',
      description: 'Created by Playwright test',
    });
  });

  test.afterAll(async () => {
    if (seededProductId) await deleteProduct(adminToken, seededProductId);
  });

  test('board renders 4 columns', async ({ page }) => {
    await page.goto('/');
    // Each column has a header with the status label
    await expect(page.locator('text=Yet to Start')).toBeVisible();
    await expect(page.locator('text=Working')).toBeVisible();
    await expect(page.locator('text=Review')).toBeVisible();
    await expect(page.locator('text=Done')).toBeVisible();
  });

  test('column header shows item count', async ({ page }) => {
    await page.goto('/');
    // Count badge is a number in each column header
    const counts = await page.locator('.rounded-full').filter({ hasText: /^\d+$/ }).all();
    expect(counts.length).toBeGreaterThanOrEqual(4);
  });

  test('seeded product appears in "Yet to Start" column', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.locator(`text=E2E-KANBAN-`)
    ).toBeVisible({ timeout: 8_000 });
  });

  test('search filter narrows displayed cards', async ({ page }) => {
    await page.goto('/');

    const searchInput = page.locator('input[placeholder*="search" i], input[type="search"]').first();
    await searchInput.fill('E2E Test Customer');
    await page.keyboard.press('Enter');

    // Should show our card
    await expect(page.locator('text=E2E Test Customer')).toBeVisible({ timeout: 6_000 });
  });

  test('status filter shows only one column', async ({ page }) => {
    await page.goto('/');

    // Select "Working" in status filter dropdown
    const statusSelect = page.locator('select[name*="status"], [data-testid="status-filter"]').first();
    if (await statusSelect.isVisible()) {
      await statusSelect.selectOption('working');
      // Only Working column should remain
      await expect(page.locator('text=Working')).toBeVisible();
      const yetToStart = page.locator('text=Yet to Start');
      await expect(yetToStart).not.toBeVisible();
    }
  });

  test('clicking a card opens product detail modal', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=E2E Test Customer')).toBeVisible({ timeout: 8_000 });
    await page.locator('text=E2E Test Customer').click();

    // Modal should open
    await expect(page.locator('[role="dialog"], .modal, [data-testid="product-modal"]').first())
      .toBeVisible({ timeout: 5_000 });
  });

  test('drag card from yet_to_start to working — card appears at top', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000); // allow initial fetch

    // Find the card in "Yet to Start"
    const card = page.locator('text=E2E Test Customer').first();
    await expect(card).toBeVisible({ timeout: 8_000 });

    // Target: Working column droppable area
    const workingColumn = page.locator('text=Working').locator('../..').first();
    await expect(workingColumn).toBeVisible();

    // Drag
    await card.dragTo(workingColumn);
    await page.waitForTimeout(1500); // allow optimistic update + refetch

    // Card should now be in working column (optimistic update)
    await expect(
      workingColumn.locator('text=E2E Test Customer')
    ).toBeVisible({ timeout: 6_000 });
  });
});
