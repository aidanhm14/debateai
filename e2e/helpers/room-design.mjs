import { offlineSite } from './offline-site.mjs';

// The existing ?design= scenes seed the room themselves. Keep the auth
// observer pending so the deliberately omitted Firebase SDK does not put
// its unavailable-service gate over the scene. All traffic stays intercepted;
// real sign-in behavior is covered by the separate auth browser fixtures.
export async function roomDesign(page, options) {
  await page.addInitScript(() => {
    const auth = { currentUser: null, onAuthStateChanged: () => () => {} };
    window.firebase = { apps: [{}], auth: () => auth, firestore: () => null };
  });
  return offlineSite(page, options);
}
