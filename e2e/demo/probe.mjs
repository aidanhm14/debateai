// Extract the first and last frame of every trimmed clip in a timeline output
// and tile them, so a cut point can be checked by eye before rendering.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'out');
const FF = '/Applications/Plaud.app/Contents/Resources/ffmpeg';
const t = JSON.parse(fs.readFileSync(path.join(HERE, 'timeline.json'), 'utf8'));
const name = process.argv[2] || 'master-desktop';
const spec = t.outputs[name];
const dir = path.join(OUT, 'probe', name);
fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
const phone = spec.frame === 'phone';
const scale = phone ? '-1:360' : '320:-1';
const files = [];
spec.clips.forEach((c, i) => {
  if (!c.src) return;
  const src = path.join(OUT, 'raw', `${c.src}-${spec.frame}.webm`);
  for (const [tag, at] of [['in', c.in], ['out', Math.max(0, c.out - 0.15)]]) {
    const f = path.join(dir, `${String(i).padStart(2, '0')}-${tag}.png`);
    const r = spawnSync(FF, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(at), '-i', src, '-frames:v', '1', '-vf', `scale=${scale}`, f]);
    if (r.status === 0) files.push(f); else console.log('probe failed', c.src, tag, String(r.stderr));
  }
});
const cols = phone ? 8 : 6;
const w = phone ? 203 : 320, h = phone ? 360 : 180;
const layout = files.map((_, i) => `${(i % cols) * w}_${Math.floor(i / cols) * h}`).join('|');
const inputs = files.flatMap((f) => ['-i', f]);
const out = path.join(OUT, 'probe', `${name}.png`);
const r = spawnSync(FF, ['-hide_banner', '-loglevel', 'error', '-y', ...inputs, '-filter_complex', `${files.map((_, i) => `[${i}]`).join('')}xstack=inputs=${files.length}:layout=${layout}:fill=black`, out]);
console.log(r.status === 0 ? `wrote ${out} (${files.length} frames, ${cols} per row, in/out pairs in order)` : String(r.stderr));
