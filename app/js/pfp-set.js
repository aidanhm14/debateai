/* Debatable profile-picture set ─────────────────────────────────────────
 *
 * The pictures a debater wears when they have not set one themselves, and
 * (since 2026-08-24) the ones they can deliberately CHOOSE. Aidan's brief,
 * across four passes: a board of profile pictures is not a board of faces.
 * It is a ghost, a dog, a bowl of ramen, somebody's cat, the grey default
 * nobody replaced. Then: "those should be options yea" and "i want more
 * variety too".
 *
 * TWO TIERS, AND THEY ARE NOT INTERCHANGEABLE.
 *
 * PHOTOS (2026-08-25) are the pictures Aidan supplied and asked for twice,
 * the second time as a standing instruction: "bring back the real photos -
 * never reverse this". They are phone screenshots of profile pictures from
 * another app. They are what the first-screen rail draws, because the rail
 * has to read as a board of people at a glance and a drawn set reads as
 * clip art at that size. His call, his site, his risk, recorded here so it
 * is not relitigated by the next agent who reads the old rule and reverts
 * it. ONE image from the batch is deliberately absent and stays absent: it
 * is a photograph of a child, which is not the site owner's consent to
 * give. If the batch is ever re-cropped, do not put it back.
 *
 * They are the STAND-IN tier only. They are not offered in the picker, so
 * nobody's account can come to be identified by a stranger's photograph,
 * and any truer tier (a built avatar, an account's own photo) still
 * outranks them everywhere.
 *
 * DRAWN tiles are the pickable set: original, ours outright, and nothing
 * in them depicts a real person or an existing character. That is why the
 * picker draws from SET and never from PHOTOS.
 *
 * RULES THAT KEEP THEM READABLE AT 54px, which is the only size that
 * matters here: flat fills, no hairlines under 2px, no gradients, one
 * strong background hue each, and the subject filling most of the frame.
 * 64x64 viewBox, inline, so the whole set costs zero requests.
 *
 * ADDING ONE: append to SET with a stable id (the id is what gets stored
 * on an account, so renaming one silently changes somebody's picture).
 * Keep `group` accurate; the picker renders by group. A PHOTOS id is never
 * stored on an account, so those may be re-cut freely.
 */
