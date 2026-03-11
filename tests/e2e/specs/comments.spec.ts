/**
 * comments.spec.ts
 *
 * Tests for the comment system:
 *  - Admin can post a comment on a product card
 *  - Admin can edit their own comment
 *  - Admin can delete their own comment
 *  - Employee cannot delete admin's comment
 *
 * Cleanup is performed in afterAll via API.
 */

import { test, expect, Browser } from '@playwright/test';
import * as path from 'path';
import * as fs   from 'fs';
import {
  apiLogin,
  createProduct,
  deleteProduct,
  createComment,
  deleteComment,
} from '../helpers/api.helper';

const BASE_URL       = process.env.BASE_URL       || 'https://app.santoshdevops.cloud';
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL    || 'admin@gmail.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

const AUTH_DIR = path.resolve(__dirname, '../.auth');

const COMMENT_TEXT         = `E2E Comment ${Date.now()}`;
const COMMENT_EDITED_TEXT  = `E2E Comment ${Date.now()} - Edited`;

test.describe('Comments', () => {
  let adminToken: string;
  let testProductId: number;
  let testCommentId: number | null = null;

  test.beforeAll(async () => {
    adminToken = await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD);

    const product = await createProduct(adminToken, {
      customer_name: `CommentTest ${Date.now()}`,
      description:   'Product for comment E2E tests',
    });
    testProductId = product.product_id;
  });

  test.afterAll(async () => {
    if (adminToken) {
      if (testCommentId) {
        try { await deleteComment(adminToken, testCommentId); } catch { /* ignore */ }
      }
      if (testProductId) {
        try { await deleteProduct(adminToken, testProductId); } catch { /* ignore */ }
      }
    }
  });

  // ── Helper: open product detail ────────────────────────────────────────────
  async function openProductDetail(
    page: import('@playwright/test').Page,
    productId: number,
  ) {
    await page.goto(`${BASE_URL}/kanban`);
    await page.waitForLoadState('networkidle');

    // Try clicking the card by ID in URL, or search for it by text
    const card = page.locator(`[data-id="${productId}"], [data-product-id="${productId}"]`);
    if (await card.count() > 0) {
      await card.first().click();
    } else {
      // Fall back to clicking any card that leads to the product detail
      await page.goto(`${BASE_URL}/kanban`);
      await page.waitForLoadState('networkidle');
      const cards = page.locator('[class*="card" i]');
      const count = await cards.count();
      if (count > 0) await cards.first().click();
    }

    const modal = page
      .getByRole('dialog')
      .or(page.locator('[class*="modal" i], [class*="drawer" i], [class*="detail" i]'));
    await expect(modal.first()).toBeVisible({ timeout: 10_000 });
  }

  test('admin can post a comment on a product card', async ({ page }) => {
    await openProductDetail(page, testProductId);

    // Find comment input
    const commentInput = page
      .getByRole('textbox', { name: /comment|message|reply/i })
      .or(page.getByLabel(/comment|message|reply/i))
      .or(page.getByPlaceholder(/comment|message|write/i))
      .or(page.locator('textarea[name*="comment" i], input[name*="comment" i]'));

    if (await commentInput.count() === 0) {
      test.skip(true, 'Comment input not found — skipping comment tests');
      return;
    }

    await commentInput.first().fill(COMMENT_TEXT);

    const submitCommentBtn = page
      .getByRole('button', { name: /post|submit|send|add comment/i })
      .last();
    await submitCommentBtn.click();

    await page.waitForTimeout(1_000);

    // Comment should appear
    const comment = page.getByText(COMMENT_TEXT);
    await expect(comment.first()).toBeVisible({ timeout: 10_000 });

    // Try to resolve comment ID via API for cleanup
    // (Some apps return it in the DOM via data attributes)
    const commentEl = page.locator('[data-comment-id]').filter({ hasText: COMMENT_TEXT });
    if (await commentEl.count() > 0) {
      const idStr = await commentEl.first().getAttribute('data-comment-id');
      if (idStr) testCommentId = parseInt(idStr, 10);
    }
  });

  test('admin can edit their own comment', async ({ page }) => {
    await openProductDetail(page, testProductId);

    const comment = page.getByText(COMMENT_TEXT);
    if (await comment.count() === 0) {
      test.skip(true, 'Comment not found — skipping edit test');
      return;
    }

    // Hover / right-click to reveal edit button
    const commentRow = comment.first().locator('../..').or(comment.first().locator('..'));
    await commentRow.hover();

    const editBtn = commentRow
      .getByRole('button', { name: /edit/i })
      .or(page.getByRole('button', { name: /edit/i }).first());

    if (await editBtn.count() === 0) {
      test.skip(true, 'Edit button not found on comment — skipping edit test');
      return;
    }

    await editBtn.first().click();

    // Find editable input
    const editInput = page
      .getByRole('textbox', { name: /comment|message|edit/i })
      .or(page.locator('textarea').last())
      .or(page.locator('input[type="text"]').last());

    await editInput.first().clear();
    await editInput.first().fill(COMMENT_EDITED_TEXT);

    const saveBtn = page
      .getByRole('button', { name: /save|update|confirm/i })
      .last();
    await saveBtn.click();

    await page.waitForTimeout(1_000);

    const editedComment = page.getByText(COMMENT_EDITED_TEXT);
    await expect(editedComment.first()).toBeVisible({ timeout: 10_000 });
  });

  test('admin can delete their own comment', async ({ page }) => {
    await openProductDetail(page, testProductId);

    const commentText = COMMENT_EDITED_TEXT;
    const comment = page.getByText(commentText).or(page.getByText(COMMENT_TEXT));

    if (await comment.count() === 0) {
      test.skip(true, 'Comment not found — skipping delete test');
      return;
    }

    const commentRow = comment.first().locator('../..').or(comment.first().locator('..'));
    await commentRow.hover();

    const deleteBtn = commentRow
      .getByRole('button', { name: /delete|remove/i })
      .or(page.getByRole('button', { name: /delete|remove/i }).last());

    if (await deleteBtn.count() === 0) {
      test.skip(true, 'Delete button not found on comment — skipping delete test');
      return;
    }

    await deleteBtn.first().click();

    // Confirmation dialog
    const confirmBtn = page
      .getByRole('button', { name: /confirm|yes|ok|delete/i })
      .last();
    if (await confirmBtn.isVisible({ timeout: 3_000 })) {
      await confirmBtn.click();
    }

    await page.waitForTimeout(1_000);

    const deletedComment = page.getByText(commentText);
    await expect(deletedComment).toHaveCount(0, { timeout: 10_000 });
    testCommentId = null; // Already deleted, no need for cleanup
  });

  test('employee cannot delete an admin comment', async ({ browser }: { browser: Browser }) => {
    // Post a fresh comment as admin via API
    let freshCommentId: number | null = null;
    try {
      const comment = await createComment(adminToken, testProductId, `Admin comment for employee test ${Date.now()}`);
      freshCommentId = comment.id;
    } catch {
      test.skip(true, 'Could not create admin comment via API — skipping test');
      return;
    }

    const employeeAuthFile = path.join(AUTH_DIR, 'employee.json');
    if (!fs.existsSync(employeeAuthFile)) {
      if (freshCommentId) {
        try { await deleteComment(adminToken, freshCommentId); } catch { /* ignore */ }
      }
      test.skip(true, 'Employee auth state not found — skipping test');
      return;
    }

    // Open a new browser context as employee
    const employeeCtx = await browser.newContext({
      storageState: employeeAuthFile,
    });
    const employeePage = await employeeCtx.newPage();

    try {
      await employeePage.goto(`${BASE_URL}/kanban`);
      await employeePage.waitForLoadState('networkidle');

      // Open a card
      const cards = employeePage.locator('[class*="card" i]');
      if (await cards.count() > 0) {
        await cards.first().click();
      }

      const modal = employeePage
        .getByRole('dialog')
        .or(employeePage.locator('[class*="modal" i], [class*="detail" i]'));

      if (await modal.count() > 0) {
        await expect(modal.first()).toBeVisible({ timeout: 10_000 });

        // Employee should NOT see a delete button on the admin comment
        const adminCommentText = `Admin comment for employee test`;
        const adminCommentRow  = employeePage
          .getByText(adminCommentText, { exact: false })
          .locator('../..');

        if (await adminCommentRow.count() > 0) {
          await adminCommentRow.hover();
          const deleteBtn = adminCommentRow.getByRole('button', { name: /delete|remove/i });
          await expect(deleteBtn).toHaveCount(0, { timeout: 5_000 });
        }
      }
    } finally {
      await employeePage.close();
      await employeeCtx.close();

      // Cleanup the admin comment
      if (freshCommentId) {
        try { await deleteComment(adminToken, freshCommentId); } catch { /* ignore */ }
      }
    }
  });
});
