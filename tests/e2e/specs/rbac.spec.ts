/**
 * rbac.spec.ts
 *
 * Role-Based Access Control tests.
 * One describe block per role, each opening a separate browser context
 * loaded from the saved storageState for that role.
 *
 * Checks:
 *  - admin:     New Product button visible, Trash link visible, /admin accessible, /trash accessible
 *  - manager:   New Product button visible, Trash link visible, /trash accessible, /admin NOT accessible
 *  - organiser: New Product button visible, Trash link NOT visible, /trash NOT accessible, /admin NOT accessible
 *  - employee:  New Product button NOT visible, Trash link NOT visible, comment input visible
 *  - view_only: New Product button NOT visible, Trash link NOT visible, comment input NOT visible
 */

import { test, expect, Browser, BrowserContext, Page } from '@playwright/test';
import * as path from 'path';
import * as fs   from 'fs';

const BASE_URL = process.env.BASE_URL || 'https://app.santoshdevops.cloud';
const AUTH_DIR = path.resolve(__dirname, '../.auth');

// ─── Helper: open a context with role's storage state ─────────────────────────

async function openRoleContext(
  browser: Browser,
  role: string,
): Promise<{ ctx: BrowserContext; page: Page } | null> {
  const stateFile = path.join(AUTH_DIR, `${role}.json`);
  if (!fs.existsSync(stateFile)) {
    return null;
  }
  const ctx  = await browser.newContext({ storageState: stateFile });
  const page = await ctx.newPage();
  return { ctx, page };
}

// ─── Reusable selectors ────────────────────────────────────────────────────────

function newProductBtn(page: Page) {
  return page
    .getByRole('button', { name: /new product|add product|create product|\+ product/i })
    .or(page.getByText(/new product|add product|\+ product/i).and(page.locator('button')));
}

function trashLink(page: Page) {
  return page
    .getByRole('link',   { name: /trash/i })
    .or(page.getByRole('menuitem', { name: /trash/i }))
    .or(page.getByText(/trash/i).and(page.locator('a, [role="menuitem"]')));
}

function commentInput(page: Page) {
  return page
    .getByRole('textbox', { name: /comment|message|reply/i })
    .or(page.getByLabel(/comment|message|reply/i))
    .or(page.getByPlaceholder(/comment|message|write/i))
    .or(page.locator('textarea[name*="comment" i], input[name*="comment" i]'));
}

// ─── Helper: open a card to check comment input ────────────────────────────────

async function openFirstCard(page: Page) {
  const cards = page.locator('[class*="card" i], [class*="item" i]');
  const count = await cards.count();
  if (count === 0) return false;
  await cards.first().click();
  const modal = page
    .getByRole('dialog')
    .or(page.locator('[class*="modal" i], [class*="detail" i], [class*="drawer" i]'));
  const visible = await modal.first().isVisible({ timeout: 8_000 }).catch(() => false);
  return visible;
}

// ══════════════════════════════════════════════════════════════════════════════
//  ADMIN
// ══════════════════════════════════════════════════════════════════════════════

