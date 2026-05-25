# Debatable — Google Play TWA

This directory holds the [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) config that wraps the existing PWA at `https://debateai.com` into an Android Trusted Web Activity (TWA). The TWA is a thin native wrapper — Chrome renders the same HTML/JS as the website, so every web change ships to the Android app the moment it deploys to Netlify. No app rebuild on every edit.

## What's checked in

- `twa-manifest.json` — Bubblewrap source of truth. Edit this, then re-run `update`.
- `../app/.well-known/assetlinks.json` — Digital-asset-link served from the website. Proves to Android that this site owns the app, which is what lets Chrome hide the URL bar inside the TWA.

## One-time setup

Prereqs:
- Node 18+
- JDK 17 (Bubblewrap will install if missing)
- Android SDK build-tools (Bubblewrap will install if missing)
- Google Play Console account ($25 one-time)

```sh
# From the repo root
cd twa
npx -y @bubblewrap/cli@latest init --manifest=https://debateai.com/manifest.json
# ↑ this regenerates twa-manifest.json from the live web manifest;
#   pass --skipExisting if you want to keep the checked-in version.
npx @bubblewrap/cli build
```

`build` produces `app-release-signed.aab` (the upload bundle for Play Console) and `app-release-signed.apk` (sideloadable for testing).

It also generates an `android.keystore` file. **Keep this file safe and out of git** — losing it means you can't update your app on Play Store ever again. Back it up in 1Password or similar.

## Wire up assetlinks

After the first `build`, Bubblewrap prints the SHA256 fingerprint of the upload key. You need to copy it into `../app/.well-known/assetlinks.json`:

```sh
keytool -list -v -keystore android.keystore -alias android | grep "SHA256"
```

Paste the colon-separated SHA256 (e.g. `14:6D:E9:83:...`) into both:
1. `app/.well-known/assetlinks.json` → `sha256_cert_fingerprints[0]`
2. `twa-manifest.json` → `fingerprints[0].value`

When you upload the app to Play Console and **enable "Play App Signing"** (which Google strongly recommends), Google generates a *second* signing key. Add that fingerprint to `assetlinks.json` as well — it's available in Play Console → App integrity → App signing. The `assetlinks.json` array supports multiple fingerprints; both must be present or the URL bar will appear inside the app.

Verify the live file is reachable:

```sh
curl https://debateai.com/.well-known/assetlinks.json
```

Then validate end-to-end with Google's tool:

https://developers.google.com/digital-asset-links/tools/generator

## Subsequent builds

After editing `twa-manifest.json` (e.g., bumping `appVersionCode` for an update):

```sh
cd twa
npx @bubblewrap/cli update
npx @bubblewrap/cli build
```

Upload the new `app-release-signed.aab` to Play Console.

## Subscription billing

The current Stripe-based subscription flow works fine inside a TWA — Google Play does **not** require Play Billing for digital subs in a TWA the way Apple requires StoreKit on iOS. (Caveat: if you ever add native in-app sales via Play Billing, both must be offered side-by-side per Play policy.)

If we want to migrate to Play Billing later, set `features.playBilling.enabled = true` in `twa-manifest.json` and rebuild.

## Common pitfalls

- **URL bar shows up inside the TWA** → `assetlinks.json` fingerprint mismatch. Check both upload key + Play App Signing key are listed.
- **App can't be updated on Play Console** → upload `.aab` not `.apk`, and the `appVersionCode` must increment each upload.
- **App rejected for "minimum functionality"** → unlikely for a TWA since the website itself has rich functionality, but make sure the Play Store listing screenshots show real round flow, not just a splash screen.
- **Mic permission prompt appears every session** → expected for the first request per origin per Android-Chrome version; Chrome remembers the grant inside the TWA the same way it remembers it on the web.

## What this does NOT cover

- iOS App Store. Apple requires StoreKit for digital subs (15-30% cut) and rejects thin webviews under Guideline 4.2. iOS needs a separate Capacitor wrapper + IAP migration. Defer until Android validates the subscription motion.
