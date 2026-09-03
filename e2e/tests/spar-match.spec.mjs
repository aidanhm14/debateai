// Two real browser contexts, two signed-in Google accounts, one /spar queue.
// This is the test `?draftdemo=1` was a workaround for: it needs two humans
// and a live queue, and Playwright can be both humans.
//
// SCAFFOLD, not yet run end to end. It skips itself unless two saved
// sessions exist (see save-auth.mjs), and it refuses to run while a real
// person is waiting in the live queue, because /spar is a live queue with
// humans in it and loading it is not a read-only act.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const STATE_A = process.env.E2E_STATE_A || 'auth/a.json';
const STATE_B = process.env.E2E_STATE_B || 'auth/b.json';
const haveStates = fs.existsSync(STATE_A) && fs.existsSync(STATE_B);

async function clearPreRoundGates(page) {
  // Match profile (skip uses neutral defaults) and the one-time age band.
  const skip = page.getByRole('button', { name: /meet someone asap|skip/i }).first();
  if (await skip.isVisible({ timeout: 6000 }).catch(() => false)) await skip.click();
  const adult = page.getByRole('button', { name: /18/ }).first();
  if (await adult.isVisible({ timeout: 4000 }).catch(() => false)) await adult.click();
}

test.describe('two-person spar match', () => {
  test.skip(!haveStates, 'needs two saved Google sessions: cd e2e && npm run save-auth -- a, then b');

  test('two signed-in people queue on /spar and land in one room', async ({ browser, request }) => {
    test.setTimeout(240_000);
    const q = await (await request.get('/api/spar-queue')).json();
    test.skip(q.waiting > 0, 'a real person is waiting live; refusing to pair a test account with them');

    const ctxA = await browser.newContext({ storageState: STATE_A });
    const ctxB = await browser.newContext({ storageState: STATE_B });
    const a = await ctxA.newPage();
    const b = await ctxB.newPage();
    try {
      await a.goto('/spar');
      await b.goto('/spar');
      await clearPreRoundGates(a);
      await clearPreRoundGates(b);

      // Presence card from the 2026-08-11 ready check. Both sides press it.
      for (const p of [a, b]) {
        const here = p.getByRole('button', { name: /i'?m here|start the round|accept/i }).first();
        await here.click({ timeout: 90_000 });
      }

      await Promise.all([
        a.waitForURL(/\/live-round/, { timeout: 90_000 }),
        b.waitForURL(/\/live-round/, { timeout: 90_000 }),
      ]);
      const roomA = new URL(a.url()).searchParams.get('room');
      const roomB = new URL(b.url()).searchParams.get('room');
      expect(roomA, 'both people must land in the same room').toBe(roomB);

      // The motion draft runs in the room (2026-08-26). Five cards must be
      // VISIBLE, not just in the DOM: anim-governor ships animations paused
      // here and an entrance keyframe once froze them at opacity 0.
      await expect(a.getByText(/strike/i).first()).toBeVisible({ timeout: 60_000 });
    } finally {
      // Leave cleanly so neither account is left heartbeating an empty seat.
      for (const p of [a, b]) {
        const leave = p.getByRole('button', { name: /leave/i }).first();
        if (await leave.isVisible({ timeout: 2000 }).catch(() => false)) await leave.click().catch(() => {});
      }
      await ctxA.close();
      await ctxB.close();
    }
  });
});
