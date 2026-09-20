import { test, expect } from '@playwright/test';
import { readApp } from '../helpers/offline-site.mjs';

async function chooser(page, { anonymous = false, collision = false, destination = false } = {}) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.fulfill({
    contentType: route.request().isNavigationRequest() ? 'text/html' : 'application/javascript',
    body: route.request().isNavigationRequest() ? '<button id="open">Sign in</button><p id="result"></p>' : '',
  }));
  await page.goto('https://debatable.test/account');
  await page.evaluate(({ anonymous, collision, destination }) => {
    window.calls = []; window.completions = [];
    const user = { uid: 'existing-account', isAnonymous: false, getIdToken: async () => 'fixture-token' };
    const finish = method => { calls.push(method); auth.currentUser = user; return Promise.resolve({ user }); };
    const auth = {
      currentUser: anonymous ? {
        uid: 'guest', isAnonymous: true,
        linkWithPopup() { calls.push('link'); return collision
          ? Promise.reject({ code: 'auth/credential-already-in-use', credential: { fixture: true } }) : finish('linked'); },
      } : null,
      setPersistence(value) { calls.push(value); return new Promise(resolve => { window.persist = resolve; }); },
      signInWithEmailAndPassword(email, password) {
        if (password === 'wrong-password') return Promise.reject({ code: 'auth/wrong-password' });
        return finish('email');
      },
      signInWithPopup() { return finish('popup'); },
      signInWithCredential() { return finish('credential'); },
    };
    const authFactory = Object.assign(() => auth, {
      Auth: { Persistence: { LOCAL: 'local', SESSION: 'session' } },
      GoogleAuthProvider: function () { this.setCustomParameters = () => {}; },
    });
    window.firebase = { apps: [{}], auth: authFactory };
    window.openChooser = () => openAuthModal('signin', destination ? { destination: '/community' } : {
      onDone(user, method) {
        completions.push({ uid: user && user.uid, method, open: document.getElementById('ditAuth').classList.contains('on') });
        document.getElementById('result').textContent = user ? 'Signed in' : 'Cancelled';
      },
    });
    document.getElementById('open').onclick = window.openChooser;
  }, { anonymous, collision, destination });
  await page.addScriptTag({ content: readApp('js/auth-modal.js') });
  await page.locator('#open').click();
  await expect(page.locator('#ditAuth')).toBeVisible();
  return errors;
}

test('returning email sign-in awaits session persistence and closes before handoff', async ({ page }) => {
  const errors = await chooser(page);
  await page.locator('#daEmail').fill('returning@example.test');
  await page.locator('#daPassword').fill('fixture-password');
  await page.locator('#daEmailBtn').click();
  await expect(page.locator('.da-err')).toContainText('Tick the box');
  expect(await page.evaluate(() => calls)).toEqual([]);
  await page.locator('#daTerms').check();
  await page.locator('#daRemember').uncheck();
  await page.locator('#daEmailBtn').click();
  await expect(page.locator('#daEmailBtn')).toBeDisabled();
  expect(await page.evaluate(() => calls)).toEqual(['session']);
  await page.evaluate(() => persist());
  await expect(page.locator('#ditAuth')).toBeHidden();
  await expect(page.locator('#result')).toHaveText('Signed in');
  expect(await page.evaluate(() => completions)).toEqual([{ uid: 'existing-account', method: 'email_password_signin', open: false }]);
  expect(errors).toEqual([]);
});

test('a wrong password keeps the form usable and a corrected retry succeeds', async ({ page }) => {
  const errors = await chooser(page);
  await page.locator('#daTerms').check();
  await expect(page.locator('#daRemember')).toBeChecked();
  await page.locator('#daEmail').fill('returning@example.test');
  await page.locator('#daPassword').fill('wrong-password');
  await page.locator('#daEmailBtn').click();
  await page.evaluate(() => persist());
  await expect(page.locator('.da-err')).not.toBeEmpty();
  await expect(page.locator('#daEmailBtn')).toBeEnabled();
  expect(await page.evaluate(() => completions)).toEqual([]);
  await page.locator('#daPassword').fill('correct-password');
  await page.locator('#daEmailBtn').click();
  await page.evaluate(() => persist());
  await expect(page.locator('#result')).toHaveText('Signed in');
  expect(await page.evaluate(() => calls)).toEqual(['local', 'local', 'email']);
  expect(errors).toEqual([]);
});

test('Google recovers an existing account from a guest without a second popup', async ({ page }) => {
  const errors = await chooser(page, { anonymous: true, collision: true });
  await page.locator('#daTerms').check();
  await page.locator('#daG').click();
  await expect(page.locator('#result')).toHaveText('Signed in');
  expect(await page.evaluate(() => calls)).toEqual(['link', 'credential']);
  await expect(page.locator('#ditAuth')).toBeHidden();
  expect(errors).toEqual([]);
});

test('a gated sign-in resumes its destination after modal cleanup', async ({ page }) => {
  const errors = await chooser(page, { destination: true });
  await page.locator('#daTerms').check();
  await page.locator('#daG').click();
  await expect(page).toHaveURL('https://debatable.test/community');
  expect(errors).toEqual([]);
});
