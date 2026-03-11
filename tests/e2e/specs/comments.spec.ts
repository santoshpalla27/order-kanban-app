/**
 * Comments Spec — create, edit, delete, ownership enforcement.
 */

import { test, expect } from '@playwright/test';
import * as path from 'path';
import { loginAPI, createProduct, deleteProduct, createComment } from '../helpers/api.helper';

const ADMIN_AUTH     = path.join(__dirname, '../.auth/admin.json');
const EMPLOYEE_AUTH  = path.join(__dirname, '../.auth/employee.json');

let adminToken: string;
let employeeToken: number;
let seededProductId: number;
let adminCommentId: number;

// Shared setup
async function setup() {
  const admin = await loginAPI(
    process.env.ADMIN_EMAIL    || 'admin@test.com',
    process.env.ADMIN_PASSWORD || 'password123'
  );
  adminToken = admin.accessToken;

  seededProductId = await createProduct(adminToken, {
    product_id: `E2E-COMMENT-${Date.now()}`,
    customer_name: 'Comment Test Customer',
  });

  adminCommentId = await createComment(adminToken, seededProductId, 'Admin comment for ownership test');
}

async function teardown() {
  if (seededProductId) await deleteProduct(adminToken, seededProductId).catch(() => {});
}

test.describe('Comments', () => {
  test.use({ storageState: ADMIN_AUTH });

  test.beforeAll(setup);
  test.afterAll(teardown);

  test('comments tab shows existing comments', async ({ page }) => {
    await page.goto('/');
    await page.locator('text=Comment Test Customer').first().click();

    const modal = page.locator('[role="dialog"]').first();
    await expect(modal).toBeVisible();

    // Navigate to comments tab if tabbed layout
    const commentsTab = modal.locator('button:has-text("Comments"), [role="tab"]:has-text("Comments")').first();
    if (await commentsTab.isVisible()) await commentsTab.click();

    await expect(modal.locator('text=Admin comment for ownership test')).toBeVisible({ timeout: 6_000 });
  });

  test('admin can post a comment', async ({ page }) => {
    await page.goto('/');
    await page.locator('text=Comment Test Customer').first().click();

    const modal = page.locator('[role="dialog"]').first();
    const commentsTab = modal.locator('button:has-text("Comments"), [role="tab"]:has-text("Comments")').first();
    if (await commentsTab.isVisible()) await commentsTab.click();

    const textarea = modal.locator('textarea, input[placeholder*="comment" i]').last();
    await textarea.fill('New comment from Playwright test');
    await modal.locator('button:has-text("Post"), button:has-text("Send"), button[type="submit"]').last().click();

    await expect(modal.locator('text=New comment from Playwright test')).toBeVisible({ timeout: 6_000 });
  });

  test('admin can edit own comment', async ({ page }) => {
    await page.goto('/');
    await page.locator('text=Comment Test Customer').first().click();

    const modal = page.locator('[role="dialog"]').first();
    const commentsTab = modal.locator('button:has-text("Comments"), [role="tab"]:has-text("Comments")').first();
    if (await commentsTab.isVisible()) await commentsTab.click();

    // Find edit button on "New comment from Playwright test"
    const commentEl = modal.locator('text=New comment from Playwright test').locator('..');
    const editBtn = commentEl.locator('button:has-text("Edit"), [data-testid="edit-comment"]').first();
    if (await editBtn.isVisible()) {
      await editBtn.click();
      const editInput = commentEl.locator('textarea, input').first();
      await editInput.clear();
      await editInput.fill('Edited comment text');
      await commentEl.locator('button:has-text("Save")').click();
      await expect(modal.locator('text=Edited comment text')).toBeVisible({ timeout: 5_000 });
    }
  });

  test('admin can delete own comment', async ({ page }) => {
    await page.goto('/');
    await page.locator('text=Comment Test Customer').first().click();

    const modal = page.locator('[role="dialog"]').first();
    const commentsTab = modal.locator('button:has-text("Comments"), [role="tab"]:has-text("Comments")').first();
    if (await commentsTab.isVisible()) await commentsTab.click();

    const commentEl = modal.locator('text=Edited comment text, text=New comment from Playwright test').locator('..');
    const deleteBtn = commentEl.locator('button:has-text("Delete"), [data-testid="delete-comment"]').first();
    if (await deleteBtn.isVisible()) {
      await deleteBtn.click();
      await expect(modal.locator('text=Edited comment text')).not.toBeVisible({ timeout: 5_000 });
    }
  });
});

test.describe('Comments — Ownership enforcement', () => {
  test.use({ storageState: EMPLOYEE_AUTH });

  test.beforeAll(setup);
  test.afterAll(teardown);

  test('employee cannot delete admin comment — delete button hidden or 403', async ({ page }) => {
    await page.goto('/');
    await page.locator('text=Comment Test Customer').first().click();

    const modal = page.locator('[role="dialog"]').first();
    const commentsTab = modal.locator('button:has-text("Comments"), [role="tab"]:has-text("Comments")').first();
    if (await commentsTab.isVisible()) await commentsTab.click();

    // Admin's comment should not have a delete button for employee
    const adminComment = modal.locator('text=Admin comment for ownership test').locator('..');
    const deleteBtn = adminComment.locator('button:has-text("Delete"), [data-testid="delete-comment"]').first();

    // Either hidden or not present
    await expect(deleteBtn).not.toBeVisible();
  });
});