test.describe('RBAC: admin role', () => {
  let ctx:  BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    const result = await openRoleContext(browser, 'admin');
    if (!result) {
      test.skip(true, 'admin.json not found — skipping admin RBAC tests');
      return;
    }
    ctx  = result.ctx;
    page = result.page;
    await page.goto(`${BASE_URL}/kanban`);
    await page.waitForLoadState('networkidle');
  });

  test.afterAll(async () => {
    await page?.close();
    await ctx?.close();
  });

  test('admin sees New Product button', async () => {
    await expect(newProductBtn(page).first()).toBeVisible({ timeout: 10_000 });
  });

  test('admin sees Trash link in navigation', async () => {
    await expect(trashLink(page).first()).toBeVisible({ timeout: 10_000 });
  });

  test('admin can access /admin', async () => {
    await page.goto(`${BASE_URL}/admin`);
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('/admin');
    expect(page.url()).not.toContain('/login');
    expect(page.url()).not.toContain('/kanban');
  });

  test('admin can access /trash', async () => {
    await page.goto(`${BASE_URL}/trash`);
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('/trash');
    expect(page.url()).not.toContain('/login');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  MANAGER
// ══════════════════════════════════════════════════════════════════════════════

test.describe('RBAC: manager role', () => {
  let ctx:  BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    const result = await openRoleContext(browser, 'manager');
    if (!result) {
      test.skip(true, 'manager.json not found — skipping manager RBAC tests');
      return;
    }
    ctx  = result.ctx;
    page = result.page;
    await page.goto(`${BASE_URL}/kanban`);
    await page.waitForLoadState('networkidle');
  });

  test.afterAll(async () => {
    await page?.close();
    await ctx?.close();
  });

  test('manager sees New Product button', async () => {
    await expect(newProductBtn(page).first()).toBeVisible({ timeout: 10_000 });
  });

  test('manager sees Trash link in navigation', async () => {
    await expect(trashLink(page).first()).toBeVisible({ timeout: 10_000 });
  });

  test('manager can access /trash', async () => {
    await page.goto(`${BASE_URL}/trash`);
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('/trash');
    expect(page.url()).not.toContain('/login');
  });

  test('manager cannot access /admin (redirected)', async () => {
    await page.goto(`${BASE_URL}/admin`);
    await page.waitForLoadState('networkidle');
    // Should be redirected away from /admin
    const currentUrl = page.url();
    const isOnAdmin  = currentUrl.includes('/admin') && !currentUrl.includes('/login') && !currentUrl.includes('/kanban');
    expect(isOnAdmin).toBeFalsy();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  ORGANISER
// ══════════════════════════════════════════════════════════════════════════════

test.describe('RBAC: organiser role', () => {
  let ctx:  BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    const result = await openRoleContext(browser, 'organiser');
    if (!result) {
      test.skip(true, 'organiser.json not found — skipping organiser RBAC tests');
      return;
    }
    ctx  = result.ctx;
    page = result.page;
    await page.goto(`${BASE_URL}/kanban`);
    await page.waitForLoadState('networkidle');
  });

  test.afterAll(async () => {
    await page?.close();
    await ctx?.close();
  });

  test('organiser sees New Product button', async () => {
    await expect(newProductBtn(page).first()).toBeVisible({ timeout: 10_000 });
  });

  test('organiser does NOT see Trash link', async () => {
    await expect(trashLink(page)).toHaveCount(0, { timeout: 5_000 });
  });

  test('organiser cannot access /trash (redirected)', async () => {
    await page.goto(`${BASE_URL}/trash`);
    await page.waitForLoadState('networkidle');
    const currentUrl = page.url();
    const isOnTrash  = currentUrl.includes('/trash') && !currentUrl.includes('/login') && !currentUrl.includes('/kanban');
    expect(isOnTrash).toBeFalsy();
  });

  test('organiser cannot access /admin (redirected)', async () => {
    await page.goto(`${BASE_URL}/admin`);
    await page.waitForLoadState('networkidle');
    const currentUrl = page.url();
    const isOnAdmin  = currentUrl.includes('/admin') && !currentUrl.includes('/login') && !currentUrl.includes('/kanban');
    expect(isOnAdmin).toBeFalsy();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  EMPLOYEE
// ══════════════════════════════════════════════════════════════════════════════

test.describe('RBAC: employee role', () => {
  let ctx:  BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    const result = await openRoleContext(browser, 'employee');
    if (!result) {
      test.skip(true, 'employee.json not found — skipping employee RBAC tests');
      return;
    }
    ctx  = result.ctx;
    page = result.page;
    await page.goto(`${BASE_URL}/kanban`);
    await page.waitForLoadState('networkidle');
  });

  test.afterAll(async () => {
    await page?.close();
    await ctx?.close();
  });

  test('employee does NOT see New Product button', async () => {
    await expect(newProductBtn(page)).toHaveCount(0, { timeout: 5_000 });
  });

  test('employee does NOT see Trash link', async () => {
    await expect(trashLink(page)).toHaveCount(0, { timeout: 5_000 });
  });

  test('employee can open a card and see comment input', async () => {
    const opened = await openFirstCard(page);
    if (!opened) {
      test.skip(true, 'No cards found or modal did not open — skipping comment input check');
      return;
    }
    await expect(commentInput(page).first()).toBeVisible({ timeout: 10_000 });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  VIEW ONLY
// ══════════════════════════════════════════════════════════════════════════════

test.describe('RBAC: view_only role', () => {
  let ctx:  BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    const result = await openRoleContext(browser, 'viewonly');
    if (!result) {
      test.skip(true, 'viewonly.json not found — skipping view_only RBAC tests');
      return;
    }
    ctx  = result.ctx;
    page = result.page;
    await page.goto(`${BASE_URL}/kanban`);
    await page.waitForLoadState('networkidle');
  });

  test.afterAll(async () => {
    await page?.close();
    await ctx?.close();
  });

  test('view_only does NOT see New Product button', async () => {
    await expect(newProductBtn(page)).toHaveCount(0, { timeout: 5_000 });
  });

  test('view_only does NOT see Trash link', async () => {
    await expect(trashLink(page)).toHaveCount(0, { timeout: 5_000 });
  });

  test('view_only cannot post comments (input absent or disabled)', async () => {
    const opened = await openFirstCard(page);
    if (!opened) {
      // No cards — just verify the board loaded and there's no comment input at top level
      await expect(commentInput(page)).toHaveCount(0, { timeout: 5_000 });
      return;
    }

    // Comment input should either be absent or disabled for view_only
    const input = commentInput(page);
    const inputCount = await input.count();

    if (inputCount === 0) {
      // Input not present — pass
      return;
    }

    // If present, it should be disabled
    const isDisabled = await input.first().isDisabled();
    expect(isDisabled).toBeTruthy();
  });
});
