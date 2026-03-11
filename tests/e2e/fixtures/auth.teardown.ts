/**
 * auth.teardown.ts
 *
 * Runs after all tests (via the "teardown" project in playwright.config.ts).
 *
 * Reads .auth/test-users.json and deletes all created test users via API.
 */

import { test as teardown } from '@playwright/test';
import * as fs   from 'fs';
import * as path from 'path';
import { apiLogin, deleteUser } from '../helpers/api.helper';

const ADMIN_EMAIL    = process.env.ADMIN_EMAIL    || 'admin@gmail.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

const TEST_USERS_FILE = path.resolve(__dirname, '../.auth/test-users.json');

interface TestUserRecord {
  id:      number;
  email:   string;
  role:    string;
  role_id: number;
}

interface TestUsersJson {
  createdAt: string;
  users:     TestUserRecord[];
}

teardown('delete test users', async () => {
  if (!fs.existsSync(TEST_USERS_FILE)) {
    console.log('[teardown] test-users.json not found — nothing to clean up.');
    return;
  }

  let testUsersJson: TestUsersJson;
  try {
    testUsersJson = JSON.parse(fs.readFileSync(TEST_USERS_FILE, 'utf8')) as TestUsersJson;
  } catch (err) {
    console.error('[teardown] Failed to parse test-users.json:', (err as Error).message);
    return;
  }

  const users = testUsersJson.users || [];
  if (users.length === 0) {
    console.log('[teardown] No test users to delete.');
    return;
  }

  let adminToken: string;
  try {
    adminToken = await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD);
  } catch (err) {
    console.error('[teardown] Admin login failed:', (err as Error).message);
    return;
  }

  let deletedCount = 0;
  for (const user of users) {
    try {
      await deleteUser(adminToken, user.id);
      console.log(`[teardown] Deleted user ${user.id} (${user.email} / ${user.role})`);
      deletedCount++;
    } catch (err) {
      // Log but don't throw — continue deleting remaining users
      console.warn(
        `[teardown] Failed to delete user ${user.id} (${user.email}): ${(err as Error).message}`,
      );
    }
  }

  console.log(`[teardown] Deleted ${deletedCount} / ${users.length} test users.`);

  // Remove the file so it doesn't linger between runs
  try {
    fs.unlinkSync(TEST_USERS_FILE);
  } catch {
    // Not critical
  }
});
