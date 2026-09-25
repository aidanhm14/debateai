// Static cards keep the full library crawlable and usable before JavaScript loads.
// Edit scripts/data/watch-library.json, verify its sources, then run this file.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const cards = JSON.parse(fs.readFileSync(root + 'scripts/data/watch-library.json', 'utf8'));
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const duration = s => s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const ids = new Set();
const html = cards.map((c, i) => {
  if (!/^[\w-]{11}$/.test(c.id) || ids.has(c.id) || !(c.duration > 0)) throw new Error('Invalid or duplicate video: ' + c.id);
  ids.add(c.id);
  const time = duration(c.duration);
  return `      <a class="yt-card" href="https://www.youtube.com/watch?v=${c.id}" target="_blank" rel="noopener noreferrer" data-topic="${esc(c.topic)}" data-duration="${c.duration}" data-channel="${esc(c.channel)}" data-collection="${esc(c.collection)}" aria-label="${esc(c.title)}${/[.!?]$/.test(c.title) ? '' : '.'} ${esc(c.channel)}. ${time}. Watch on YouTube, opens in a new tab.">
        <span class="yt-thumb">
          <img src="https://i.ytimg.com/vi/${c.id}/hqdefault.jpg" alt="" loading="${i < 3 ? 'eager' : 'lazy'}" decoding="async" width="480" height="360">
          <span class="yt-kind">${esc(c.kind)}</span><span class="yt-play" aria-hidden="true">▶</span><span class="yt-dur">${time}</span>
          <span class="yt-open" aria-hidden="true">Watch on YouTube ↗</span>
        </span>
        <div class="yt-body"><span class="channel-mark ${esc(c.tone)}" aria-hidden="true">${esc(c.mark)}</span><div class="yt-copy">
          <h3>${esc(c.title)}</h3><p class="yt-channel">${esc(c.channel)}</p><p class="yt-description">${esc(c.description)}</p>
        </div></div>
      </a>`;
}).join('\n');
const file = root + 'app/watch.html';
const current = fs.readFileSync(file, 'utf8');
const next = current.replace(/    <!-- WATCH_LIBRARY_START -->[\s\S]*?    <!-- WATCH_LIBRARY_END -->/, `    <!-- WATCH_LIBRARY_START -->\n    <div class="yt-grid" id="examplesGrid">\n${html}\n    </div>\n    <!-- WATCH_LIBRARY_END -->`);
if (!current.includes('<!-- WATCH_LIBRARY_START -->')) throw new Error('Watch library markers missing');
if (process.argv.includes('--check')) {
  if (next !== current) throw new Error('Run node scripts/build-watch-library.mjs to update the cards');
} else fs.writeFileSync(file, next);
console.log(`Watch library: ${cards.length} verified entries.`);
