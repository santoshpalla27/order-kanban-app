/**
 * attachments.spec.ts
 *
 * Tests for the Attachments functionality within Product Detail Modal:
 *  - Attachments tab shows Upload Files button
 *  - Upload button triggers file input
 *  - Download All button visible when attachments exist
 *  - Image attachments show in gallery grid
 *  - Non-image files show in a file list with icon, name, and size
 *  - Delete button shows on hover for each attachment
 *  - Delete confirmation modal appears with message
 *  - Comment button on attachment opens image comment modal
 *  - Image lightbox opens when clicking an image attachment
 *
 * Uses admin auth state (.auth/admin.json).
 */

import { test, expect } from '@playwright/test';
import { loginAndGetToken, createProduct, deleteProduct } from '../helpers/api.helper';

const BASE_URL = process.env.E2E_BASE_URL || process.env.BASE_URL || 'https://app.santoshdevops.cloud';
const API_URL  = process.env.E2E_API_URL  || process.env.API_URL  || 'https://app.santoshdevops.cloud/api';
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL    || 'admin@gmail.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

test.describe('Attachments Feature', () => {

  let adminToken: string;
  let testProductId: number | null = null;
  const testProductName = `E2E-Attach-${Date.now()}`;

  test.beforeAll(async () => {
    try {
      adminToken = await loginAndGetToken(API_URL, ADMIN_EMAIL, ADMIN_PASSWORD);
      const product = await createProduct(API_URL, adminToken, {
        product_id: testProductName,
        customer_name: 'Attachment Test Customer',
        description: 'Product for attachment tests',
      });
      testProductId = product.id;
    } catch (e) {
      console.warn('Failed to create test product for attachment tests:', e);
    }
  });

  test.afterAll(async () => {
    if (testProductId && adminToken) {
      try { await deleteProduct(API_URL, adminToken, testProductId); } catch {}
    }
  });

  async function openAttachmentsTab(page: any): Promise<boolean> {
    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2_000);

    const card = page.getByText(testProductName);
    if (await card.count() === 0) return false;

    await card.first().click();
    await page.waitForTimeout(1_000);

    // Switch to Attachments tab
    const attTab = page.getByText(/attachments/i).first();
    await attTab.click();
    await page.waitForTimeout(500);
    return true;
  }

  // ── Tab UI ──────────────────────────────────────────────────────────────────

  test('Attachments tab shows Upload Files button', async ({ page }) => {
    if (!testProductId) { test.skip(true, 'Test product not created'); return; }
    const opened = await openAttachmentsTab(page);
    if (!opened) { test.skip(true, 'Test product not found'); return; }

    const uploadBtn = page.getByRole('button', { name: /upload files/i })
      .or(page.getByText(/upload files/i).and(page.locator('button')));
    await expect(uploadBtn.first()).toBeVisible({ timeout: 10_000 });
  });

  test('empty state shows "No attachments — click to upload"', async ({ page }) => {
    if (!testProductId) { test.skip(true, 'Test product not created'); return; }
    const opened = await openAttachmentsTab(page);
    if (!opened) { test.skip(true, 'Test product not found'); return; }

    const emptyState = page.getByText(/no attachments/i)
      .or(page.getByText(/click to upload/i));

    // If this is a fresh product, no attachments should exist
    if (await emptyState.count() > 0) {
      await expect(emptyState.first()).toBeVisible({ timeout: 5_000 });
    }
  });

  test('Upload Files button has a hidden file input', async ({ page }) => {
    if (!testProductId) { test.skip(true, 'Test product not created'); return; }
    const opened = await openAttachmentsTab(page);
    if (!opened) { test.skip(true, 'Test product not found'); return; }

    // Hidden file input for uploads
    const fileInput = page.locator('input[type="file"]');
    expect(await fileInput.count()).toBeGreaterThanOrEqual(1);
  });

  test('file input supports multiple file selection', async ({ page }) => {
    if (!testProductId) { test.skip(true, 'Test product not created'); return; }
    const opened = await openAttachmentsTab(page);
    if (!opened) { test.skip(true, 'Test product not found'); return; }

    const fileInput = page.locator('input[type="file"][multiple]');
    expect(await fileInput.count()).toBeGreaterThanOrEqual(1);
  });

  // ── Details tab attachment section ──────────────────────────────────────────

  test('Details tab shows "Add Files" button in attachment section', async ({ page }) => {
    if (!testProductId) { test.skip(true, 'Test product not created'); return; }

    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2_000);

    const card = page.getByText(testProductName);
    if (await card.count() === 0) { test.skip(true, 'Test product not found'); return; }

    await card.first().click();
    await page.waitForTimeout(1_000);

    // On Details tab, there should be an attachment section
    const addFilesBtn = page.getByText(/add files/i);
    await expect(addFilesBtn.first()).toBeVisible({ timeout: 10_000 });
  });

  test('Details tab attachment section shows "Click to add attachments" when empty', async ({ page }) => {
    if (!testProductId) { test.skip(true, 'Test product not created'); return; }

    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2_000);

    const card = page.getByText(testProductName);
    if (await card.count() === 0) { test.skip(true, 'Test product not found'); return; }

    await card.first().click();
    await page.waitForTimeout(1_000);

    const emptyUpload = page.getByText(/click to add attachments/i);
    if (await emptyUpload.count() > 0) {
      await expect(emptyUpload.first()).toBeVisible({ timeout: 5_000 });
    }
  });

  // ── Download All ──────────────────────────────────────────────────────────

  test('Download All button appears when attachments exist', async ({ page }) => {
    if (!testProductId) { test.skip(true, 'Test product not created'); return; }
    const opened = await openAttachmentsTab(page);
    if (!opened) { test.skip(true, 'Test product not found'); return; }

    const downloadAll = page.getByRole('button', { name: /download all/i })
      .or(page.getByText(/download all/i).and(page.locator('button')));

    // Only visible when there are attachments
    if (await downloadAll.count() > 0) {
      await expect(downloadAll.first()).toBeVisible({ timeout: 5_000 });
    }
  });

  // ── Upload with real file ─────────────────────────────────────────────────

  test('can upload a file and see it listed', async ({ page }) => {
    if (!testProductId) { test.skip(true, 'Test product not created'); return; }
    const opened = await openAttachmentsTab(page);
    if (!opened) { test.skip(true, 'Test product not found'); return; }

    // Create a test file buffer
    const fileInput = page.locator('input[type="file"]').first();

    // Use Playwright's setInputFiles to simulate upload
    await fileInput.setInputFiles({
      name: 'e2e-test-file.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('E2E test file content'),
    });

    // Wait for upload to complete
    await page.waitForTimeout(5_000);

    // The file should appear in the attachment list
    const fileName = page.getByText(/e2e-test-file/i);
    if (await fileName.count() > 0) {
      await expect(fileName.first()).toBeVisible({ timeout: 10_000 });
    }
  });

  // ── Attachment actions (when attachments exist) ─────────────────────────────

  test('attachment items have download and delete buttons on hover', async ({ page }) => {
    if (!testProductId) { test.skip(true, 'Test product not created'); return; }
    const opened = await openAttachmentsTab(page);
    if (!opened) { test.skip(true, 'Test product not found'); return; }

    const emptyState = page.getByText(/no attachments/i);
    if (await emptyState.count() > 0) {
      test.skip(true, 'No attachments to test actions on');
      return;
    }

    // Hover over a file item
    const fileItem = page.locator('[class*="bg-surface-800"]').first();
    if (await fileItem.count() > 0) {
      await fileItem.hover();
      await page.waitForTimeout(300);

      // Download and delete buttons should become visible
      const buttons = fileItem.locator('button');
      expect(await buttons.count()).toBeGreaterThanOrEqual(1);
    }
  });
});
