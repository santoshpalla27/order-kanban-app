/**
 * auth.setup.ts
 *
 * Runs once before all tests (via the "setup" project in playwright.config.ts).
 *
 * 1. Logs in as admin via API to get a token.
 * 2. Creates 4 test users: manager, organiser, employee, view_only.
 * 3. Browser-logs in as each user (including admin) and saves storageState.
 * 4. Writes .auth/test-users.json with created user IDs for teardown.
 */

import { test as setup, expect } from '@playwright/test';
import * as fs   from 'fs';
import * as path from 'path';
import {
  apiLogin,
  createUser,
  getRoleId,
  type User,
} from '../helpers/api.helper';

const BASE_URL   = process.env.BASE_URL  || 'https://app.santoshdevops.cloud';
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL    || 'admin@gmail.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const TEST_PASSWORD  = process.env.TEST_PASSWORD  || 'E2eTest@123';

const AUTH_DIR = path.resolve(__dirname, '../.auth');

interface TestUserRecord {
  id:       number;
  email:    string;
  role:     string;
  role_id:  number;
}

interface TestUsersJson {
  createdAt: string;
  users:     TestUserRecord[];
}

// Ensure .auth directory exists
function ensureAuthDir(): void {
  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  }
}

// Helper: browser-login and save storage state
async function browserLogin(
  page: import('@playwright/test').Page,
  email:    string,
  password: string,
  stateFile: string,
): Promise<void> {
  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState('networkidle');

  // Fill email
  const emailField = page.getByLabel(/email/i).or(page.getByRole('textbox', { name: /email/i }));
  await emailField.fill(email);

  // Fill password
  const passwordField = page.getByLabel(/password/i).or(page.getByRole('textbox', { name: /password/i }));
  await passwordField.fill(password);

  // Submit
  const submitBtn = page.getByRole('button', { name: /login|sign in|submit/i });
  await submitBtn.click();

  // Wait until redirected away from /login
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30_000 });

  // Save storage state
  await page.context().storageState({ path: stateFile });
}

setup('create test users and save auth states', async ({ page }) => {
  ensureAuthDir();

  // ── Step 1: Admin API login ────────────────────────────────────────────────
  const adminToken = await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD);

  // ── Step 2: Save admin browser auth state ─────────────────────────────────
  await browserLogin(page, ADMIN_EMAIL, ADMIN_PASSWORD, path.join(AUTH_DIR, 'admin.json'));

  // ── Step 3: Resolve role IDs ───────────────────────────────────────────────
  const managerRoleId   = await getRoleId(adminToken, 'manager');
  const organiserRoleId = await getRoleId(adminToken, 'organiser');
  const employeeRoleId  = await getRoleId(adminToken, 'employee');
  const viewOnlyRoleId  = await getRoleId(adminToken, 'view_only');

  // ── Step 4: Create test users ──────────────────────────────────────────────
  const timestamp = Date.now();
  const usersToCreate = [
    {
      name:     'E2E Manager',
      email:    `e2e.manager.${timestamp}@test.com`,
      password: TEST_PASSWORD,
      role_id:  managerRoleId,
      role:     'manager',
      authFile: 'manager.json',
    },
    {
      name:     'E2E Organiser',
      email:    `e2e.organiser.${timestamp}@test.com`,
      password: TEST_PASSWORD,
      role_id:  organiserRoleId,
      role:     'organiser',
      authFile: 'organiser.json',
    },
    {
      name:     'E2E Employee',
      email:    `e2e.employee.${timestamp}@test.com`,
      password: TEST_PASSWORD,
      role_id:  employeeRoleId,
      role:     'employee',
      authFile: 'employee.json',
    },
    {
      name:     'E2E ViewOnly',
      email:    `e2e.viewonly.${timestamp}@test.com`,
      password: TEST_PASSWORD,
      role_id:  viewOnlyRoleId,
      role:     'view_only',
      authFile: 'viewonly.json',
    },
  ];

  const createdUsers: TestUserRecord[] = [];

  for (const u of usersToCreate) {
    let createdUser: User;
    try {
      createdUser = await createUser(adminToken, {
        name:     u.name,
        email:    u.email,
        password: u.password,
        role_id:  u.role_id,
      });
    } catch (err) {
      throw new Error(`Failed to create ${u.role} user: ${(err as Error).message}`);
    }

    createdUsers.push({
      id:      createdUser.id,
      email:   u.email,
      role:    u.role,
      role_id: u.role_id,
    });

    // Browser-login as this user and save auth state
    await browserLogin(
      page,
      u.email,
      u.password,
      path.join(AUTH_DIR, u.authFile),
    );
  }

  // ── Step 5: Write test-users.json ─────────────────────────────────────────
  const testUsersJson: TestUsersJson = {
    createdAt: new Date().toISOString(),
    users:     createdUsers,
  };

  fs.writeFileSync(
    path.join(AUTH_DIR, 'test-users.json'),
    JSON.stringify(testUsersJson, null, 2),
    'utf8',
  );

  console.log(
    `[setup] Created ${createdUsers.length} test users. IDs: ${createdUsers.map((u) => u.id).join(', ')}`,
  );
});
