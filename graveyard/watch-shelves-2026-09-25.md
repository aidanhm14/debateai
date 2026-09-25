# Watch shelves, September 25, 2026

Replaced at Aidan’s request with a YouTube-style video library and a larger example-debate selection. The old masthead, external picks, static stills and explainer are preserved here for reference. Replay playback, clips and live rounds remain in watch.html.

```html
<div class="wrap">
  <header class="page-head">
    <div class="watch-masthead">
      <h1 class="page-title watch-home-title">Watch the debates.</h1>
      <div class="gallery-heading gallery-heading-youtube">
        <a class="gallery-return" href="/watch">&larr; All debates</a>
        <h1 class="page-title">YouTube debates.</h1>
        <p class="gallery-page-sub">All three picks, in one place.</p>
      </div>
      <div class="gallery-heading gallery-heading-debatable">
        <a class="gallery-return" href="/watch">&larr; All debates</a>
        <h1 class="page-title">Debatable debates.</h1>
        <p class="gallery-page-sub">Every published round and clip.</p>
      </div>
      <a class="watch-join" id="ctaDebate" href="/spar">Want to argue instead of watch? Join a live room.</a>
    </div>
    <div class="spectator-match-slot" data-da-pill-slot="end" hidden></div>
  </header>

  <!-- ── WATCH AND LEARN ─────────────────────────────────────────────
       Championship rounds hosted on YouTube by the organisations that
       ran them. Every card LINKS OUT rather than embedding, on purpose:
       an embed whose owner disabled embedding paints a dead black box on
       our highest-intent page, and an in-page player would imply a
       relationship with these organisations that we do not have. The
       wordmark and the per-card channel line carry the provenance.
       Titles, channels, motions, results and durations were all read off
       the videos themselves on 2026-09-02 -- do not add a card whose
       motion or result you have not checked, and keep the topics inside
       the site's content boundary. -->
  <section class="yt-sec" id="watch-learn">
    <div class="yt-head">
      <div>
        <h2 class="sec-title"><a class="gallery-title-link" href="/watch/youtube">YouTube debates</a></h2>
        <div class="sec-sub">Three picks from outside Debatable.</div>
      </div>
      <div class="yt-head-actions">
      <a class="gallery-open" href="/watch/youtube" aria-label="See the full YouTube debates gallery">See gallery <span aria-hidden="true">&rarr;</span></a>
      <span class="yt-badge">
        <span class="yt-mark" aria-hidden="true"><svg viewBox="0 0 24 28"><path fill="#fff" d="M8 5v18l14-9z"/></svg></span>
        On YouTube
      </span>
      </div>
    </div>
    <div class="watch-shelf">
    <div class="yt-grid" data-pan-shelf role="region" aria-label="YouTube debate picks. Scroll horizontally for more." tabindex="0">
      <a class="yt-card" href="https://www.youtube.com/watch?v=cwSXDr7XkNc" target="_blank" rel="noopener noreferrer">
        <span class="yt-thumb">
          <img src="https://i.ytimg.com/vi/cwSXDr7XkNc/hqdefault.jpg" alt="" loading="lazy" decoding="async" width="480" height="360">
          <span class="yt-play"><span><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" d="M8 5v14l11-7z"/></svg></span></span>
          <span class="yt-dur">1:43:36</span>
        </span>
        <div class="yt-body">
          <span class="yt-event">Jubilee · Surrounded</span>
          <h3>1 Capitalist vs 20 Anti-Capitalists</h3>
          <p class="yt-motion">Patrick Bet-David takes the middle seat and defends capitalism against twenty people who want it gone. One against a room, on the clock.</p>
          <div class="yt-foot"><span class="yt-chan">Jubilee</span><span aria-hidden="true">&middot;</span><span>4.5M views</span></div>
        </div>
      </a>
      <a class="yt-card" href="https://www.youtube.com/watch?v=ZJpD2TbCm8w" target="_blank" rel="noopener noreferrer">
        <span class="yt-thumb">
          <img src="https://i.ytimg.com/vi/ZJpD2TbCm8w/hqdefault.jpg" alt="" loading="lazy" decoding="async" width="480" height="360">
          <span class="yt-play"><span><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" d="M8 5v14l11-7z"/></svg></span></span>
          <span class="yt-dur">1:20:21</span>
        </span>
        <div class="yt-body">
          <span class="yt-event">Oxford Union</span>
          <h3>This House Would Cancel &lsquo;Cancel Culture&rsquo;</h3>
          <p class="yt-motion">A full chamber debate in the Oxford Union. Set-piece speeches, floor speeches, then the house divides and walks through the doors.</p>
          <div class="yt-foot"><span class="yt-chan">OxfordUnion</span><span aria-hidden="true">&middot;</span><span>Full debate</span></div>
        </div>
      </a>
      <a class="yt-card" href="https://www.youtube.com/watch?v=144uOfr4SYA" target="_blank" rel="noopener noreferrer">
        <span class="yt-thumb">
          <img src="https://i.ytimg.com/vi/144uOfr4SYA/hqdefault.jpg" alt="" loading="lazy" decoding="async" width="480" height="360">
          <span class="yt-play"><span><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" d="M8 5v14l11-7z"/></svg></span></span>
          <span class="yt-dur">1:47:19</span>
        </span>
        <div class="yt-body">
          <span class="yt-event">Munk Debate · Artificial Intelligence</span>
          <h3>Does AI pose an existential threat?</h3>
          <p class="yt-motion">Yoshua Bengio and Max Tegmark face Melanie Mitchell and Yann LeCun. The audience votes before and after, and the skeptical side moves the room three points.</p>
          <div class="yt-foot"><span class="yt-chan">Munk Debates</span><span aria-hidden="true">&middot;</span><span>Against won the swing</span></div>
        </div>
      </a>
    </div>
    <span class="watch-shelf-cue" aria-hidden="true"><span class="cue-scroll">Scroll</span><span class="cue-swipe">Swipe</span><b>&rarr;</b></span>
    </div>
    <p class="yt-note">Hosted on YouTube by the organisations that ran them. They open in a new tab. Debatable is not affiliated with them. <a href="/spar">Take a side yourself</a>.</p>
  </section>    <div class="watch-shelf">
    <div class="rail-list" id="replaysGrid" data-pan-shelf role="region" aria-label="Debatable debate replays. Scroll horizontally for more." tabindex="0">
      <div class="card still">
        <div class="thumb" aria-hidden="true">
          <img class="th-img" src="/assets/replays/76cda947-3a6c-4a53-ab22-55225681f45c.jpg" alt="" loading="lazy" decoding="async">
          <span class="th-tag">Round</span>
        </div>
        <div class="card-body">
          <h3>This House would make voting compulsory</h3>
          <div class="foot"><span>Mika I. vs Nia R.</span><span>Aug 18, 2026</span></div>
        </div>
      </div>
      <div class="card still">
        <div class="thumb" aria-hidden="true">
          <img class="th-img" src="/assets/replays/ae474fd4-ec1c-437d-b40c-198e4a811d7a.jpg" alt="" loading="lazy" decoding="async">
          <span class="th-tag">Round</span>
        </div>
        <div class="card-body">
          <h3>This House regrets the rise of social media</h3>
          <div class="foot"><span>Eli E. vs Sasha S.</span><span>Aug 18, 2026</span></div>
        </div>
      </div>
      <div class="card still">
        <div class="thumb" aria-hidden="true">
          <img class="th-img" src="/img/politics/capitol.jpg" alt="" loading="lazy" decoding="async">
          <span class="th-tag">Round</span>
        </div>
        <div class="card-body">
          <h3>This House would adopt universal basic income</h3>
          <div class="foot"><span>Benji R. vs Zoya K.</span><span>Aug 15, 2026</span></div>
        </div>
      </div>
      <div class="card still">
        <div class="thumb" aria-hidden="true">
          <img class="th-img" src="/assets/replays/1a35d7af-df86-4c08-81d4-72b3c2d68a29.jpg" alt="" loading="lazy" decoding="async">
          <span class="th-tag">Round</span>
        </div>
        <div class="card-body">
          <h3>This House would ban single-use plastics outright</h3>
          <div class="foot"><span>Cleo A. vs Wade G.</span><span>Aug 15, 2026</span></div>
        </div>
      </div>
    </div>
    <span class="watch-shelf-cue" aria-hidden="true"><span class="cue-scroll">Scroll</span><span class="cue-swipe">Swipe</span><b>&rarr;</b></span>
    </div>
  <!-- Three open beats replace the old five-section explainer. The
       deeper answers remain plain HTML inside the drawer below. -->
  <section class="watch-basics" id="how-to-watch">
    <div class="basics-head">
      <span class="basics-kicker">One round</span>
      <h2>Choose a round to watch.</h2>
    </div>
    <ol class="basics-grid">
      <li><b>Choose</b><span>Open a <a href="/live">live room</a> or pick a replay. The question and running time are up front.</span></li>
      <li><b>Watch</b><span>Watch both people speak and follow the round clock.</span></li>
      <li><b>Read the result</b><span>The judge's written decision tells you who won and why.</span></li>
    </ol>
  </section>


```
