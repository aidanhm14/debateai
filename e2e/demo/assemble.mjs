// Cuts the recorded segments into finished mp4s from demo/timeline.json.
//
//   node demo/assemble.mjs            # every output in the timeline
//   node demo/assemble.mjs master     # one output by name
//
// Each output is a list of clips. A clip is either a card (a PNG from
// cards.mjs held for `dur` seconds) or a trimmed segment recording with
// captions faded in and out over it. Clips are rendered to intermediates
// and concatenated with hard cuts; the title fades in and the end card
// fades out. Everything is H.264 yuv420p at 30fps so it plays everywhere.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'out');
const FFMPEG = process.env.FFMPEG || '/Applications/Plaud.app/Contents/Resources/ffmpeg';
const FRAMES = { desktop: { w: 1920, h: 1080 }, phone: { w: 1080, h: 1920 } };

function ff(args, label) {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8' });
  if (r.status !== 0) { console.error(`[ffmpeg] ${label} failed\n${r.stderr}`); process.exit(1); }
}
function duration(file) {
  const r = spawnSync(FFMPEG, ['-i', file], { encoding: 'utf8' });
  const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(r.stderr || '');
  return m ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) : 0;
}
const enc = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '30', '-vsync', 'cfr', '-movflags', '+faststart', '-an'];

function renderClip(clip, frame, i, dir) {
  const f = FRAMES[frame];
  const outFile = path.join(dir, `${String(i).padStart(2, '0')}.mp4`);
  if (clip.card) {
    const png = path.join(OUT, 'cards', `${clip.card}-${frame}.png`);
    const vf = [`scale=${f.w}:${f.h}`, 'format=yuv420p'];
    if (clip.fadeIn) vf.push(`fade=t=in:st=0:d=${clip.fadeIn}`);
    if (clip.fadeOut) vf.push(`fade=t=out:st=${(clip.dur - clip.fadeOut).toFixed(2)}:d=${clip.fadeOut}`);
    ff(['-loop', '1', '-framerate', '30', '-t', String(clip.dur), '-i', png, '-vf', vf.join(','), ...enc, outFile], `card ${clip.card}`);
    return { file: outFile, dur: clip.dur };
  }
  const src = path.join(OUT, 'raw', `${clip.src}-${frame}.webm`);
  const total = duration(src);
  const inT = Math.max(0, clip.in || 0);
  const outT = Math.min(total, clip.out || total);
  const dur = outT - inT;
  if (dur <= 0.2) { console.error(`clip ${clip.src} has no length (${inT} -> ${outT} of ${total})`); process.exit(1); }
  const args = ['-ss', inT.toFixed(3), '-t', dur.toFixed(3), '-i', src];
  const caps = (clip.caps || []).filter((c) => fs.existsSync(path.join(OUT, 'cards', `${c.id}-${frame}.png`)));
  for (const c of caps) args.push('-loop', '1', '-framerate', '30', '-t', dur.toFixed(3), '-i', path.join(OUT, 'cards', `${c.id}-${frame}.png`));
  const parts = [`[0:v]setpts=PTS-STARTPTS,scale=${f.w}:${f.h}:flags=lanczos,format=yuv420p[v0]`];
  let last = 'v0';
  caps.forEach((c, k) => {
    const at = c.at || 0, len = c.dur || 3.5, fd = 0.22;
    parts.push(`[${k + 1}:v]format=rgba,fade=t=in:st=${at.toFixed(2)}:d=${fd}:alpha=1,fade=t=out:st=${(at + len - fd).toFixed(2)}:d=${fd}:alpha=1[c${k}]`);
    parts.push(`[${last}][c${k}]overlay=0:0:format=auto[v${k + 1}]`);
    last = `v${k + 1}`;
  });
  if (clip.fadeIn) { parts.push(`[${last}]fade=t=in:st=0:d=${clip.fadeIn}[vf]`); last = 'vf'; }
  if (clip.fadeOut) { parts.push(`[${last}]fade=t=out:st=${(dur - clip.fadeOut).toFixed(2)}:d=${clip.fadeOut}[vg]`); last = 'vg'; }
  ff([...args, '-filter_complex', parts.join(';'), '-map', `[${last}]`, ...enc, outFile], `clip ${clip.src}`);
  return { file: outFile, dur };
}

const timeline = JSON.parse(fs.readFileSync(path.join(HERE, 'timeline.json'), 'utf8'));
const only = process.argv[2];
fs.mkdirSync(path.join(OUT, 'final'), { recursive: true });
for (const [name, spec] of Object.entries(timeline.outputs)) {
  if (only && only !== name) continue;
  const dir = path.join(OUT, 'build', name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const made = spec.clips.map((c, i) => renderClip(c, spec.frame, i, dir));
  const list = path.join(dir, 'list.txt');
  fs.writeFileSync(list, made.map((m) => `file '${m.file}'`).join('\n') + '\n');
  const final = path.join(OUT, 'final', `${name}.mp4`);
  ff(['-f', 'concat', '-safe', '0', '-i', list, '-c:v', 'libx264', '-preset', 'slow', '-crf', String(spec.crf || 20), '-pix_fmt', 'yuv420p', '-r', '30', '-movflags', '+faststart', '-an', final], `concat ${name}`);
  const total = made.reduce((a, m) => a + m.dur, 0);
  const size = (fs.statSync(final).size / 1048576).toFixed(1);
  console.log(`${name}: ${total.toFixed(1)}s, ${size} MB -> ${path.relative(process.cwd(), final)}`);
  if (spec.poster) {
    const poster = path.join(OUT, 'final', `${name}-poster.jpg`);
    ff(['-ss', String(spec.poster), '-i', final, '-frames:v', '1', '-q:v', '3', poster], `poster ${name}`);
  }
}
