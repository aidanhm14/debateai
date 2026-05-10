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
