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

Optional lo-fi instrumentals streamed by `/js/bg-music.js` when the
landing-page topbar music toggle is on. Off by default; the module
falls through silently if any file is missing, so it is safe to ship
the toggle before the assets land.

All six tracks are **Pixabay Music (CC0, no attribution required)**.
Download each from pixabay.com/music and rename to the target slot:

| Slot           | Pixabay track            | Vibe                                          |
| -------------- | ------------------------ | --------------------------------------------- |
| `bg-1.mp3`     | Lukrembo — Roses         | Warm lo-fi, jazz keys. Opens calm-focused.    |
| `bg-2.mp3`     | Aylex — Smile            | Soft hip-hop instrumental. Landing-page neutral. |
| `bg-3.mp3`     | Massobeats — Honey Jam   | Chill boom-bap, no melodic spikes.            |
| `bg-4.mp3`     | Purrple Cat — Equinox    | Atmospheric lo-fi, slightly cinematic.        |
| `bg-5.mp3`     | Lukrembo — Sunset        | Sleepier. Good for the lower-fold sections.   |
| `bg-6.mp3`     | Aylex — Coffee           | Light hip-hop. Does not pull attention.       |

### Drop-in procedure

```bash
# After downloading from pixabay.com/music:
mv ~/Downloads/lukrembo-roses-*.mp3   app/audio/bg-1.mp3
mv ~/Downloads/aylex-smile-*.mp3      app/audio/bg-2.mp3
mv ~/Downloads/massobeats-honey-*.mp3 app/audio/bg-3.mp3
mv ~/Downloads/purrple-cat-*.mp3      app/audio/bg-4.mp3
mv ~/Downloads/lukrembo-sunset-*.mp3  app/audio/bg-5.mp3
mv ~/Downloads/aylex-coffee-*.mp3     app/audio/bg-6.mp3
```

Then bump `CACHE_NAME` in both `sw.js` files so the new audio files
make it past the service worker cache. The pre-commit hook handles
this for any commit touching `app/audio/*`.

### Size target

Compress each to ~96-128kbps mono (or 128kbps stereo if the source
demands it). Target ≤ 2 MB per track; with `preload="none"` only
toggled-on users pay the bandwidth, but smaller is still kinder.

### Swap notes

The track order matters: `/js/bg-music.js` starts at a random index on
toggle-on, then steps sequentially, so all six should be safe to follow
each other tonally. If you want a different opener, just rename the
files; the module doesn't care which track lives in which slot.
