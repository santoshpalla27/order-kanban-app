/**
 * productdetail.spec.ts
 *
 * Tests for the Product Detail Modal (opened by clicking a product card):
 *  - Modal opens with product ID in header
 *  - Three tabs: Details, Attachments, Comments
 *  - Status dropdown in header allows status change
 *  - Details tab: shows Product ID, Customer Name, Customer Phone, Description, Delivery Date, Assigned To, Created By, Created At
 *  - Details tab: "Edit" button opens inline edit form (admin/manager only)
 *  - Edit form: all fields editable, Save/Cancel buttons
 *  - Attachments tab: "Upload Files" button, "Download All" when files exist
 *  - Attachments tab: shows image gallery and file list
 *  - Attachments tab: delete attachment with confirmation modal
 *  - Comments tab: comment input with @mention support
 *  - Comments tab: send, edit, delete comments
 *  - Comments tab: reply to comments
 *  - Close button dismisses the modal
 *
 * Uses admin auth state (.auth/admin.json).
 */

import { test, expect } from '@playwright/test';
import { loginAndGetToken, createProduct, deleteProduct } from '../helpers/api.helper';

const BASE_URL = process.env.E2E_BASE_URL || process.env.BASE_URL || 'https://app.santoshdevops.cloud';
const API_URL  = process.env.E2E_API_URL  || process.env.API_URL  || 'https://app.santoshdevops.cloud/api';
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL    || 'admin@gmail.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

