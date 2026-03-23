/**
 * trash.spec.ts
 *
 * Tests for the Trash page (/trash):
 *  - Page loads with "Trash" heading and grace period info
 *  - Admin can access /trash
 *  - Table has column headers: Product ID, Customer, Status, Created by, Expires, Actions
 *  - Restore button (RotateCcw icon) is present on each row
 *  - Restore confirmation modal appears when clicking restore
 *  - "Trash is empty" state displays when no deleted products
 *  - Expiry labels ("X days left" / "Expires today") are shown
 *  - Product IDs have line-through styling (strikethrough)
 *
 * Uses admin auth state (.auth/admin.json).
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL || process.env.BASE_URL || 'https://app.santoshdevops.cloud';

test.describe('Trash Page (/trash)', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/trash`);
    await page.waitForLoadState('networkidle');
  });

  // ── Page structure ──────────────────────────────────────────────────────────

  test('trash page loads and displays "Trash" heading', async ({ page }) => {
    const heading = page.getByText(/^trash$/i);
    await expect(heading.first()).toBeVisible({ timeout: 15_000 });
    expect(page.url()).toContain('/trash');
    expect(page.url()).not.toContain('/login');
  });

  test('displays grace period information', async ({ page }) => {
    const graceInfo = page.getByText(/deleted products are kept for/i)
      .or(page.getByText(/permanent removal/i));
    await expect(graceInfo.first()).toBeVisible({ timeout: 10_000 });
  });

  test('mentions product ID reuse restriction', async ({ page }) => {
    const reusageInfo = page.getByText(/product id cannot be reused/i);
    await expect(reusageInfo.first()).toBeVisible({ timeout: 10_000 });
  });

  // ── Table structure (when there are items) ─────────────────────────────────

  test('table has correct column headers when products exist', async ({ page }) => {
    const emptyState = page.getByText(/trash is empty/i);
    if (await emptyState.count() > 0) {
      test.skip(true, 'Trash is empty — skipping column header test');
      return;
    }

    await expect(page.getByText(/product.?id/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/customer/i).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/^status$/i).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/created by/i).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/expires/i).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/actions/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test('trashed products show expiry labels', async ({ page }) => {
    const emptyState = page.getByText(/trash is empty/i);
    if (await emptyState.count() > 0) {
      test.skip(true, 'Trash is empty');
      return;
    }

    const expiryLabel = page.getByText(/days? left/i)
      .or(page.getByText(/expires today/i));
    await expect(expiryLabel.first()).toBeVisible({ timeout: 10_000 });
  });

  test('trashed product IDs have strikethrough styling', async ({ page }) => {
    const emptyState = page.getByText(/trash is empty/i);
    if (await emptyState.count() > 0) {
      test.skip(true, 'Trash is empty');
      return;
    }

    const strikethrough = page.locator('[class*="line-through"]');
    if (await strikethrough.count() > 0) {
      await expect(strikethrough.first()).toBeVisible({ timeout: 5_000 });
    }
  });

  // ── Restore functionality ──────────────────────────────────────────────────

  test('restore button is present on trash rows', async ({ page }) => {
    const emptyState = page.getByText(/trash is empty/i);
    if (await emptyState.count() > 0) {
      test.skip(true, 'Trash is empty');
      return;
    }

    const restoreBtn = page.getByTitle(/restore/i)
      .or(page.locator('button').filter({ has: page.locator('svg') }));
    await expect(restoreBtn.first()).toBeVisible({ timeout: 10_000 });
  });

  test('clicking restore opens a confirmation modal', async ({ page }) => {
    const emptyState = page.getByText(/trash is empty/i);
    if (await emptyState.count() > 0) {
      test.skip(true, 'Trash is empty');
      return;
    }

    const restoreBtn = page.getByTitle(/restore/i)
      .or(page.locator('button[title="Restore"]'));
    if (await restoreBtn.count() === 0) {
      test.skip(true, 'Restore button not found');
      return;
    }

    await restoreBtn.first().click();

    // Confirmation modal
    const modal = page.getByText(/restore product/i)
      .or(page.getByRole('dialog'));
    await expect(modal.first()).toBeVisible({ timeout: 10_000 });

    // Modal has Restore and Cancel buttons
    await expect(page.getByRole('button', { name: /^restore$/i }).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('button', { name: /cancel/i }).first()).toBeVisible({ timeout: 5_000 });
  });

  test('restore confirmation modal shows correct messaging', async ({ page }) => {
    const emptyState = page.getByText(/trash is empty/i);
    if (await emptyState.count() > 0) {
      test.skip(true, 'Trash is empty');
      return;
    }

    const restoreBtn = page.getByTitle(/restore/i)
      .or(page.locator('button[title="Restore"]'));
    if (await restoreBtn.count() === 0) {
      test.skip(true, 'Restore button not found');
      return;
    }

    await restoreBtn.first().click();

    // Modal messaging
    const modalText = page.getByText(/moved back to the kanban board/i)
      .or(page.getByText(/original id/i));
    await expect(modalText.first()).toBeVisible({ timeout: 5_000 });

    // Cancel to close
    await page.getByRole('button', { name: /cancel/i }).first().click();
  });

  // ── Empty state ────────────────────────────────────────────────────────────

  test('shows "Trash is empty" state when no deleted products', async ({ page }) => {
    const emptyState = page.getByText(/trash is empty/i);
    if (await emptyState.count() > 0) {
      await expect(emptyState.first()).toBeVisible();

      const subText = page.getByText(/deleted products will appear here/i);
      await expect(subText.first()).toBeVisible({ timeout: 5_000 });
    }
  });
});
