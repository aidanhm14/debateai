import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
for (const surface of ['coach', 'room-judge']) {
  const html = readFileSync(new URL('../../app/' + surface + '.html', import.meta.url), 'utf8');
  const start = html.indexOf('  function reportVoiceEnd()');
  const end = html.indexOf('\n', html.indexOf('state.timerId = 0; }', start));
  const code = html.slice(start, end);
  test(surface + ' ends at its reserved minute and settles only its own session once', async ({ page }) => {
    const calls = [];
    await page.route('**/api/voice-session-end', route => {
      calls.push({ body: route.request().postDataJSON(), headers: route.request().headers() });
      return route.fulfill({ json: { ok: true } });
    });
    await page.route('https://settlement.test/', route => route.fulfill({ contentType: 'text/html', body: '<span id="timer"></span>' }));
    await page.goto('https://settlement.test/');
    await page.evaluate(() => {
      window.testNow = 1000000; Date.now = () => testNow;
      window.state = { voiceSession: { id: 'sess-own', token: 'own-token', endsAt: testNow + 60000 } };
      window.els = { timer: document.getElementById('timer') };
      window.loadDrill = () => 'open'; window.ends = 0;
      window.setInterval = fn => { window.tick = fn; return 1; };
      window.clearInterval = () => { window.tick = null; };
      window.endSession = () => { ends++; stopTimer(); reportVoiceEnd(); };
      window.endAndBallot = async () => endSession(); window.showError = message => { throw Error(message); };
    });
    await page.addScriptTag({ content: code });
    await page.evaluate(() => startTimer());
    await expect(page.locator('#timer')).toHaveText('00:00');
    await page.evaluate(() => { testNow += 59000; tick(); });
    expect(await page.evaluate(() => ends)).toBe(0); expect(calls).toHaveLength(0);
    await page.evaluate(() => { testNow += 1000; tick(); });
    await expect.poll(() => calls.length).toBe(1);
    expect(calls[0].body).toEqual({ sessionId: 'sess-own' }); expect(calls[0].headers.authorization).toBe('Bearer own-token');
    expect(await page.evaluate(() => ({ ends, session: state.voiceSession, timer: state.timerId }))).toEqual({ ends: 1, session: null, timer: 0 });
    await page.evaluate(() => reportVoiceEnd()); expect(calls).toHaveLength(1);
    expect(html).toContain('reportVoiceEnd();'); expect(html).toContain("window.addEventListener('pagehide', teardown)");
  });
}
