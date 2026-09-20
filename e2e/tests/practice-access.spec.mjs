import { test, expect } from '@playwright/test';
import { readApp, between, appRoot } from '../helpers/offline-site.mjs';

const source = readApp('practice.html');
const admission = between(source, 'var ANON_LIMIT =', '// Default trait presets');
const planCard = between(source, '  var typedRoundLocked =', '  var simpleSetupTree =');

for (const [plan, status, allowed] of [
  ['trial', 'active', false],
  ['individual', 'active', true],
  ['voice', 'past_due', true],
  ['individual', 'incomplete', false],
  ['team', 'paused', false],
  ['lifetime', 'canceled', true],
]) {
  test(`typed-round access for ${plan}/${status} matches its visible plan gate`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<main id="root"></main>' }));
    await page.goto('https://debatable.test/practice');
    await page.addScriptTag({ path: appRoot + 'node_modules/react/umd/react.development.js' });
    await page.addScriptTag({ path: appRoot + 'node_modules/react-dom/umd/react-dom.development.js' });
    await page.addScriptTag({ content: `
      var el=React.createElement, user={uid:'fixture',email:'fixture@example.test'}, team=${JSON.stringify({ plan, status })};
      function getStoredKey(){return '';}
      ${admission}
      __proStatus=planPaidFor(team);__signedInStatus=true;
      ${planCard}
      ReactDOM.createRoot(document.getElementById('root')).render(el('section',null,planLockCard));
    ` });
    await expect(page.locator('[data-practice-paywall]')).toHaveCount(allowed ? 0 : 1);
    expect(await page.evaluate(() => beginRoundCredit())).toBe(allowed);
    if (!allowed) await expect(page.locator('[data-cta="practice-paywall-plan"]')).toHaveAttribute('href', '/pricing?source=practice-paywall#plans');
    expect(errors).toEqual([]);
  });
}
