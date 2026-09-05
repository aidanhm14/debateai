// Runs the shipped email form and handlers against a tiny DOM and Firebase
// double. No account is created and no network or email request leaves this test.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../app/js/auth-modal.js', import.meta.url), 'utf8');
const EMAIL = 'returning@example.test';
const PASSWORD = 'Remember-this-only-in-Firebase!';
const REMEMBER_KEY = 'debateos-auth-remember';

function classes() {
  const values = new Set();
  return {
    add: (...names) => names.forEach(name => values.add(name)),
    remove: (...names) => names.forEach(name => values.delete(name)),
    contains: name => values.has(name),
    toggle(name, force) {
      const next = force === undefined ? !values.has(name) : force;
      if (next) values.add(name); else values.delete(name);
      return next;
    },
  };
}

// Only models the form APIs the production script uses. Parsing the actual
// rendered markup means removing a field or its event wiring fails the tests.
class Element {
  constructor(tag = 'div', attributes = {}) {
    this.tagName = tag.toUpperCase();
    this.attributes = attributes;
    this.listeners = new Map();
    this.children = [];
    this.classList = classes();
    for (const name of (attributes.class || '').split(/\s+/).filter(Boolean)) this.classList.add(name);
    this.dataset = {};
    for (const [name, value] of Object.entries(attributes)) {
      if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
    }
    this.value = attributes.value || '';
    this.checked = Object.hasOwn(attributes, 'checked');
    this.disabled = Object.hasOwn(attributes, 'disabled');
    this.style = {};
    this.textContent = '';
  }
  set innerHTML(html) {
    this.html = html;
    this.children = [];
    for (const match of html.matchAll(/<([a-z][a-z\d-]*)\b([^<>]*?)\/?\s*>/gi)) {
      const attributes = {};
      for (const attr of match[2].matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
        attributes[attr[1]] = attr[2] ?? attr[3] ?? attr[4] ?? '';
      }
      this.children.push(new Element(match[1], attributes));
    }
  }
  get innerHTML() { return this.html || ''; }
  getAttribute(name) { return this.attributes[name] ?? null; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  querySelector(selector) {
    return this.children.find(child => selector.startsWith('#')
      ? child.attributes.id === selector.slice(1)
      : selector.startsWith('.') ? child.classList.contains(selector.slice(1)) : child.tagName === selector.toUpperCase()) || null;
  }
  addEventListener(name, handler) {
    const handlers = this.listeners.get(name) || [];
    handlers.push(handler);
    this.listeners.set(name, handlers);
  }
  dispatch(name) {
    const handlers = this.listeners.get(name) || [];
    assert.ok(handlers.length, `${this.attributes.id || this.tagName} must handle ${name}`);
    for (const handler of handlers) handler({ preventDefault() {}, target: this });
  }
  appendChild(child) { this.children.push(child); return child; }
  focus() {}
  scrollIntoView() {}
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function settle() {
  // Drain promise continuations, including persistence, account linking,
  // profile update, verification and the completion callback.
  await new Promise(setImmediate);
  await new Promise(setImmediate);
}

function harness(options = {}) {
  const card = new Element();
  const storage = new Map(Object.entries(options.storage || {}));
  const session = new Map();
  const writes = [];
  const calls = [];
  const events = [];
  const location = { origin: 'https://itsdebatable.com', pathname: '/practice', search: '', hash: '', href: 'https://itsdebatable.com/practice' };
  const persisted = options.persistence || { promise: Promise.resolve() };
  const user = {
    uid: options.anonymous ? 'guest-to-preserve' : 'named-account',
    isAnonymous: false,
    email: EMAIL,
    emailVerified: false,
    updateProfile(profile) { calls.push(['updateProfile', profile]); return Promise.resolve(); },
    sendEmailVerification() { calls.push(['verification']); return Promise.resolve(); },
  };
  const firebaseAuth = {
    currentUser: null,
    useDeviceLanguage() {},
    setPersistence(value) { calls.push(['persistence', value]); return persisted.promise; },
    createUserWithEmailAndPassword(email, password) {
      calls.push(['create', email, password]);
      if (options.createError) return Promise.reject({ code: options.createError });
      this.currentUser = user;
      return Promise.resolve({ user });
    },
    signInWithEmailAndPassword(email, password) {
      calls.push(['signin', email, password]);
      if (options.signinError) return Promise.reject({ code: options.signinError });
      this.currentUser = user;
      return Promise.resolve({ user });
    },
    sendPasswordResetEmail(email) { calls.push(['reset', email]); return Promise.resolve(); },
  };
  if (options.anonymous) {
    firebaseAuth.currentUser = {
      uid: user.uid,
      isAnonymous: true,
      linkWithCredential(credential) {
        calls.push(['link', credential]);
        if (options.linkError) return Promise.reject({ code: options.linkError });
        firebaseAuth.currentUser = user;
        return Promise.resolve({ user });
      },
    };
  }
  const auth = () => firebaseAuth;
  auth.Auth = { Persistence: { LOCAL: 'local', SESSION: 'session' } };
  auth.EmailAuthProvider = { credential: (email, password) => ({ email, password }) };
  const document = {
    getElementById: id => id === 'ditAuthCard' ? card : null,
    querySelector: () => null,
    createElement: tag => new Element(tag),
    head: new Element('head'),
    body: new Element('body'),
    documentElement: new Element('html'),
    addEventListener() {},
  };
  const sandbox = {
    document,
    location,
    navigator: { userAgent: options.inApp ? 'Instagram' : 'Mozilla/5.0 Chrome/120 Safari/537.36' },
    firebase: { auth, apps: [{}] },
    localStorage: {
      getItem: key => storage.has(key) ? storage.get(key) : null,
      setItem(key, value) { writes.push([key, String(value)]); storage.set(key, String(value)); },
      removeItem: key => storage.delete(key),
    },
    sessionStorage: {
      getItem: key => session.has(key) ? session.get(key) : null,
      setItem(key, value) { writes.push([key, String(value)]); session.set(key, String(value)); },
      removeItem: key => session.delete(key),
    },
    gtag: (...args) => events.push(args),
    setTimeout,
    clearTimeout,
    URL,
    CustomEvent: class { constructor(type) { this.type = type; } },
    dispatchEvent() {},
    fetch() { throw new Error('Auth tests must never make a network request'); },
  };
  sandbox.window = sandbox;
  // Expose only a render entrypoint and its provider flags. Submission and
  // mode switching use the real DOM handlers, not test copies of the logic.
  const marker = '  window.openAuthModal = openAuthModal;';
  assert.ok(source.includes(marker), 'shared modal public entrypoint exists');
  const instrumented = source.replace(marker, `${marker}\n  window.__renderEmailAuth = function(mode, opts) {\n    googleOnly = !!(opts && opts.googleOnly);\n    liveVideo = !!(opts && opts.liveVideo) && !googleOnly;\n    renderChooser(mode, opts && opts.emailMode);\n  };`);
  vm.runInNewContext(instrumented, sandbox, { filename: 'auth-modal.js' });
  const query = selector => card.querySelector(selector);
  function render(mode, opts) { sandbox.__renderEmailAuth(mode, opts); return card; }
  function fill({ remember = true, email = EMAIL, password = PASSWORD, name = 'A Returning Person' } = {}) {
    assert.ok(query('#daEmail'), 'email field is reachable');
    assert.ok(query('#daPassword'), 'password field is reachable');
    query('#daEmail').value = email;
    query('#daPassword').value = password;
    if (query('#daName')) query('#daName').value = name;
    assert.ok(query('#daRemember'), 'remember-me checkbox is reachable');
    query('#daRemember').checked = remember;
    query('#daRemember').dispatch('change');
    query('#daTerms').checked = true;
    query('#daTerms').dispatch('change');
  }
  function submit() { query('#daEmailForm').dispatch('submit'); }
  function noPasswordSaved() {
    assert.ok(!JSON.stringify([...storage, ...session, ...writes]).includes(PASSWORD), 'raw password must never be saved to browser storage');
  }
  return { render, fill, submit, query, card, storage, calls, events, firebaseAuth, location, noPasswordSaved };
}

const tests = [];
function test(name, run) { tests.push({ name, run }); }
const methods = h => h.calls.map(call => call[0]);
const completed = h => h.events.filter(event => event[1] === 'sign_in_complete');

test('new and returning visitors can reach password creation and sign-in', () => {
  const fresh = harness();
  fresh.render();
  assert.equal(fresh.query('#daEmailForm').getAttribute('data-mode'), 'signup');
  assert.equal(fresh.query('#daEmail').getAttribute('autocomplete'), 'username');
  assert.equal(fresh.query('#daPassword').getAttribute('autocomplete'), 'new-password');
  assert.equal(fresh.query('#daRemember').checked, true);
  assert.ok(fresh.query('#daG') && fresh.query('#daApple'), 'existing provider choices remain available');
  const returning = harness({ storage: { 'debateos-last-signin-method': 'email' } });
  returning.render();
  assert.equal(returning.query('#daEmailForm').getAttribute('data-mode'), 'signin');
  assert.equal(returning.query('#daPassword').getAttribute('autocomplete'), 'current-password');
  assert.equal(returning.query('#daName'), null);
  assert.ok(returning.query('#daForgot'), 'returning accounts have password recovery');
});

test('email-link users can switch to a password and email restrictions hold for live/admin gates', () => {
  const h = harness({ storage: { 'debateos-last-signin-method': 'emaillink' } });
  h.render();
  assert.equal(h.query('#daEmailForm').getAttribute('data-email-mode'), 'link');
  assert.equal(h.query('#daPassword'), null);
  h.query('#daEmailModeSwitch').dispatch('click');
  assert.ok(h.query('#daPassword'));
  for (const opts of [{ googleOnly: true }, { liveVideo: true }]) {
    h.render('signin', opts);
    assert.equal(h.query('#daEmailForm'), null, 'restricted prompt cannot offer a rejected email provider');
    assert.ok(h.query('#daG'));
  }
});

test('form switches preserve typed address and remember-me opt-out across revisits', () => {
  const h = harness();
  h.render('signup');
  h.fill({ remember: false });
  h.query('#daModeSwitch').dispatch('click');
  assert.equal(h.query('#daEmail').value, EMAIL);
  assert.equal(h.query('#daRemember').checked, false);
  assert.equal(h.query('#daPassword').getAttribute('autocomplete'), 'current-password');
  h.query('#daEmailModeSwitch').dispatch('click');
  h.query('#daEmailModeSwitch').dispatch('click');
  assert.equal(h.query('#daEmail').value, EMAIL);
  assert.equal(h.query('#daRemember').checked, false);
  const revisit = harness({ storage: Object.fromEntries(h.storage) });
  revisit.render('signin');
  assert.equal(revisit.query('#daRemember').checked, false);
  assert.equal(h.storage.get(REMEMBER_KEY), '0');
  h.noPasswordSaved();
});

test('new password account waits for persistent storage before creation and saves its profile', async () => {
  const persistence = deferred();
  const h = harness({ persistence });
  h.render('signup');
  h.fill();
  h.submit();
  await settle();
  assert.deepEqual(methods(h), ['persistence']);
  assert.equal(h.calls[0][1], 'local');
  assert.equal(h.query('#daEmailBtn').disabled, true);
  persistence.resolve();
  await settle();
  assert.deepEqual(methods(h), ['persistence', 'create', 'updateProfile', 'verification']);
  assert.equal(h.calls[1][1], EMAIL);
  assert.equal(h.calls[1][2], PASSWORD);
  assert.equal(h.calls[2][1].displayName, 'A Returning Person');
  assert.equal(completed(h).length, 1);
  assert.equal(completed(h)[0][2].method, 'email_password_signup');
  assert.equal(h.storage.get('debateos-last-signin-method'), 'email');
  h.noPasswordSaved();
});

test('signing up from a guest links the existing UID after persistence succeeds', async () => {
  const h = harness({ anonymous: true });
  h.render('signup');
  h.fill();
  h.submit();
  await settle();
  assert.deepEqual(methods(h), ['persistence', 'link', 'updateProfile', 'verification']);
  assert.equal(h.firebaseAuth.currentUser.uid, 'guest-to-preserve');
  assert.equal(h.firebaseAuth.currentUser.isAnonymous, false);
  assert.equal(h.calls[1][1].email, EMAIL);
  assert.equal(h.calls[1][1].password, PASSWORD);
  assert.equal(completed(h).length, 1);
  h.noPasswordSaved();
});

test('an existing email account is recovered after guest-link or account-create collision', async () => {
  for (const options of [
    { anonymous: true, linkError: 'auth/credential-already-in-use' },
    { createError: 'auth/email-already-in-use' },
  ]) {
    const h = harness(options);
    h.render('signup');
    h.fill();
    h.submit();
    await settle();
    assert.deepEqual(methods(h), ['persistence', options.anonymous ? 'link' : 'create', 'signin']);
    assert.equal(h.calls[2][1], EMAIL);
    assert.equal(h.calls[2][2], PASSWORD);
    assert.equal(completed(h).length, 1);
    assert.equal(completed(h)[0][2].method, 'email_password_signin');
    h.noPasswordSaved();
  }
});

test('returning sign-in honors local versus session persistence before checking the password', async () => {
  for (const remember of [true, false]) {
    const persistence = deferred();
    const h = harness({ persistence });
    h.render('signin');
    h.fill({ remember });
    h.submit();
    await settle();
    assert.deepEqual(methods(h), ['persistence']);
    assert.equal(h.calls[0][1], remember ? 'local' : 'session');
    persistence.resolve();
    await settle();
    assert.deepEqual(methods(h), ['persistence', 'signin']);
    assert.equal(completed(h).length, 1);
    assert.equal(completed(h)[0][2].method, 'email_password_signin');
    h.noPasswordSaved();
  }
});

test('persistence failure cannot silently create an account or claim a remembered sign-in', async () => {
  const persistence = deferred();
  const h = harness({ persistence });
  h.render('signup');
  h.fill();
  h.submit();
  persistence.reject({ code: 'auth/web-storage-unsupported' });
  await settle();
  assert.deepEqual(methods(h), ['persistence']);
  assert.equal(completed(h).length, 0);
  assert.equal(h.query('#daEmailBtn').disabled, false);
  assert.ok(h.query('.da-err').textContent, 'storage failure remains visible and retryable');
  h.noPasswordSaved();
});

test('a wrong password is retryable and reset requests use the entered email', async () => {
  const h = harness({ signinError: 'auth/invalid-credential' });
  h.render('signin');
  h.fill();
  h.submit();
  await settle();
  assert.deepEqual(methods(h), ['persistence', 'signin']);
  assert.equal(completed(h).length, 0);
  assert.equal(h.query('#daEmailBtn').disabled, false);
  assert.match(h.query('.da-err').textContent, /email.*password|password.*email/i);
  h.query('#daForgot').dispatch('click');
  await settle();
  assert.deepEqual(h.calls.at(-1), ['reset', EMAIL]);
  assert.equal(h.query('#daForgot').disabled, false);
  assert.ok(h.query('.da-status').textContent);
  h.noPasswordSaved();
});

test('missing agreement and invalid signup input never call Firebase', async () => {
  for (const invalid of [
    { email: 'not-an-email' },
    { password: 'short' },
    { name: '' },
    { terms: false },
  ]) {
    const h = harness();
    h.render('signup');
    h.fill(invalid);
    if (invalid.terms === false) {
      h.query('#daTerms').checked = false;
      h.query('#daTerms').dispatch('change');
    }
    h.submit();
    await settle();
    assert.deepEqual(h.calls, []);
    assert.ok(h.query('.da-err').textContent);
  }
});

let failures = 0;
for (const { name, run } of tests) {
  try {
    await run();
    console.log('PASS', name);
  } catch (error) {
    failures += 1;
    console.error('FAIL', name);
    console.error(error.stack || error);
  }
}
if (failures) process.exit(1);
console.log(`Email auth: ${tests.length} runtime checks passed.`);