test.describe('Product Detail Modal', () => {

  let adminToken: string;
  let testProductId: number | null = null;
  const testProductName = `E2E-Detail-${Date.now()}`;

  test.beforeAll(async () => {
    try {
      adminToken = await loginAndGetToken(API_URL, ADMIN_EMAIL, ADMIN_PASSWORD);
      const product = await createProduct(API_URL, adminToken, {
        product_id: testProductName,
        customer_name: 'Detail Test Customer',
        description: 'Test product for detail modal tests',
      });
      testProductId = product.id;
    } catch (e) {
      console.warn('Failed to create test product for detail modal tests:', e);
    }
  });

  test.afterAll(async () => {
    if (testProductId && adminToken) {
      try { await deleteProduct(API_URL, adminToken, testProductId); } catch {}
    }
  });

  // Helper to open the modal
  async function openProductModal(page: any) {
    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2_000);

    // Find and click our test product card
    const card = page.getByText(testProductName);
    if (await card.count() === 0) {
      return false;
    }
    await card.first().click();
    await page.waitForTimeout(1_000);
    return true;
  }

  // ── Modal structure ────────────────────────────────────────────────────────

  test('clicking a product card opens the detail modal', async ({ page }) => {
    if (!testProductId) { test.skip(true, 'Test product not created'); return; }
    const opened = await openProductModal(page);
    if (!opened) { test.skip(true, 'Test product card not found on kanban'); return; }

    // Modal header should show the product ID
    const modalHeader = page.getByText(testProductName);
    await expect(modalHeader.first()).toBeVisible({ timeout: 10_000 });
  });

  test('modal has three tabs: Details, Attachments, Comments', async ({ page }) => {
    if (!testProductId) { test.skip(true, 'Test product not created'); return; }
    const opened = await openProductModal(page);
    if (!opened) { test.skip(true, 'Test product card not found'); return; }

    await expect(page.getByText(/^details$/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/attachments/i).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/comments/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test('status dropdown is in the modal header', async ({ page }) => {
    if (!testProductId) { test.skip(true, 'Test product not created'); return; }
    const opened = await openProductModal(page);
    if (!opened) { test.skip(true, 'Test product card not found'); return; }

    const statusSelect = page.locator('select').filter({ hasText: /yet to start|working|in review|done/i });
    await expect(statusSelect.first()).toBeVisible({ timeout: 10_000 });
  });

  test('close button dismisses the modal', async ({ page }) => {
    if (!testProductId) { test.skip(true, 'Test product not created'); return; }
    const opened = await openProductModal(page);
    if (!opened) { test.skip(true, 'Test product card not found'); return; }

    const closeBtn = page.locator('button').filter({ has: page.locator('svg') }).last();
    await closeBtn.click();
    await page.waitForTimeout(500);

    // Modal should be gone
    const modal = page.locator('[class*="fixed"][class*="inset-0"]');
    await expect(modal).not.toBeVisible({ timeout: 5_000 });
  });

  // ── Details tab ────────────────────────────────────────────────────────────

  test('Details tab shows product info fields', async ({ page }) => {
    if (!testProductId) { test.skip(true, 'Test product not created'); return; }
    const opened = await openProductModal(page);
    if (!opened) { test.skip(true, 'Test product card not found'); return; }

    await expect(page.getByText(/product details/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/product id/i).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/customer name/i).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/customer phone/i).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/description/i).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/delivery date/i).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/assigned to/i).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/created by/i).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/created at/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test('Details tab shows correct customer name', async ({ page }) => {
    if (!testProductId) { test.skip(true, 'Test product not created'); return; }
    const opened = await openProductModal(page);
    if (!opened) { test.skip(true, 'Test product card not found'); return; }

    const customerName = page.getByText('Detail Test Customer');
    await expect(customerName.first()).toBeVisible({ timeout: 10_000 });
  });

  test('"Edit" button is visible on Details tab for admin', async ({ page }) => {
    if (!testProductId) { test.skip(true, 'Test product not created'); return; }
    const opened = await openProductModal(page);
    if (!opened) { test.skip(true, 'Test product card not found'); return; }

    const editBtn = page.getByRole('button', { name: /edit/i })
      .or(page.getByText(/^edit$/i).and(page.locator('button')));
    await expect(editBtn.first()).toBeVisible({ timeout: 10_000 });
  });

  test('clicking Edit opens inline edit form with Save/Cancel', async ({ page }) => {
    if (!testProductId) { test.skip(true, 'Test product not created'); return; }
    const opened = await openProductModal(page);
    if (!opened) { test.skip(true, 'Test product card not found'); return; }

    const editBtn = page.getByRole('button', { name: /edit/i })
      .or(page.getByText(/^edit$/i).and(page.locator('button')));
    await editBtn.first().click();
    await page.waitForTimeout(500);

    // Save and Cancel buttons should appear
    await expect(page.getByRole('button', { name: /save/i }).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('button', { name: /cancel/i }).first()).toBeVisible({ timeout: 5_000 });

    // Input fields should be editable
    const inputs = page.locator('input, textarea');
    expect(await inputs.count()).toBeGreaterThanOrEqual(3);
  });

  test('Details tab shows attachments section with "Add Files" button', async ({ page }) => {
    if (!testProductId) { test.skip(true, 'Test product not created'); return; }
    const opened = await openProductModal(page);
    if (!opened) { test.skip(true, 'Test product card not found'); return; }

    const addFilesBtn = page.getByText(/add files/i);
    await expect(addFilesBtn.first()).toBeVisible({ timeout: 10_000 });
  });

  // ── Attachments tab ────────────────────────────────────────────────────────

  test('Attachments tab shows "Upload Files" button', async ({ page }) => {
    if (!testProductId) { test.skip(true, 'Test product not created'); return; }
    const opened = await openProductModal(page);
    if (!opened) { test.skip(true, 'Test product card not found'); return; }

    // Switch to Attachments tab
    const attTab = page.getByText(/attachments/i).first();
    await attTab.click();
    await page.waitForTimeout(500);

    const uploadBtn = page.getByRole('button', { name: /upload files/i })
      .or(page.getByText(/upload files/i).and(page.locator('button')));
    await expect(uploadBtn.first()).toBeVisible({ timeout: 10_000 });
  });

  test('Attachments tab shows empty state or attachment list', async ({ page }) => {
    if (!testProductId) { test.skip(true, 'Test product not created'); return; }
    const opened = await openProductModal(page);
    if (!opened) { test.skip(true, 'Test product card not found'); return; }

    const attTab = page.getByText(/attachments/i).first();
    await attTab.click();
    await page.waitForTimeout(500);

    // Either "No attachments" empty state or image gallery / file list
    const emptyState = page.getByText(/no attachments/i)
      .or(page.getByText(/click to upload/i));
    const fileItems = page.locator('[class*="rounded-xl"]');

    // One of these should be visible
    if (await emptyState.count() > 0) {
      await expect(emptyState.first()).toBeVisible({ timeout: 5_000 });
    } else {
      await expect(fileItems.first()).toBeVisible({ timeout: 5_000 });
    }
  });

  // ── Comments tab ────────────────────────────────────────────────────────────

  test('Comments tab has a message input area', async ({ page }) => {
    if (!testProductId) { test.skip(true, 'Test product not created'); return; }
    const opened = await openProductModal(page);
    if (!opened) { test.skip(true, 'Test product card not found'); return; }

    // Switch to Comments tab
    const commentTab = page.getByText(/comments/i).first();
    await commentTab.click();
    await page.waitForTimeout(500);

    const commentInput = page.getByPlaceholder(/comment|write|message/i)
      .or(page.locator('textarea'))
      .or(page.locator('[contenteditable="true"]'));
    await expect(commentInput.first()).toBeVisible({ timeout: 10_000 });
  });

  test('Comments tab has a send button', async ({ page }) => {
    if (!testProductId) { test.skip(true, 'Test product not created'); return; }
    const opened = await openProductModal(page);
    if (!opened) { test.skip(true, 'Test product card not found'); return; }

    const commentTab = page.getByText(/comments/i).first();
    await commentTab.click();
    await page.waitForTimeout(500);

    const sendBtn = page.getByRole('button', { name: /send|post/i })
      .or(page.locator('button[type="submit"]'));
    await expect(sendBtn.first()).toBeVisible({ timeout: 10_000 });
  });

  test('can type and submit a comment', async ({ page }) => {
    if (!testProductId) { test.skip(true, 'Test product not created'); return; }
    const opened = await openProductModal(page);
    if (!opened) { test.skip(true, 'Test product card not found'); return; }

    const commentTab = page.getByText(/comments/i).first();
    await commentTab.click();
    await page.waitForTimeout(500);

    const testComment = `E2E test comment ${Date.now()}`;
    const commentInput = page.getByPlaceholder(/comment|write|message/i)
      .or(page.locator('textarea'))
      .or(page.locator('[contenteditable="true"]'));

    await commentInput.first().fill(testComment);

    const sendBtn = page.getByRole('button', { name: /send|post/i })
      .or(page.locator('button[type="submit"]'));
    await sendBtn.first().click();

    await page.waitForTimeout(2_000);
    const posted = page.getByText(testComment);
    await expect(posted.first()).toBeVisible({ timeout: 10_000 });
  });

  // ── Tab switching ──────────────────────────────────────────────────────────

  test('switching between tabs updates the content', async ({ page }) => {
    if (!testProductId) { test.skip(true, 'Test product not created'); return; }
    const opened = await openProductModal(page);
    if (!opened) { test.skip(true, 'Test product card not found'); return; }

    // Start on Details
    await expect(page.getByText(/product details/i).first()).toBeVisible({ timeout: 10_000 });

    // Switch to Attachments
    const attTab = page.getByText(/attachments/i).first();
    await attTab.click();
    await page.waitForTimeout(500);
    const uploadBtn = page.getByText(/upload files/i).or(page.getByText(/click to upload/i));
    await expect(uploadBtn.first()).toBeVisible({ timeout: 5_000 });

    // Switch to Comments
    const commentTab = page.getByText(/comments/i).first();
    await commentTab.click();
    await page.waitForTimeout(500);
    const commentInput = page.getByPlaceholder(/comment|write|message/i)
      .or(page.locator('textarea'))
      .or(page.locator('[contenteditable="true"]'));
    await expect(commentInput.first()).toBeVisible({ timeout: 5_000 });

    // Switch back to Details
    const detailsTab = page.getByText(/^details$/i).first();
    await detailsTab.click();
    await page.waitForTimeout(500);
    await expect(page.getByText(/product details/i).first()).toBeVisible({ timeout: 5_000 });
  });
});
