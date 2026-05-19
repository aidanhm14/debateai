# /audio/sfx/

Pre-rendered ElevenLabs sound effects served at `/audio/sfx/<name>.mp3`.
Played by `app/js/sfx.js` with a Web Audio synth fallback if any file
is missing — so it's safe to ship the runtime before the MP3s exist.

## Cues (must match `app/js/sfx.js` palette)

| Name | When | Default duration |
|---|---|---|
| `click.mp3`   | Generic UI tap                           | ~0.3s |
| `send.mp3`    | User commits / submits                   | ~0.3s |
| `receive.mp3` | AI / system reply lands                  | ~0.4s |
| `success.mp3` | Milestone — round complete, ballot ready | ~0.6s |
| `confirm.mp3` | Splash tap, accept-pressed-yes           | ~0.3s |
| `error.mp3`   | API failure, validation error            | ~0.4s |

These map 1:1 to `SFX.click()` / `SFX.send()` / `SFX.receive()` /
`SFX.success()` / `SFX.confirm()` / `SFX.error()`. The semantic
aliases (`SFX.start = SFX.success`, `SFX.end = SFX.confirm`,
`SFX.interrupt = SFX.click`) ride on top of the same MP3s.

## Generate (recommended path)

```bash
ELEVENLABS_API_KEY=sk_... node scripts/generate-sfx.mjs
```

Idempotent — only generates files that don't already exist. Pass
`--force` to regenerate the whole bank, or `--only click,success` to
restrict to specific cues. See the script source for prompts and
`prompt_influence` defaults.

## Generate a single cue via curl

If you want to A/B a single prompt without running the whole script:

```bash
curl -X POST 'https://api.elevenlabs.io/v1/sound-generation' \
  -H "xi-api-key: $ELEVENLABS_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "text": "Soft minimal UI tap, single short click, modern app interface, clean, dry, 100ms, no reverb, no music",
    "duration_seconds": 0.5,
    "prompt_influence": 0.55
  }' \
  --output app/audio/sfx/click.mp3
```

## Prompt-writing notes

What works:
- Lead with the artifact ("Soft notification chime", "Quick upward swoosh").
- Specify modernity ("modern app interface", "modern UI feedback").
- Negative constraints land — "no reverb", "no music", "no voice".
- Keep durations short. The API takes `duration_seconds` 0.5–22; we
  always ask for 0.5–0.7 since UI cues read as crisp under ~400ms.

What doesn't:
- Musical interval language ("major third arpeggio") — the model treats
  it as decorative.
- Naming brands ("like the Notion success ping").
- Long, layered descriptions. Two sentences max.

## After dropping files

Bump `CACHE_NAME` in both `sw.js` files so the new MP3s invalidate
older bundles. The pre-commit hook does this automatically when client
files change; if you skipped it, run:

```bash
node scripts/precompile-inline-babel.mjs   # (no-op if nothing inline changed)
# then either commit (hook runs) or edit CACHE_NAME by hand.
```

## Size target

≤30 KB per cue. ElevenLabs returns 44.1kHz MP3s — typical UI ping at
0.5s lands around 8–15 KB. Anything over 40 KB probably means the
prompt asked for a longer tail than the cue warrants; tighten it.
