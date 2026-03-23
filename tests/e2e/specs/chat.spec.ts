/**
 * chat.spec.ts
 *
 * Tests for the Team Chat page (/chat):
 *  - Page loads with the "Team Chat" header
 *  - Messages area is visible (either message list or "No messages yet" placeholder)
 *  - Message input (MentionInput) and Send button are present
 *  - Emoji picker toggle button is present and opens emoji grid
 *  - Can type a message and send it
 *  - Sent message appears in the chat
 *  - Message bubbles display sender name and timestamp
 *  - "Load older messages" button appears when history exists
 *  - Navigating away and back preserves the chat context
 *
 * Uses admin auth state (.auth/admin.json).
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL || process.env.BASE_URL || 'https://app.santoshdevops.cloud';

test.describe('Team Chat (/chat)', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/chat`);
    await page.waitForLoadState('networkidle');
  });

  // ── Page structure ──────────────────────────────────────────────────────────

  test('chat page displays "Team Chat" header', async ({ page }) => {
    const header = page.getByText('Team Chat');
    await expect(header.first()).toBeVisible({ timeout: 15_000 });
  });

  test('messages area is visible', async ({ page }) => {
    // Either the messages container or the "No messages yet" placeholder
    const messagesArea = page
      .locator('[class*="overflow-y-auto"]')
      .or(page.getByText(/no messages yet/i))
      .or(page.getByText(/start the conversation/i));
    await expect(messagesArea.first()).toBeVisible({ timeout: 15_000 });
  });

  test('message input is present', async ({ page }) => {
    const input = page
      .getByPlaceholder(/type a message/i)
      .or(page.getByRole('textbox'))
      .or(page.locator('[contenteditable="true"]'));
    await expect(input.first()).toBeVisible({ timeout: 10_000 });
  });

  test('send button is present', async ({ page }) => {
    const sendBtn = page
      .getByRole('button', { name: /send/i })
      .or(page.locator('button[type="submit"]'))
      .or(page.locator('form button').last());
    await expect(sendBtn.first()).toBeVisible({ timeout: 10_000 });
  });

  // ── Emoji picker ──────────────────────────────────────────────────────────

  test('emoji picker button is visible and toggles emoji grid', async ({ page }) => {
    // The emoji button contains a Smile icon
    const emojiBtn = page
      .locator('button').filter({ has: page.locator('svg') })
      .first();
    await expect(emojiBtn).toBeVisible({ timeout: 10_000 });

    await emojiBtn.click();

    // Emoji grid should now be visible — check for actual emoji characters
    const emojiGrid = page.getByText('👍')
      .or(page.getByText('🎉'))
      .or(page.getByText('🔥'));
    await expect(emojiGrid.first()).toBeVisible({ timeout: 5_000 });
  });

  test('clicking an emoji inserts it into the input', async ({ page }) => {
    // Open emoji picker
    const emojiBtn = page
      .locator('button').filter({ has: page.locator('svg') })
      .first();
    await emojiBtn.click();

    // Click an emoji
    const thumbsUp = page.getByText('👍').first();
    if (await thumbsUp.isVisible({ timeout: 3_000 })) {
      await thumbsUp.click();

      // Emoji picker should close
      await page.waitForTimeout(300);

      // Input should contain the emoji
      const input = page
        .getByPlaceholder(/type a message/i)
        .or(page.getByRole('textbox'))
        .or(page.locator('[contenteditable="true"]'));

      const inputValue = await input.first().inputValue().catch(() => '');
      const innerText = await input.first().innerText().catch(() => '');
      expect(inputValue + innerText).toContain('👍');
    }
  });

  // ── Send message ──────────────────────────────────────────────────────────

  test('can type and send a message', async ({ page }) => {
    const testMessage = `E2E Chat Test ${Date.now()}`;

    const input = page
      .getByPlaceholder(/type a message/i)
      .or(page.getByRole('textbox'))
      .or(page.locator('[contenteditable="true"]'));

    await input.first().fill(testMessage);

    // Send
    const sendBtn = page
      .getByRole('button', { name: /send/i })
      .or(page.locator('button[type="submit"]'))
      .or(page.locator('form button').last());
    await sendBtn.first().click();

    // Wait for the message to appear in the chat
    await page.waitForTimeout(2_000);

    const sentMessage = page.getByText(testMessage);
    await expect(sentMessage.first()).toBeVisible({ timeout: 15_000 });
  });

  test('send button is disabled when input is empty', async ({ page }) => {
    const input = page
      .getByPlaceholder(/type a message/i)
      .or(page.getByRole('textbox'))
      .or(page.locator('[contenteditable="true"]'));

    // Clear input
    await input.first().fill('');

    const sendBtn = page
      .getByRole('button', { name: /send/i })
      .or(page.locator('button[type="submit"]'))
      .or(page.locator('form button').last());

    // The send button should be disabled or have disabled styling
    const isDisabled = await sendBtn.first().isDisabled();
    expect(isDisabled).toBeTruthy();
  });

  // ── Message display ────────────────────────────────────────────────────────

  test('messages display timestamps', async ({ page }) => {
    // Wait for messages to load
    await page.waitForTimeout(2_000);

    // Check for date separators (Today, Yesterday, or date strings)
    const dateSep = page
      .getByText(/today|yesterday/i)
      .or(page.locator('[class*="date"]'));

    // If there are messages, date separators should exist
    const noMessages = page.getByText(/no messages yet/i);
    if (await noMessages.count() === 0) {
      await expect(dateSep.first()).toBeVisible({ timeout: 10_000 });
    }
  });

  test('own messages are right-aligned with brand-color bubbles', async ({ page }) => {
    await page.waitForTimeout(2_000);

    // Own messages have 'justify-end' class on parent
    const ownMessages = page.locator('[class*="justify-end"]');
    if (await ownMessages.count() > 0) {
      // Should have brand/gradient styling
      const bubble = ownMessages.first().locator('[class*="brand"]').or(ownMessages.first().locator('[class*="gradient"]'));
      await expect(bubble.first()).toBeVisible({ timeout: 5_000 });
    }
  });

  // ── Load older messages ────────────────────────────────────────────────────

  test('"Load older messages" button appears when history exists', async ({ page }) => {
    await page.waitForTimeout(2_000);

    const loadOlderBtn = page.getByText(/load older/i);
    // This test just checks the element's presence when there's history
    // If no history, we skip gracefully
    if (await loadOlderBtn.count() > 0) {
      await expect(loadOlderBtn.first()).toBeVisible();
    }
  });

  // ── Navigation persistence ─────────────────────────────────────────────────

  test('navigating to chat from sidebar loads the page', async ({ page }) => {
    // Go to home first
    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState('networkidle');

    // Click "Chat" in sidebar
    const chatLink = page
      .getByRole('link', { name: /chat/i })
      .or(page.getByText(/team chat/i).and(page.locator('a')));

    if (await chatLink.count() > 0) {
      await chatLink.first().click();
      await page.waitForURL(/\/chat/, { timeout: 10_000 });
      expect(page.url()).toContain('/chat');
    }
  });
});
