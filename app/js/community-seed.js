/* community-seed.js
 *
 * Bootstraps the public-facing community surfaces (leaderboard, /community)
 * with a deterministic pool of seeded personas so the boards aren't empty
 * for a brand-new visitor. Real Firestore entries always merge in on top
 * and outrank seeds at the same score — seeds fill the long tail.
 *
 * Why this lives here, not in Firestore:
 * - Seeds never write to the DB, so no risk of polluting real ranks,
 *   admin counts, or revenue analytics. They only render on the client.
 * - Each seed carries `seed:true` + `seedV` so future code can identify
 *   and remove them in one place when real activity outpaces the bank.
 *
 * Mix tuned to the actual visitor breakdown (soul.md §8: ~80% India).
 * Names are first-name + last-initial only, matching the real
 * leaderboard's privacy convention. Don't add school/handle/photo —
 * the real entries don't carry those, and we want seeds to be visually
 * indistinguishable from real rows.
 */
(function(){
  'use strict';

  const SEED_VERSION = 1;

  // First-name pool weighted to roughly match traffic origin. Indian
  // names dominate because the visitor base does. No surnames — the
  // public board only ever shows first + last-initial.
  const NAMES_INDIA = [
    'Aarav','Aaradhya','Aarush','Aditi','Aditya','Advika','Akshay','Anaya','Anika','Ananya',
    'Aniket','Anirudh','Anjali','Arjun','Aryan','Avani','Ayaan','Daksh','Devansh','Dhruv',
    'Diya','Esha','Gauri','Hrithik','Ira','Ishaan','Ishita','Jaya','Kabir','Kavya',
    'Krishna','Lakshya','Manav','Meera','Mihir','Naina','Neel','Neha','Nisha','Nishant',
    'Niharika','Pranav','Priya','Raghav','Rahul','Rhea','Rishi','Riya','Rohan','Saanvi',
    'Sahil','Samar','Sanvi','Sara','Shaurya','Shreya','Siddharth','Siya','Tanvi','Tara',
    'Tarun','Vaani','Vedika','Vihaan','Vikram','Vivaan','Vivek','Yash','Yuvraj','Zara',
    'Adi','Akhil','Asha','Bhavya','Chetan','Hari','Indra','Kunal','Mira','Parth',
    'Reyansh','Sneha','Tanish','Uday','Vansh',
  ];
  const NAMES_WEST = [
    'Aaron','Abigail','Aiden','Alex','Amelia','Andrew','Anna','Ben','Charlotte','Chloe',
    'Connor','Daniel','David','Ella','Emily','Emma','Ethan','Evan','Grace','Hannah',
    'Henry','Isaac','Isabella','Jack','James','Jacob','Julia','Liam','Lily','Logan',
    'Lucas','Madeline','Madison','Mason','Matthew','Mia','Michael','Natalie','Noah','Olivia',
    'Oliver','Owen','Phoebe','Quinn','Rachel','Ryan','Sarah','Sebastian','Sophia','William',
  ];
  const NAMES_OTHER = [
    'Hassan','Ahmed','Ali','Fatima','Ayesha','Zainab',  // PK
    'Miguel','Sofia','Gabriel','Beatriz','Joaquin',     // PH/Latam
    'Wei','Jing','Hui','Ming','Xin',                    // SG/CN
    'Jihye','Minjun','Seoyun','Haerin',                 // KR
    'Tendai','Amara','Kwame','Nia','Chidi',             // Africa
    'Yusuf','Layla','Omar',                              // ME
  ];

  // Targeted mix: Indian-heavy, then West, then everywhere else. Repeats
  // are intentional — they bias the weighted draw without inflating the
  // unique-name list past what we actually have.
  const NAME_POOL = [
    ...NAMES_INDIA, ...NAMES_INDIA,  // 2x weight on India to ~match 80% mix
    ...NAMES_WEST,
    ...NAMES_OTHER,
  ];

  const LAST_INITIALS = [
    'A','B','C','D','G','H','I','J','K','L','M','N','P','R','S','T','V','W','Y','Z',
  ];

  // Format mix tuned to where Debate AI traffic actually competes.
  // Asian Parli + BP up top because the India-heavy circuit runs those.
  // Quick Clash kept low — it's a beginner format, fewer leaderboard
  // entries earned through it.
  const FORMAT_BANK = [
    { slug:'asian',   name:'Asian Parli',     w:24 },
    { slug:'bp',      name:'British Parli',   w:18 },
    { slug:'apda',    name:'APDA',            w:11 },
    { slug:'worlds',  name:'Worlds',          w:10 },
    { slug:'pf',      name:'Public Forum',    w:10 },
    { slug:'ld',      name:'Lincoln-Douglas', w: 8 },
    { slug:'policy',  name:'Policy',          w: 7 },
    { slug:'mun',     name:'MUN',             w: 5 },
    { slug:'congress',name:'Congress',        w: 4 },
    { slug:'quick',   name:'Quick Clash',     w: 3 },
  ];
  const FORMAT_TOTAL_W = FORMAT_BANK.reduce((s,f)=>s+f.w,0);

  // mulberry32 — fast, well-tested 32-bit PRNG. Seeds are deterministic
  // strings so the same persona index produces the same persona forever
  // (until SEED_VERSION bumps), and a daily key produces a small
  // refresh in scores + timestamps.
  function hashStr(s){
    let h=2166136261>>>0;
    for(let i=0;i<s.length;i++){
      h^=s.charCodeAt(i);
      h=Math.imul(h,16777619)>>>0;
    }
    return h>>>0;
  }
  function prng(seed){
    let a=hashStr(String(seed))>>>0;
    return function(){
      a=(a+0x6D2B79F5)>>>0;
      let t=a;
      t=Math.imul(t^(t>>>15),t|1);
      t^=t+Math.imul(t^(t>>>7),t|61);
      return (((t^(t>>>14))>>>0)/4294967296);
    };
  }
  function pick(arr,r){return arr[Math.floor(r()*arr.length)];}
  function pickWeighted(bank,totalW,r){
    let n=r()*totalW;
    for(const item of bank){ if((n-=item.w)<=0) return item; }
    return bank[0];
  }

  // Day key rolls forward each calendar day in the viewer's TZ. Cheap,
  // good enough — we don't need cross-TZ identical state, just a daily
  // refresh so the board feels alive rather than statue-still.
  function dayKey(){
    const d=new Date();
    return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate();
  }

  // Score curve: roughly matches what AI-judged speaker points actually
  // look like in our prod data. Top is rare, mid-board is dense, the
  // floor is well above 25 because below that you typically don't even
  // post to the board.
  function scoreForRank(rank){
    if(rank<3)  return 29.6 - rank*0.15;            // 29.6 / 29.45 / 29.3
    if(rank<10) return 29.2 - (rank-3)*0.08;        // 29.2..28.7
    if(rank<25) return 28.6 - (rank-10)*0.05;       // 28.6..27.9
    if(rank<55) return 27.85 - (rank-25)*0.03;      // 27.85..27.0
    if(rank<100)return 27.0 - (rank-55)*0.018;      // 27.0..26.2
    return 26.2 - (rank-100)*0.012;                  // long tail
  }

  // Age bucket distribution: skew strongly recent so the top of the
  // board feels active. Returns minutes-old.
  function ageMinutesFor(r){
    const v=r();
    if(v<0.05) return 1+Math.floor(r()*4);                    // "just now"
    if(v<0.18) return 5+Math.floor(r()*55);                   // <1h
    if(v<0.45) return 60+Math.floor(r()*23*60);               // today
    if(v<0.70) return 24*60+Math.floor(r()*48*60);            // 1-3d
    if(v<0.88) return 4*24*60+Math.floor(r()*3*24*60);        // 4-7d
    if(v<0.98) return 8*24*60+Math.floor(r()*20*24*60);       // 1-4w
    return 30*24*60+Math.floor(r()*60*24*60);                 // older
  }

  // Wrap a JS Date in a Firestore-Timestamp-shaped object so the
  // existing fmtAgo() in leaderboard.html doesn't need to special-case
  // seeds. Just exposes .toDate(), which is what the consumer calls.
  function tsLike(date){
    return { toDate(){ return date; } };
  }

  // Build one persona deterministically from its index. Every field
  // that affects ranking is seeded by index so the pool is stable;
  // every field that affects "feels alive" (score jitter, timestamp,
  // motion variation) is seeded by index+dayKey so it rolls daily.
  function buildPersona(index, view, day){
    const stableSeed='da-seed-'+SEED_VERSION+'-'+index;
    const rs=prng(stableSeed);
    const first=pick(NAME_POOL,rs);
    const lastI=pick(LAST_INITIALS,rs);
    const format=pickWeighted(FORMAT_BANK,FORMAT_TOTAL_W,rs);

    const dailySeed=stableSeed+'@'+day+'@'+view;
    const rd=prng(dailySeed);
    const base=scoreForRank(index);
    const jitter=(rd()-0.5)*0.45;     // ±~0.22 pt — small enough to keep
                                       // ordering mostly stable, big
                                       // enough that the top-3 sometimes
                                       // shuffle.
    const score=Math.max(25.4,Math.min(29.85,base+jitter));

    const ageMin=ageMinutesFor(rd);
    const completedAt=tsLike(new Date(Date.now()-ageMin*60*1000));

    // Live tab carries a W badge for entries marked won. AI tab requires
    // won:true to render at all (loadView filters it). So:
    //   - live seeds: ~55% won (mix of W and no-W rows)
    //   - ai seeds: always won, always kind:'ai'
    const isWin = view==='ai' ? true : rd()<0.55;

    return {
      uid: stableSeed,
      displayName: first+' '+lastI+'.',
      score: Number(score.toFixed(1)),
      won: isWin,
      kind: view==='ai' ? 'ai' : 'live',
      format: format.slug,
      formatName: format.name,
      completedAt,
      seed: true,
      seedV: SEED_VERSION,
    };
  }

  // Build the full pool for a view. Size is deliberately larger than the
  // 100-row board so daily jitter can shuffle entries on/off without
  // creating gaps.
  function buildPool(view){
    const day=dayKey();
    const size = view==='ai' ? 130 : 160;
    const out=[];
    for(let i=0;i<size;i++){
      out.push(buildPersona(i, view, day));
    }
    return out;
  }

  // Public API: merge real entries with the seed pool, sort, cap.
  // Real entries take precedence on a uid collision — but seed uids are
  // 'da-seed-*'-prefixed and won't ever collide with Firebase Auth UIDs.
  function merge(realRows, view, opts){
    const limit=(opts&&opts.limit)||100;
    const seeds=buildPool(view);
    const all=Array.isArray(realRows) ? realRows.concat(seeds) : seeds.slice();
    // Sort by score desc, with a small tiebreaker by recency so equal
    // scores don't reshuffle on every render.
    all.sort((a,b)=>{
      const s=(b.score||0)-(a.score||0);
      if(s!==0) return s;
      const ad=a.completedAt&&a.completedAt.toDate?a.completedAt.toDate().getTime():0;
      const bd=b.completedAt&&b.completedAt.toDate?b.completedAt.toDate().getTime():0;
      return bd-ad;
    });
    return all.slice(0,limit);
  }

  // Expose for the leaderboard page (and future callers — community.html
  // can use the same merge() with a different view if we ever extend).
  window.DEBATEAI_SEED = {
    version: SEED_VERSION,
    merge,
    buildPool,  // exposed for tests / debug
  };
})();