(function (global) {
  'use strict';

  var SET = [
    /* ── characters ─────────────────────────────────────────────── */
    { id:'ghost', name:'Ghost', group:'Characters', art:
      '<rect width="64" height="64" fill="#6f5bd6"/>'
      + '<path d="M15 31a17 17 0 0 1 34 0v22l-6-5.2-5.6 5.2-5.4-5-5.4 5L21 47.8 15 53z" fill="#fff"/>'
      + '<ellipse cx="26" cy="31" rx="3.6" ry="4.2" fill="#2a2044"/><ellipse cx="38" cy="31" rx="3.6" ry="4.2" fill="#2a2044"/>'
      + '<path d="M27.5 40.5q4.5 4.5 9 0" stroke="#2a2044" stroke-width="3" fill="none" stroke-linecap="round"/>' },
    { id:'skull', name:'Skull', group:'Characters', art:
      '<rect width="64" height="64" fill="#131317"/>'
      + '<path d="M32 10c12 0 19 8 19 19 0 7-3 11-6 13v6a4 4 0 0 1-4 4H23a4 4 0 0 1-4-4v-6c-3-2-6-6-6-13 0-11 7-19 19-19z" fill="#eceff3"/>'
      + '<ellipse cx="24" cy="29" rx="5.6" ry="6.4" fill="#131317"/><ellipse cx="40" cy="29" rx="5.6" ry="6.4" fill="#131317"/>'
      + '<path d="M32 36l-3.2 5h6.4z" fill="#131317"/>'
      + '<rect x="25" y="45" width="3" height="7" fill="#131317"/><rect x="30.5" y="45" width="3" height="7" fill="#131317"/><rect x="36" y="45" width="3" height="7" fill="#131317"/>' },
    { id:'alien', name:'Alien', group:'Characters', art:
      '<rect width="64" height="64" fill="#1b2430"/>'
      + '<path d="M32 9c13 0 20 8 20 19 0 13-11 27-20 27s-20-14-20-27c0-11 7-19 20-19z" fill="#7ed36a"/>'
      + '<ellipse cx="23" cy="31" rx="6.4" ry="9" fill="#12181f" transform="rotate(-18 23 31)"/>'
      + '<ellipse cx="41" cy="31" rx="6.4" ry="9" fill="#12181f" transform="rotate(18 41 31)"/>'
      + '<path d="M28 45q4 3 8 0" stroke="#2d6b25" stroke-width="2.6" fill="none" stroke-linecap="round"/>' },
    { id:'robot', name:'Robot', group:'Characters', art:
      '<rect width="64" height="64" fill="#5f6d80"/>'
      + '<rect x="30.6" y="8" width="2.8" height="8" fill="#cfd6de"/><circle cx="32" cy="7" r="3.4" fill="#ef4444"/>'
      + '<rect x="13" y="17" width="38" height="34" rx="7" fill="#cfd6de"/>'
      + '<rect x="20" y="26" width="9" height="8" rx="2" fill="#1e2733"/><rect x="35" y="26" width="9" height="8" rx="2" fill="#1e2733"/>'
      + '<rect x="21" y="40" width="22" height="6" rx="3" fill="#1e2733"/>'
      + '<rect x="26" y="40" width="2" height="6" fill="#cfd6de"/><rect x="31" y="40" width="2" height="6" fill="#cfd6de"/><rect x="36" y="40" width="2" height="6" fill="#cfd6de"/>' },
    { id:'hooded', name:'Hooded', group:'Characters', art:
      '<rect width="64" height="64" fill="#222734"/>'
      + '<path d="M6 62c2-14 12-21 26-21s24 7 26 21z" fill="#3c4557"/>'
      + '<path d="M32 10c11 0 19 9 19 19 0 9-5 15-11 17H24c-6-2-11-8-11-17 0-10 8-19 19-19z" fill="#4c576e"/>'
      + '<ellipse cx="32" cy="33" rx="11.5" ry="13" fill="#12161f"/>'
      + '<ellipse cx="27" cy="33" rx="2.6" ry="2.2" fill="#7fd4ff"/><ellipse cx="37" cy="33" rx="2.6" ry="2.2" fill="#7fd4ff"/>' },
    { id:'shades', name:'Shades', group:'Characters', art:
      '<rect width="64" height="64" fill="#f0b429"/>'
      + '<circle cx="32" cy="33" r="19" fill="#ffd75e"/>'
      + '<path d="M10 28h44v4H10z" fill="#17171c"/>'
      + '<rect x="12" y="27" width="17" height="12" rx="5" fill="#17171c"/><rect x="35" y="27" width="17" height="12" rx="5" fill="#17171c"/>'
      + '<path d="M24 45q8 7 16 0" stroke="#17171c" stroke-width="3.4" fill="none" stroke-linecap="round"/>' },
    { id:'ninja', name:'Ninja', group:'Characters', art:
      '<rect width="64" height="64" fill="#1d1f2b"/>'
      + '<path d="M32 11c12 0 19 8 19 20s-8 22-19 22-19-10-19-22 7-20 19-20z" fill="#2f3446"/>'
      + '<path d="M13 29h38v9H13z" fill="#f2efe9"/>'
      + '<path d="M19 31.5q5-3 10 0-5 3-10 0zM35 31.5q5-3 10 0-5 3-10 0z" fill="#1d1f2b"/>'
      + '<path d="M51 29l11-5-4 9z" fill="#2f3446"/>' },
    { id:'wizard', name:'Wizard', group:'Characters', art:
      '<rect width="64" height="64" fill="#2b1f4d"/>'
      + '<path d="M32 4 48 32H16z" fill="#6d4fd0"/><circle cx="32" cy="9" r="2.6" fill="#ffd75e"/>'
      + '<path d="M14 33h36v5H14z" fill="#5a3fb5"/>'
      + '<path d="M20 38h24v10c0 6-5 10-12 10s-12-4-12-10z" fill="#f0cfa8"/>'
      + '<circle cx="26" cy="44" r="2.4" fill="#1d1327"/><circle cx="38" cy="44" r="2.4" fill="#1d1327"/>'
      + '<path d="M25 50h14c0 8-14 8-14 0z" fill="#e9e6df"/>' },
    { id:'clown', name:'Clown', group:'Characters', art:
      '<rect width="64" height="64" fill="#1a1420"/>'
      + '<circle cx="32" cy="35" r="19" fill="#f6ede2"/>'
      + '<path d="M11 30c1-11 9-18 21-18s20 7 21 18c-8-5-13-7-21-7s-13 2-21 7z" fill="#e0362c"/>'
      + '<circle cx="24" cy="35" r="3" fill="#1a1420"/><circle cx="40" cy="35" r="3" fill="#1a1420"/>'
      + '<circle cx="32" cy="41" r="4.4" fill="#e0362c"/>'
      + '<path d="M22 46q10 9 20 0" stroke="#e0362c" stroke-width="3" fill="none" stroke-linecap="round"/>' },
    { id:'knight', name:'Knight', group:'Characters', art:
      '<rect width="64" height="64" fill="#39404f"/>'
      + '<path d="M28 2h8l-2 9h-4z" fill="#e0362c"/>'
      + '<path d="M32 8c12 0 18 8 18 20v13c0 9-8 15-18 15s-18-6-18-15V28c0-12 6-20 18-20z" fill="#c3cbd6"/>'
      + '<path d="M13 26h38v8H13z" fill="#161b26"/>'
      + '<rect x="28.4" y="26" width="7.2" height="22" rx="2" fill="#161b26"/>'
      + '<path d="M14 40h13v3.4H14zM37 40h13v3.4H37z" fill="#9aa4b2"/>' },
    { id:'devil', name:'Devil', group:'Characters', art:
      '<rect width="64" height="64" fill="#2a0f14"/>'
      + '<path d="M13 20c0-6 1-10 3-13 3 4 6 6 9 7zM51 20c0-6-1-10-3-13-3 4-6 6-9 7z" fill="#d8322c"/>'
      + '<circle cx="32" cy="36" r="19" fill="#e0453a"/>'
      + '<path d="M22 31l8 4-8 3zM42 31l-8 4 8 3z" fill="#2a0f14"/>'
      + '<path d="M23 45q9 7 18 0" stroke="#2a0f14" stroke-width="3.2" fill="none" stroke-linecap="round"/>' },
    { id:'default', name:'No picture', group:'Characters', art:
      '<rect width="64" height="64" fill="#e9eaee"/>'
      + '<circle cx="32" cy="25" r="11" fill="#9aa1ac"/>'
      + '<path d="M11 60c0-12 9.4-19 21-19s21 7 21 19z" fill="#9aa1ac"/>' },

    /* ── animals ────────────────────────────────────────────────── */
    { id:'dog', name:'Pug', group:'Animals', art:
      '<rect width="64" height="64" fill="#c98a4e"/>'
      + '<path d="M13 21c-2 11 1 19 6 22l6-14z" fill="#4d3220"/><path d="M51 21c2 11-1 19-6 22l-6-14z" fill="#4d3220"/>'
      + '<ellipse cx="32" cy="36" rx="18" ry="16" fill="#eec89c"/>'
      + '<ellipse cx="32" cy="45" rx="11" ry="8" fill="#5b3d27"/>'
      + '<circle cx="25" cy="32" r="3.6" fill="#221509"/><circle cx="39" cy="32" r="3.6" fill="#221509"/>'
      + '<ellipse cx="32" cy="42" rx="4.6" ry="3.4" fill="#1a1008"/>'
      + '<path d="M29 49h6v5a3 3 0 0 1-6 0z" fill="#e8748a"/>' },
    { id:'cat', name:'Cat', group:'Animals', art:
      '<rect width="64" height="64" fill="#26262f"/>'
      + '<path d="M15 30 17 12l14 8zM49 30 47 12l-14 8z" fill="#43434f"/>'
      + '<circle cx="32" cy="36" r="17" fill="#43434f"/>'
      + '<ellipse cx="25" cy="34" rx="4.4" ry="5.2" fill="#a8e063"/><ellipse cx="39" cy="34" rx="4.4" ry="5.2" fill="#a8e063"/>'
      + '<rect x="24" y="30" width="2" height="9" rx="1" fill="#1b1b22"/><rect x="38" y="30" width="2" height="9" rx="1" fill="#1b1b22"/>'
      + '<path d="M32 42l-3.5 3h7z" fill="#e8748a"/>'
      + '<path d="M12 40h8M12 45h8M52 40h-8M52 45h-8" stroke="#7c7c8c" stroke-width="2.2" stroke-linecap="round"/>' },
    { id:'frog', name:'Frog', group:'Animals', art:
      '<rect width="64" height="64" fill="#245c26"/>'
      + '<ellipse cx="32" cy="40" rx="21" ry="16" fill="#57b356"/>'
      + '<circle cx="20" cy="22" r="10" fill="#57b356"/><circle cx="44" cy="22" r="10" fill="#57b356"/>'
      + '<circle cx="20" cy="22" r="6.2" fill="#fff"/><circle cx="44" cy="22" r="6.2" fill="#fff"/>'
      + '<circle cx="21" cy="23" r="3.2" fill="#131317"/><circle cx="45" cy="23" r="3.2" fill="#131317"/>'
      + '<path d="M17 42q15 10 30 0" stroke="#1d4a1f" stroke-width="3.4" fill="none" stroke-linecap="round"/>' },
    { id:'shark', name:'Shark', group:'Animals', art:
      '<rect width="64" height="64" fill="#12456b"/>'
      + '<path d="M4 44c10-16 22-24 36-24 10 0 18 4 22 10-6 10-18 18-34 18-10 0-18-1-24-4z" fill="#8fa9bd"/>'
      + '<path d="M30 20c2-8 6-13 10-16 1 6 1 11 0 16z" fill="#8fa9bd"/>'
      + '<circle cx="46" cy="30" r="2.8" fill="#0d2233"/>'
      + '<path d="M20 42h34l-4 5H24z" fill="#f4f7fa"/>'
      + '<path d="M26 42l3 5M33 42l2 5M40 42l2 5M47 42l1 5" stroke="#12456b" stroke-width="1.8"/>' },
    { id:'fox', name:'Fox', group:'Animals', art:
      '<rect width="64" height="64" fill="#5e2c0d"/>'
      + '<path d="M11 6l16 11-15 9zM53 6L37 17l15 9z" fill="#f08a34"/>'
      + '<path d="M15 11l8 6-8 4zM49 11l-8 6 8 4z" fill="#4a2109"/>'
      + '<path d="M32 15c11 0 19 8 19 18 0 12-8 21-19 21s-19-9-19-21c0-10 8-18 19-18z" fill="#f08a34"/>'
      + '<path d="M32 31c7 0 12 5 12 12s-5 11-12 11-12-4-12-11 5-12 12-12z" fill="#f8f0e4"/>'
      + '<circle cx="24" cy="29" r="3.2" fill="#2a1408"/><circle cx="40" cy="29" r="3.2" fill="#2a1408"/>'
      + '<path d="M32 39l-3.6 4h7.2z" fill="#2a1408"/>' },
    { id:'panda', name:'Panda', group:'Animals', art:
      '<rect width="64" height="64" fill="#3a3f4a"/>'
      + '<circle cx="16" cy="18" r="8" fill="#17171c"/><circle cx="48" cy="18" r="8" fill="#17171c"/>'
      + '<circle cx="32" cy="35" r="19" fill="#f4f2ee"/>'
      + '<ellipse cx="24" cy="32" rx="6" ry="7" fill="#17171c" transform="rotate(-16 24 32)"/>'
      + '<ellipse cx="40" cy="32" rx="6" ry="7" fill="#17171c" transform="rotate(16 40 32)"/>'
      + '<circle cx="24.6" cy="32.6" r="2.2" fill="#f4f2ee"/><circle cx="39.4" cy="32.6" r="2.2" fill="#f4f2ee"/>'
      + '<ellipse cx="32" cy="42" rx="4" ry="3" fill="#17171c"/>' },
    { id:'duck', name:'Duck', group:'Animals', art:
      '<rect width="64" height="64" fill="#1f6fb0"/>'
      + '<path d="M13 52c5-8 13-12 23-12s16 4 21 12z" fill="#f5c542"/>'
      + '<circle cx="37" cy="28" r="17" fill="#ffd75e"/>'
      + '<path d="M5 28c0-4 3-6 7-6h13v13H12c-4 0-7-3-7-7z" fill="#f0912b"/>'
      + '<path d="M8 29h15" stroke="#c46f16" stroke-width="2"/>'
      + '<circle cx="38" cy="23" r="3.4" fill="#17171c"/>' },
    { id:'owl', name:'Owl', group:'Animals', art:
      '<rect width="64" height="64" fill="#33465e"/>'
      + '<path d="M12 20 15 6l11 9zM52 20 49 6l-11 9z" fill="#b08858"/>'
      + '<path d="M32 10c13 0 20 10 20 22s-7 23-20 23-20-11-20-23 7-22 20-22z" fill="#c8a06c"/>'
      + '<circle cx="23" cy="29" r="9" fill="#f6f1e4"/><circle cx="41" cy="29" r="9" fill="#f6f1e4"/>'
      + '<circle cx="23" cy="29" r="4.2" fill="#17171c"/><circle cx="41" cy="29" r="4.2" fill="#17171c"/>'
      + '<path d="M32 33l-5 7h10z" fill="#f0912b"/>'
      + '<path d="M20 45q12 7 24 0" stroke="#9c7648" stroke-width="3" fill="none" stroke-linecap="round"/>' },
    { id:'bee', name:'Bee', group:'Animals', art:
      '<rect width="64" height="64" fill="#2c2a1a"/>'
      + '<ellipse cx="20" cy="22" rx="12" ry="8" fill="#dff1fb" opacity=".8" transform="rotate(-24 20 22)"/>'
      + '<ellipse cx="44" cy="22" rx="12" ry="8" fill="#dff1fb" opacity=".8" transform="rotate(24 44 22)"/>'
      + '<ellipse cx="32" cy="38" rx="16" ry="17" fill="#f5c542"/>'
      + '<path d="M17 32h30v5H17zM19 43h26v5H19z" fill="#221f10"/>'
      + '<circle cx="26" cy="27" r="2.6" fill="#221f10"/><circle cx="38" cy="27" r="2.6" fill="#221f10"/>' },
    { id:'axolotl', name:'Axolotl', group:'Animals', art:
      '<rect width="64" height="64" fill="#3d2440"/>'
      + '<path d="M10 24c-2-6 0-10 3-12 2 4 4 7 7 9zM54 24c2-6 0-10-3-12-2 4-4 7-7 9z" fill="#f19ec2"/>'
      + '<path d="M8 34c-4-4-4-8-2-11 3 3 6 5 9 6zM56 34c4-4 4-8 2-11-3 3-6 5-9 6z" fill="#f19ec2"/>'
      + '<ellipse cx="32" cy="36" rx="18" ry="17" fill="#f7b9d4"/>'
      + '<circle cx="24" cy="33" r="2.8" fill="#3d2440"/><circle cx="40" cy="33" r="2.8" fill="#3d2440"/>'
      + '<path d="M26 42q6 5 12 0" stroke="#3d2440" stroke-width="2.6" fill="none" stroke-linecap="round"/>' },

    /* ── food ───────────────────────────────────────────────────── */
    { id:'ramen', name:'Ramen', group:'Food', art:
      '<rect width="64" height="64" fill="#5a1f1f"/>'
      + '<path d="M8 30h48c0 14-10 24-24 24S8 44 8 30z" fill="#f2efe6"/>'
      + '<path d="M12 30h40c0 3-1 5-2 7H14c-1-2-2-4-2-7z" fill="#e8c78a"/>'
      + '<circle cx="24" cy="24" r="6" fill="#f7f3e8"/><circle cx="24" cy="24" r="2.8" fill="#f0912b"/>'
      + '<path d="M38 18h12v4H38z" fill="#3f8f4a"/>'
      + '<path d="M14 44h36" stroke="#d9d2c2" stroke-width="2.4" stroke-linecap="round"/>'
      + '<path d="M40 8l16 8-2 4-16-8z" fill="#c9a06a"/>' },
    { id:'pizza', name:'Pizza', group:'Food', art:
      '<rect width="64" height="64" fill="#2b1a12"/>'
      + '<path d="M32 6 58 54H6z" fill="#f0c86a"/>'
      + '<path d="M32 14 51 50H13z" fill="#e8913a"/>'
      + '<circle cx="32" cy="30" r="4" fill="#d8322c"/><circle cx="22" cy="42" r="3.6" fill="#d8322c"/>'
      + '<circle cx="42" cy="42" r="3.6" fill="#d8322c"/><circle cx="32" cy="45" r="3" fill="#d8322c"/>' },
    { id:'donut', name:'Donut', group:'Food', art:
      '<rect width="64" height="64" fill="#2d3f5e"/>'
      + '<circle cx="32" cy="33" r="22" fill="#e0a86a"/>'
      + '<path d="M32 13a20 20 0 0 1 0 40 20 20 0 0 1 0-40zm0 4a16 16 0 0 0 0 32 16 16 0 0 0 0-32z" fill="#f19ec2"/>'
      + '<circle cx="32" cy="33" r="8" fill="#2d3f5e"/>'
      + '<rect x="20" y="20" width="6" height="2.6" rx="1.3" fill="#f7f3e8" transform="rotate(-30 23 21)"/>'
      + '<rect x="40" y="24" width="6" height="2.6" rx="1.3" fill="#8fd14f" transform="rotate(24 43 25)"/>'
      + '<rect x="26" y="45" width="6" height="2.6" rx="1.3" fill="#4f7cff" transform="rotate(-12 29 46)"/>'
      + '<rect x="38" y="42" width="6" height="2.6" rx="1.3" fill="#ffd75e" transform="rotate(40 41 43)"/>' },
    { id:'avocado', name:'Avocado', group:'Food', art:
      '<rect width="64" height="64" fill="#1f3520"/>'
      + '<path d="M32 8c11 0 18 10 18 22s-8 26-18 26-18-14-18-26S21 8 32 8z" fill="#4e7c3a"/>'
      + '<path d="M32 15c8 0 13 8 13 17s-6 20-13 20-13-11-13-20 5-17 13-17z" fill="#cfe08a"/>'
      + '<circle cx="32" cy="36" r="8.5" fill="#8a5a2a"/>' },
    { id:'coffee', name:'Coffee', group:'Food', art:
      '<rect width="64" height="64" fill="#20140e"/>'
      + '<path d="M12 24h34v18c0 7-6 12-17 12s-17-5-17-12z" fill="#f2efe6"/>'
      + '<path d="M46 28h6a7 7 0 0 1 0 14h-6z" fill="none" stroke="#f2efe6" stroke-width="4"/>'
      + '<path d="M12 24h34v6H12z" fill="#8a5a2a"/>'
      + '<path d="M22 10c0 4-4 4-4 8M32 8c0 4-4 4-4 8M42 10c0 4-4 4-4 8" stroke="#8d8378" stroke-width="2.6" fill="none" stroke-linecap="round"/>' },
    { id:'boba', name:'Boba', group:'Food', art:
      '<rect width="64" height="64" fill="#2b2233"/>'
      + '<path d="M18 18h28l-3 36c0 3-4 5-11 5s-11-2-11-5z" fill="#e8d3b8"/>'
      + '<path d="M16 14h32v6H16z" fill="#f19ec2"/>'
      + '<path d="M40 6l4 2-12 8-2-3z" fill="#f2efe6"/>'
      + '<circle cx="25" cy="48" r="3.2" fill="#2b1a12"/><circle cx="33" cy="51" r="3.2" fill="#2b1a12"/>'
      + '<circle cx="41" cy="47" r="3.2" fill="#2b1a12"/><circle cx="30" cy="43" r="3" fill="#2b1a12"/>' },

    /* ── objects ────────────────────────────────────────────────── */
    { id:'console', name:'Console', group:'Objects', art:
      '<rect width="64" height="64" fill="#2a2f3d"/>'
      + '<rect x="12" y="8" width="40" height="48" rx="7" fill="#c9ced8"/>'
      + '<rect x="18" y="14" width="28" height="20" rx="3" fill="#1d2a1f"/>'
      + '<rect x="26" y="18" width="12" height="12" rx="2" fill="#8fd14f"/>'
      + '<path d="M18 40h4v-4h4v4h4v4h-4v4h-4v-4h-4z" fill="#3b4252"/>'
      + '<circle cx="40" cy="41" r="3.4" fill="#e0362c"/><circle cx="46" cy="47" r="3.4" fill="#e0362c"/>' },
    { id:'camera', name:'Camera', group:'Objects', art:
      '<rect width="64" height="64" fill="#1d2129"/>'
      + '<rect x="6" y="18" width="52" height="32" rx="6" fill="#3f4756"/>'
      + '<rect x="22" y="12" width="14" height="8" rx="2" fill="#3f4756"/>'
      + '<circle cx="30" cy="34" r="12" fill="#1a1d24"/><circle cx="30" cy="34" r="8" fill="#4f7cff"/>'
      + '<circle cx="27" cy="31" r="2.6" fill="#dff1fb"/>'
      + '<circle cx="49" cy="25" r="2.6" fill="#e0362c"/>' },
    { id:'ball', name:'Ball', group:'Objects', art:
      '<rect width="64" height="64" fill="#7a3a12"/>'
      + '<circle cx="32" cy="33" r="22" fill="#e8762c"/>'
      + '<path d="M32 11v44M10 33h44" stroke="#20140e" stroke-width="2.6"/>'
      + '<path d="M17 17c8 8 8 24 0 32M47 17c-8 8-8 24 0 32" stroke="#20140e" stroke-width="2.6" fill="none"/>' },
    { id:'cassette', name:'Cassette', group:'Objects', art:
      '<rect width="64" height="64" fill="#242a36"/>'
      + '<rect x="6" y="16" width="52" height="34" rx="4" fill="#e8e3d8"/>'
      + '<rect x="12" y="22" width="40" height="14" rx="2" fill="#2c323e"/>'
      + '<circle cx="23" cy="29" r="4.6" fill="#e8e3d8"/><circle cx="41" cy="29" r="4.6" fill="#e8e3d8"/>'
      + '<rect x="18" y="40" width="28" height="6" rx="2" fill="#c8c1b2"/>'
      + '<rect x="10" y="18" width="44" height="3" fill="#e0362c"/>' },
    { id:'rocket', name:'Rocket', group:'Objects', art:
      '<rect width="64" height="64" fill="#141a2b"/>'
      + '<path d="M32 4c8 7 12 17 12 28v10H20V32c0-11 4-21 12-28z" fill="#e8e3d8"/>'
      + '<circle cx="32" cy="26" r="6" fill="#4f7cff"/>'
      + '<path d="M20 34l-9 12h9zM44 34l9 12h-9z" fill="#d8322c"/>'
      + '<path d="M26 42h12l-6 16z" fill="#f0912b"/>' },
    { id:'cone', name:'Cone', group:'Objects', art:
      '<rect width="64" height="64" fill="#20232c"/>'
      + '<path d="M32 8 48 50H16z" fill="#e8762c"/>'
      + '<path d="M25 30h14l1.6 5H23.4zM21 40h22l1.6 5H19.4z" fill="#f2efe6"/>'
      + '<rect x="10" y="50" width="44" height="6" rx="2" fill="#e8762c"/>' },
    { id:'mic', name:'Mic', group:'Objects', art:
      '<rect width="64" height="64" fill="#2a1c2e"/>'
      + '<rect x="24" y="8" width="16" height="28" rx="8" fill="#d0d6e0"/>'
      + '<path d="M17 30a15 15 0 0 0 30 0" stroke="#e0362c" stroke-width="4" fill="none" stroke-linecap="round"/>'
      + '<rect x="30" y="44" width="4" height="10" fill="#d0d6e0"/>'
      + '<rect x="22" y="53" width="20" height="4" rx="2" fill="#d0d6e0"/>'
      + '<path d="M27 14h10M27 20h10M27 26h10" stroke="#8b93a1" stroke-width="1.8"/>' },

    /* ── nature ─────────────────────────────────────────────────── */
    { id:'flame', name:'Flame', group:'Nature', art:
      '<rect width="64" height="64" fill="#171016"/>'
      + '<path d="M32 6c9 12 18 15 18 28a18 18 0 0 1-36 0c0-8 5-11 8-17 2 5 4 7 6 8 0-8 1-14 4-19z" fill="#f97316"/>'
      + '<path d="M32 26c5 6 8 9 8 15a8 8 0 0 1-16 0c0-5 4-8 8-15z" fill="#fbbf24"/>' },
    { id:'wave', name:'Wave', group:'Nature', art:
      '<rect width="64" height="64" fill="#0e2a46"/>'
      + '<path d="M0 30c14-14 26 6 38-4 8-6 18-4 26 4v34H0z" fill="#1f6fb0"/>'
      + '<path d="M0 42c12-10 22 4 34-3 10-6 20-3 30 3v22H0z" fill="#3d95d8"/>'
      + '<path d="M0 52c12-6 22 2 34-2 10-4 20-1 30 3v11H0z" fill="#7fc4ea"/>' },
    { id:'moon', name:'Moon', group:'Nature', art:
      '<rect width="64" height="64" fill="#151a33"/>'
      + '<circle cx="34" cy="32" r="22" fill="#f2e9c9"/>'
      + '<circle cx="22" cy="25" r="19" fill="#151a33"/>'
      + '<circle cx="11" cy="12" r="2.2" fill="#f2e9c9"/><circle cx="21" cy="7" r="1.6" fill="#f2e9c9"/>'
      + '<circle cx="8" cy="34" r="1.8" fill="#f2e9c9"/><circle cx="15" cy="52" r="2" fill="#f2e9c9"/>'
      + '<circle cx="52" cy="9" r="1.8" fill="#f2e9c9"/>' },
    { id:'cactus', name:'Cactus', group:'Nature', art:
      '<rect width="64" height="64" fill="#e0a86a"/>'
      + '<rect x="26" y="10" width="12" height="42" rx="6" fill="#3f8f4a"/>'
      + '<path d="M14 26h4a4 4 0 0 1 4 4v8h-8a4 4 0 0 1-4-4v-4a4 4 0 0 1 4-4z" fill="#3f8f4a"/>'
      + '<path d="M50 20h-4a4 4 0 0 0-4 4v10h8a4 4 0 0 0 4-4v-6a4 4 0 0 0-4-4z" fill="#3f8f4a"/>'
      + '<path d="M10 52h44v8H10z" fill="#c98a4e"/>'
      + '<circle cx="32" cy="9" r="3.4" fill="#f19ec2"/>' },
    { id:'mushroom', name:'Mushroom', group:'Nature', art:
      '<rect width="64" height="64" fill="#1f2a1c"/>'
      + '<path d="M32 8c14 0 24 9 24 18 0 3-2 5-6 5H14c-4 0-6-2-6-5 0-9 10-18 24-18z" fill="#d8322c"/>'
      + '<circle cx="20" cy="22" r="4" fill="#f6f1e4"/><circle cx="34" cy="17" r="5" fill="#f6f1e4"/><circle cx="45" cy="24" r="3.4" fill="#f6f1e4"/>'
      + '<path d="M24 31h16v17c0 5-3 8-8 8s-8-3-8-8z" fill="#f0e2c8"/>' },
    { id:'mountain', name:'Peak', group:'Nature', art:
      '<rect width="64" height="64" fill="#1d2a3d"/>'
      + '<circle cx="47" cy="16" r="7" fill="#ffd75e"/>'
      + '<path d="M0 58 22 20l14 22 8-10 20 26z" fill="#3f5a7a"/>'
      + '<path d="M22 20l7 12H15zM44 32l5 6H39z" fill="#e8eef5"/>' },

    /* ── symbols ────────────────────────────────────────────────── */
    { id:'money', name:'Money', group:'Symbols', art:
      '<rect width="64" height="64" fill="#10603f"/>'
      + '<rect x="10" y="34" width="44" height="17" rx="3" fill="#6fce9c" transform="rotate(-8 32 42)"/>'
      + '<rect x="12" y="28" width="40" height="17" rx="3" fill="#8fe2b6"/>'
      + '<circle cx="32" cy="36.5" r="6.4" fill="#10603f"/>'
      + '<text x="32" y="41" text-anchor="middle" fill="#8fe2b6" font-family="system-ui,sans-serif" font-size="13" font-weight="900">$</text>'
      + '<circle cx="32" cy="17" r="7" fill="#8fe2b6"/>'
      + '<text x="32" y="21.5" text-anchor="middle" fill="#10603f" font-family="system-ui,sans-serif" font-size="10" font-weight="900">$</text>' },
    { id:'bolt', name:'Bolt', group:'Symbols', art:
      '<rect width="64" height="64" fill="#191b2b"/>'
      + '<path d="M36 4 14 36h13l-5 24 22-34H31z" fill="#ffd75e"/>' },
    { id:'crown', name:'Crown', group:'Symbols', art:
      '<rect width="64" height="64" fill="#2b1f0e"/>'
      + '<path d="M8 44 6 16l14 11L32 8l12 19 14-11-2 28z" fill="#e8b93a"/>'
      + '<rect x="8" y="46" width="48" height="9" rx="3" fill="#c99a20"/>'
      + '<circle cx="20" cy="36" r="3" fill="#d8322c"/><circle cx="32" cy="32" r="3.4" fill="#4f7cff"/><circle cx="44" cy="36" r="3" fill="#3f8f4a"/>' },
    { id:'heart', name:'Heart', group:'Symbols', art:
      '<rect width="64" height="64" fill="#3d0f1c"/>'
      + '<path d="M32 56C14 44 6 34 6 24 6 15 13 9 21 9c5 0 9 2 11 6 2-4 6-6 11-6 8 0 15 6 15 15 0 10-8 20-26 32z" fill="#e0446e"/>'
      + '<path d="M18 18c-3 2-4 5-4 8" stroke="#f7a8bf" stroke-width="3.4" fill="none" stroke-linecap="round"/>' },
    { id:'star', name:'Star', group:'Symbols', art:
      '<rect width="64" height="64" fill="#1a1633"/>'
      + '<path d="m32 5 8 17 19 2.6-14 13.4 3.6 19L32 48 15.4 57 19 38 5 24.6 24 22z" fill="#ffd75e"/>' },
    { id:'eye', name:'Eye', group:'Symbols', art:
      '<rect width="64" height="64" fill="#16121f"/>'
      + '<path d="M4 32c8-13 17-19 28-19s20 6 28 19c-8 13-17 19-28 19S12 45 4 32z" fill="#f2efe6"/>'
      + '<circle cx="32" cy="32" r="13" fill="#6d4fd0"/><circle cx="32" cy="32" r="6" fill="#16121f"/>'
      + '<circle cx="28" cy="27" r="2.6" fill="#f2efe6"/>' },
    { id:'target', name:'Target', group:'Symbols', art:
      '<rect width="64" height="64" fill="#f2efe6"/>'
      + '<circle cx="32" cy="32" r="26" fill="#d8322c"/><circle cx="32" cy="32" r="18" fill="#f2efe6"/>'
      + '<circle cx="32" cy="32" r="11" fill="#d8322c"/><circle cx="32" cy="32" r="4.4" fill="#f2efe6"/>' },
    { id:'anchor', name:'Anchor', group:'Symbols', art:
      '<rect width="64" height="64" fill="#123b52"/>'
      + '<circle cx="32" cy="13" r="6" fill="none" stroke="#e8e3d8" stroke-width="4"/>'
      + '<rect x="29.6" y="18" width="4.8" height="34" fill="#e8e3d8"/>'
      + '<rect x="20" y="24" width="24" height="4.4" rx="2" fill="#e8e3d8"/>'
      + '<path d="M12 36c0 12 9 20 20 20s20-8 20-20" stroke="#e8e3d8" stroke-width="4.6" fill="none" stroke-linecap="round"/>' }
  ];

  /* ── The photo tier ──────────────────────────────────────────────
     Cropped square from the circle in each source screenshot at 320px,
     which is 2x the largest tile the rail ever paints. Ids are stable so
     a `taken` map keeps behaving, but nothing stores one on an account
     (see the header), so they are safe to re-cut. */
  var PHOTOS = [
    { id:'pic-cap',     name:'Cap',     src:'/img/pfp/cap.jpg' },
    { id:'pic-cash',    name:'Cash',    src:'/img/pfp/cash.jpg' },
    { id:'pic-chibi',   name:'Chibi',   src:'/img/pfp/chibi.jpg' },
    { id:'pic-danbo',   name:'Box',     src:'/img/pfp/danbo.jpg' },
    { id:'pic-default', name:'Default', src:'/img/pfp/default.jpg' },
    { id:'pic-duo',     name:'Duo',     src:'/img/pfp/duo.jpg' },
    { id:'pic-krispy',  name:'Krispy',  src:'/img/pfp/krispy.jpg' },
    { id:'pic-lisa',    name:'Lisa',    src:'/img/pfp/lisa.jpg' },
    { id:'pic-pug',     name:'Pug',     src:'/img/pfp/pug.jpg' },
    { id:'pic-snow',    name:'Snow',    src:'/img/pfp/snow.jpg' }
  ];

  var BY_ID = {};
  for (var i = 0; i < SET.length; i++) BY_ID[SET[i].id] = SET[i];
  for (var pi = 0; pi < PHOTOS.length; pi++) BY_ID[PHOTOS[pi].id] = PHOTOS[pi];

  function art(id) {
    var it = BY_ID[id];
    return it ? it.art : '';
  }
  /* size defaults to filling its box; the tile is always square and always
     cropped, so a non-square host never distorts one. */
  function svg(id, size) {
    var it = BY_ID[id];
    var dim = size == null ? '100%' : (typeof size === 'number' ? size + 'px' : size);
    /* A photo tile answers the same call and returns markup the same
       callers can drop in place, so no surface has to know which tier it
       got. It keeps the db-pfp class because that is what the stylesheets
       key the stand-in layer on, and it must stay BEHIND an account's own
       photo where both are present. */
    if (it && it.src) {
      /* EAGER, deliberately. Every consumer of this tier paints above the
         fold on the first screen, so a lazy tile cannot start its fetch
         until layout has run and the picture arrives after the column it
         belongs to. Six tiles at ~19KB is not a budget worth deferring.
         (It also sidesteps a preview-browser artifact that reports the
         document hidden, where Chrome defers lazy images indefinitely and
         the rail reads as broken when it is not.)
         Intrinsic size only when a caller asked for a real one: the
         stylesheets size the tile to its box, and width="100%" is not a
         valid attribute value, so passing the default through would put
         a junk attribute on every tile. */
      var box = (typeof size === 'number') ? ' width="' + size + '" height="' + size + '"' : '';
      return '<img class="db-pfp" src="' + it.src + '" alt=""' + box
        + ' decoding="async" aria-hidden="true">';
    }
    var a = art(id);
    if (!a) return '';
    return '<svg class="db-pfp" viewBox="0 0 64 64" width="' + dim + '" height="' + dim + '"'
      + ' xmlns="http://www.w3.org/2000/svg" aria-hidden="true" preserveAspectRatio="xMidYMid slice">'
      + a + '</svg>';
  }
  function hash(str) {
    var h = 2166136261 >>> 0;
    str = String(str);
    for (var k = 0; k < str.length; k++) { h ^= str.charCodeAt(k); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  /* Stable per seed (a picture that reshuffles on refresh reads as broken)
     and deduped within one surface via `taken` (the same ghost twice on one
     board reads as a bug). Probes forward from the hashed slot. */
  function pick(seed, taken, pool) {
    var list = pool && pool.length ? pool : SET;
    var h = hash(seed), n = list[h % list.length].id, k;
    if (taken) {
      for (k = 0; k < list.length; k++) {
        n = list[(h + k) % list.length].id;
        if (!taken[n]) break;
      }
      taken[n] = 1;
    }
    return n;
  }
  function pickSvg(seed, taken, size) { return svg(pick(seed, taken), size); }
  /* What the first-screen rail calls. Separate from pickSvg rather than a
     flag on it, so a surface that wants the drawn set cannot get photos by
     forgetting an argument. */
  function pickPhoto(seed, taken) { return pick(seed, taken, PHOTOS); }
  function pickPhotoSvg(seed, taken, size) { return svg(pickPhoto(seed, taken), size); }

  /* `list` stays the DRAWN set on purpose: it is what the picker renders,
     and a photo tile must never become something an account can wear. */
  global.DBPfp = {
    list: SET, photos: PHOTOS, byId: BY_ID,
    has: function (id) { return !!BY_ID[id]; },
    /* Membership check for the three server allow-lists and the topbar
       probe, which may only ever accept a pickable id. */
    canWear: function (id) { return !!BY_ID[id] && !BY_ID[id].src; },
    art: art, svg: svg, pick: pick, pickSvg: pickSvg,
    pickPhoto: pickPhoto, pickPhotoSvg: pickPhotoSvg, hash: hash
  };
})(typeof window !== 'undefined' ? window : this);
