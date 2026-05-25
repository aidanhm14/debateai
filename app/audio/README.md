# /audio/

Pre-rendered audio clips served at `/audio/<name>.mp3`.

## splash-hook.mp3

3-second AI debater voice line that plays on splash tap (see `app/splash.html`).
The splash gracefully falls back to silent if this file is missing — so it's
safe to ship the splash without it, and drop the file in once OpenAI quota
is restored.

### Generate via OpenAI gpt-4o-mini-tts

Recommended line: **"I'll push back. Make your case."** (matches the splash
headline "Argue out loud." and previews the adversarial register.)

```bash
curl https://api.openai.com/v1/audio/speech \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini-tts",
    "voice": "onyx",
    "input": "Ill push back. Make your case.",
    "instructions": "Confident varsity-debater register. Slight smirk. Not aggressive — sharp. Pause briefly between sentences.",
    "response_format": "mp3"
  }' \
  --output app/audio/splash-hook.mp3
```

Other voices worth testing: `ballad`, `sage`, `verse`. Pick whichever lands
the "real opponent" energy without sounding marketing-y.

### Generate via ElevenLabs (Pro tier)

If OpenAI quota is the bottleneck and you have ElevenLabs creds:

```bash
curl -X POST "https://api.elevenlabs.io/v1/text-to-speech/$ELEVENLABS_VOICE_ID" \
  -H "xi-api-key: $ELEVENLABS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "I will push back. Make your case.",
    "model_id": "eleven_turbo_v2_5"
  }' \
  --output app/audio/splash-hook.mp3
```

### After dropping the file

Bump `CACHE_NAME` in both `sw.js` files so the new MP3 invalidates any
cached splash without one. The splash code already plays defensively
(no-op on 404), so missing the bump just delays the first-tap audio
until the user's SW catches up.

### Size target

Keep under 60KB. The splash is the public-face entry; every byte counts on
mobile. 3 seconds at 96kbps mono lands around 35KB.

---

## bg-1.mp3 … bg-6.mp3 (landing background music)

Optional ambient instrumentals streamed by `/js/bg-music.js` when the
landing-page topbar music toggle is on. Off by default; the module
falls through silently if any file is missing, so it is safe to ship
the toggle without the assets.

### Source + license

All six tracks are by **Kevin MacLeod** (incompetech.com), licensed
under [**Creative Commons Attribution 4.0**](https://creativecommons.org/licenses/by/4.0/).
CC BY requires:

1. Credit the artist (Kevin MacLeod)
2. Link the license (https://creativecommons.org/licenses/by/4.0/)
3. Note if changes were made (we did: trimmed + transcoded to 96 kbps mono)

The user-facing attribution lives in `app/landing.html` inside the
`<footer class="footer">` block immediately above the copyright legal
line. Don't strip it — that's the load-bearing piece of the license.

### Track list

| Slot       | Title           | Source URL                                                                       | Vibe                                       |
| ---------- | --------------- | -------------------------------------------------------------------------------- | ------------------------------------------ |
| `bg-1.mp3` | Light Awash     | https://incompetech.com/music/royalty-free/mp3-royaltyfree/Light%20Awash.mp3     | Gentle ambient (trimmed to first 5 min)    |
| `bg-2.mp3` | Anamalie        | https://incompetech.com/music/royalty-free/mp3-royaltyfree/Anamalie.mp3          | Minimalist piano, calm                     |
| `bg-3.mp3` | Floating Cities | https://incompetech.com/music/royalty-free/mp3-royaltyfree/Floating%20Cities.mp3 | Dreamy ambient                             |
| `bg-4.mp3` | Lightless Dawn  | https://incompetech.com/music/royalty-free/mp3-royaltyfree/Lightless%20Dawn.mp3  | Atmospheric, slightly cinematic            |
| `bg-5.mp3` | Long Note Two   | https://incompetech.com/music/royalty-free/mp3-royaltyfree/Long%20Note%20Two.mp3 | Ambient drone, very neutral                |
| `bg-6.mp3` | Lost Frontier   | https://incompetech.com/music/royalty-free/mp3-royaltyfree/Lost%20Frontier.mp3   | Cinematic ambient, closes out              |

### Reproduce the build

```bash
# Re-fetch + re-transcode all six (idempotent):
FF=/Applications/Plaud.app/Contents/Resources/ffmpeg
cd app/audio
for slot_url in \
  "bg-1.mp3|Light%20Awash.mp3" \
  "bg-2.mp3|Anamalie.mp3" \
  "bg-3.mp3|Floating%20Cities.mp3" \
  "bg-4.mp3|Lightless%20Dawn.mp3" \
  "bg-5.mp3|Long%20Note%20Two.mp3" \
  "bg-6.mp3|Lost%20Frontier.mp3"; do
  slot="${slot_url%|*}"; track="${slot_url#*|}"
  curl -sL "https://incompetech.com/music/royalty-free/mp3-royaltyfree/${track}" -o "_${slot}"
  "$FF" -y -loglevel error -i "_${slot}" -ac 1 -b:a 96k "${slot}"
  rm "_${slot}"
done
# bg-1 (Light Awash) is ~28 min; trim to first 5 min:
"$FF" -y -loglevel error -i bg-1.mp3 -t 300 -c:a copy _bg-1.mp3 && mv _bg-1.mp3 bg-1.mp3
```

### Size target

Each track is 96 kbps mono. Current sizes: 2-5 MB per track, ~23 MB total.
The module uses `preload="none"` so only toggled-on users pay the bandwidth.

### Swapping tracks

`/js/bg-music.js` starts at a random index on toggle-on, then steps
sequentially. To swap a track: drop the new mp3 into the slot, rename,
and update the table above + the footer attribution if the artist changes.
The module doesn't care which track lives in which slot.
