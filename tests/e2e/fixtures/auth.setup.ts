/**
 * Auth Setup — runs before all tests.
 * Logs in as each role and saves browser storage state so
 * individual specs don't need to repeat the login flow.
 *
 * State files land in tests/e2e/.auth/ (git-ignored).
 */

import { test as setup, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const AUTH_DIR = path.join(__dirname, '../.auth');

const roles = [
  { name: 'admin',     email: process.env.ADMIN_EMAIL     || 'admin@test.com',     password: process.env.ADMIN_PASSWORD     || 'password123', file: 'admin.json' },
  { name: 'manager',   email: process.env.MANAGER_EMAIL   || 'manager@test.com',   password: process.env.MANAGER_PASSWORD   || 'password123', file: 'manager.json' },
  { name: 'organiser', email: process.env.ORGANISER_EMAIL || 'organiser@test.com', password: process.env.ORGANISER_PASSWORD || 'password123', file: 'organiser.json' },
  { name: 'employee',  email: process.env.EMPLOYEE_EMAIL  || 'employee@test.com',  password: process.env.EMPLOYEE_PASSWORD  || 'password123', file: 'employee.json' },
  { name: 'viewonly',  email: process.env.VIEWONLY_EMAIL  || 'viewonly@test.com',  password: process.env.VIEWONLY_PASSWORD  || 'password123', file: 'viewonly.json' },
];

if (!fs.existsSync(AUTH_DIR)) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

for (const role of roles) {
  setup(`authenticate as ${role.name}`, async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', role.email);
    await page.fill('input[type="password"]', role.password);
    await page.click('button[type="submit"]');

    // Wait for redirect to board
    await expect(page).toHaveURL(/\/(kanban|$)/, { timeout: 10_000 });

    // Save the authenticated state
    await page.context().storageState({ path: path.join(AUTH_DIR, role.file) });
  });
}
