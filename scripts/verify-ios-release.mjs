#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const ipaPath = path.resolve(process.argv[2] || '');
const expectedBuild = String(process.argv[3] || '');
if (!process.argv[2] || !expectedBuild) {
  console.error('Usage: node scripts/verify-ios-release.mjs <ipa> <expected-build>');
  process.exit(2);
}
if (!fs.existsSync(ipaPath)) {
  console.error(`IPA not found: ${ipaPath}`);
  process.exit(2);
}

let passed = 0;
let failed = 0;
function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`PASS ${name}`);
    return;
  }
  failed += 1;
  console.error(`FAIL ${name}${detail ? `: ${detail}` : ''}`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: options.binary ? null : 'utf8',
    input: options.input,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    const error = Buffer.isBuffer(result.stderr) ? result.stderr.toString() : result.stderr;
    throw new Error(`${command} failed: ${(error || '').trim()}`);
  }
  return result.stdout;
}

function zipEntry(entry, binary = false) {
  return run('unzip', ['-p', ipaPath, entry], { binary });
}

function plistBufferToObject(buffer) {
  const json = run('plutil', ['-convert', 'json', '-o', '-', '--', '-'], {
    input: buffer,
    binary: true,
  });
  return JSON.parse(json.toString());
}

function plistFileToObject(file) {
  const json = run('plutil', ['-convert', 'json', '-o', '-', '--', file]);
  return JSON.parse(json);
}

try {
  run('unzip', ['-t', ipaPath]);
  check('ZIP integrity', true);
} catch (error) {
  check('ZIP integrity', false, error.message);
}

let info = {};
let capacitor = {};
try {
  info = plistBufferToObject(zipEntry('Payload/App.app/Info.plist', true));
  check('Info.plist readable', true);
} catch (error) {
  check('Info.plist readable', false, error.message);
}
try {
  capacitor = JSON.parse(zipEntry('Payload/App.app/capacitor.config.json'));
  check('Capacitor config readable', true);
} catch (error) {
  check('Capacitor config readable', false, error.message);
}

check('display name is Debatable', info.CFBundleDisplayName === 'Debatable', info.CFBundleDisplayName);
check('bundle identifier is stable', info.CFBundleIdentifier === 'com.debateai.debateit', info.CFBundleIdentifier);
check('build number matches', String(info.CFBundleVersion) === expectedBuild, info.CFBundleVersion);
check('release version is 1.0', info.CFBundleShortVersionString === '1.0', info.CFBundleShortVersionString);
// Apple warns on upload (90068) below 15.0 and refuses it outright from
// Spring 2027, so 15.0 is the floor. Raised from 13.0 on 2026-08-19 after
// build 9 drew the warning in Transporter. iOS 15 reaches the iPhone 6s, so
// nothing anyone still debates on is excluded.
check('minimum iOS is 15.0', info.MinimumOSVersion === '15.0', info.MinimumOSVersion);
check('iPhone orientation is portrait only',
  Array.isArray(info.UISupportedInterfaceOrientations)
  && info.UISupportedInterfaceOrientations.length === 1
  && info.UISupportedInterfaceOrientations[0] === 'UIInterfaceOrientationPortrait');

for (const key of ['NSCameraUsageDescription', 'NSMicrophoneUsageDescription', 'NSPhotoLibraryAddUsageDescription']) {
  const value = String(info[key] || '');
  check(`${key} uses current brand`, value.includes('Debatable') && !value.includes('DebateIt'), value);
}

check('Capacitor app name is Debatable', capacitor.appName === 'Debatable', capacitor.appName);
check('native server uses live domain', capacitor.server?.url === 'https://itsdebatable.com/native', capacitor.server?.url);
check('user-agent uses current brand',
  String(capacitor.ios?.appendUserAgent || '').includes('DebatableApp/1.0')
  && !String(capacitor.ios?.appendUserAgent || '').includes('DebateIt'));
const navigation = Array.isArray(capacitor.server?.allowNavigation) ? capacitor.server.allowNavigation : [];
check('navigation includes live domain', navigation.includes('itsdebatable.com') && navigation.includes('*.itsdebatable.com'));
check('navigation excludes legacy domains', !navigation.some((host) => /debateai\.com|debateos\.com/i.test(host)), navigation.join(', '));

const summaryPath = path.join(path.dirname(ipaPath), 'DistributionSummary.plist');
if (fs.existsSync(summaryPath)) {
  try {
    const summary = plistFileToObject(summaryPath);
    const app = summary[path.basename(ipaPath)]?.[0]
      || summary['App.ipa']?.[0]
      || Object.values(summary)[0]?.[0]
      || {};
    const entitlements = app.entitlements || {};
    check('distribution build number matches', String(app.buildNumber) === expectedBuild, app.buildNumber);
    check('App Store distribution certificate', app.certificate?.type === 'Cloud Managed Apple Distribution', app.certificate?.type);
    check('production push entitlement', entitlements['aps-environment'] === 'production', entitlements['aps-environment']);
    check('TestFlight reporting entitlement', entitlements['beta-reports-active'] === true);
    check('Sign in with Apple entitlement', entitlements['com.apple.developer.applesignin']?.includes('Default'));
    check('debug entitlement disabled', entitlements['get-task-allow'] === false);
    check('release symbols included', app.symbols === true);
  } catch (error) {
    check('distribution summary readable', false, error.message);
  }
} else {
  check('distribution summary present', false, summaryPath);
}

const digest = crypto.createHash('sha256').update(fs.readFileSync(ipaPath)).digest('hex');
console.log(`SHA256 ${digest}`);
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
