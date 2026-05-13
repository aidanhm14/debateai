/* community-seed.js
 *
 * Backfills /leaderboard so a brand-new visitor doesn't see a one-row
 * board. Sizing tuned to "early app with a real community forming"
 * (~30 live + ~18 ai), not "fully populated production board"
 * (~160+) — the lower number reads as authentic growth instead of
 * social-proof theater.
 *
 * Names are handle-style usernames: lowercase, sometimes
 * underscored, occasionally numbered, debate-coded vocabulary mixed
 * with generic handles. A real signed-in user shows up as "First L."
 * (derived from their Google displayName), but power users on debate
 * platforms typically pick their own handle if the surface allows it,
 * and we want the seeds to feel like the latter, not like everyone
 * defaulted to a Google sign-in.
 *
 * Each seed carries seed:true + a 'da-seed-*' uid prefix. Real
 * Firestore entries always merge in on top — seeds fill the long tail.
 */
(function(){
  'use strict';

  const SEED_VERSION = 3;

  // Handle pool. Mix of:
  //   - debate-coded handles (parli, flow, 1ar, condo, k, etc.)
  //   - generic short handles (mango42, klondike)
  //   - lowercase first names (aarav, meera) — what a user gets if
  //     they only typed a first name into the Google account form
  //   - a few First-Lastinitial entries to keep variety realistic
  // No emoji, no special chars beyond _ . and digits — real platforms
  // strip those, and so do we for visual hygiene.
  const HANDLES = [
    // debate-coded
    'parli_kid','bp_overhang','apdacrustaceans','pfdrops','kshell','theory_pls',
    'flow_rat','flowingok','tab_judge_no','1ar_collapse','2nr_god','dropthecase',
    'mgextension','whip_only','topicality_dad','condo_good','extend_pls',
    'octas_or_bust','bidkid','wsdcbound','prelim_quad','linkturn','mgowned',
    'judgeparadigm','impact_calc','warrant_dropper','frontlinekid','spreader',
    // generic short handles
    'mango42','zenith23','nightshift_','darkbluepen','quietkid','purplehaze',
    'tundra','ringo07','klondike','merlot','cinnabar','slowburn','hibachi',
    'ferrum','aux_8','octalpha','sevenup','riverbend','ploughshare',
    // lowercase first names
    'aarav','priya','meera','tarun','diya','connor','niharika','sara',
    'pranav','rohan','akhil','olivia','sebastian','vihaan',
    // occasional First L. for variety (matches what real Google sign-in produces)
    'Aarav K.','Madison T.','Connor B.','Anjali R.','Hassan A.',
    // edge cases — real boards have these too
    'Anonymous','coach','?','vivek','x_x','newkid',
  ];

  // Format mix tuned to where Debate AI traffic actually competes.
  // Asian Parli + BP up top because the India-heavy circuit runs those.
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
  // (until SEED_VERSION bumps); a daily key produces a small refresh
  // in scores + timestamps so the board doesn't feel statue-still.
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

  function dayKey(){
    const d=new Date();
    return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate();
  }

  // Score curve — kept similar to v2 but with shallower falloff since
  // there are fewer rows. Top is rare, mid-board is dense, the floor is
  // well above 25.
  function scoreForRank(rank){
    if(rank<3)  return 29.4 - rank*0.18;            // 29.4 / 29.22 / 29.04
    if(rank<10) return 28.9 - (rank-3)*0.10;        // 28.9..28.2
    if(rank<20) return 28.1 - (rank-10)*0.06;       // 28.1..27.5
    if(rank<35) return 27.4 - (rank-20)*0.05;       // 27.4..26.7
    return 26.7 - (rank-35)*0.04;                    // long tail
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

  function tsLike(date){
    return { toDate(){ return date; } };
  }

  function buildPersona(index, view, day){
    const stableSeed='da-seed-'+SEED_VERSION+'-'+index;
    const rs=prng(stableSeed);
    const handle=pick(HANDLES,rs);
    const format=pickWeighted(FORMAT_BANK,FORMAT_TOTAL_W,rs);

    const dailySeed=stableSeed+'@'+day+'@'+view;
    const rd=prng(dailySeed);
    const base=scoreForRank(index);
    const jitter=(rd()-0.5)*0.45;
    const score=Math.max(25.4,Math.min(29.85,base+jitter));

    const ageMin=ageMinutesFor(rd);
    const completedAt=tsLike(new Date(Date.now()-ageMin*60*1000));

    // Live tab: ~55% have W badge. AI tab: all wins (the tab requires it).
    const isWin = view==='ai' ? true : rd()<0.55;

    return {
      uid: stableSeed,
      displayName: handle,
      score: Number(score.toFixed(1)),
      won: isWin,
      // Voice-only leaderboard rule (2026-05-13): the solo-vs-AI tab
      // now reads kind:'voice' only. Seeds match so the seed pool
      // doesn't render as "empty" the moment the filter changes.
      // 'live' seeds are untouched — live human-vs-human is already
      // voice-native.
      kind: view==='ai' ? 'voice' : 'live',
      format: format.slug,
      formatName: format.name,
      completedAt,
      seed: true,
      seedV: SEED_VERSION,
    };
  }

  // Pool sizes deliberately reduced (was 160 / 130 in v2). Reads as
  // "real growing community" rather than "fully seeded production."
  function buildPool(view){
    const day=dayKey();
    const size = view==='ai' ? 18 : 30;
    const out=[];
    for(let i=0;i<size;i++){
      out.push(buildPersona(i, view, day));
    }
    return out;
  }

  // Once real activity reaches this many entries on a given view, seeds
  // retreat completely and the board is real-only. Tunable per call via
  // opts.floorThreshold (set to 0 to always include seeds; set to a huge
  // number to force seed-only mode forever).
  const FLOOR_THRESHOLD = 30;

  function merge(realRows, view, opts){
    const limit=(opts&&opts.limit)||100;
    const real=Array.isArray(realRows) ? realRows : [];
    const threshold=(opts&&typeof opts.floorThreshold==='number')
      ? opts.floorThreshold : FLOOR_THRESHOLD;
    // Seed-floor: once real activity outgrows the seed bank, seeds go
    // quiet entirely. Real entries carry the page on their own and the
    // seeds stop being a tell.
    if (threshold > 0 && real.length >= threshold){
      return real.slice(0, limit);
    }
    const seeds=buildPool(view);
    const all=real.concat(seeds);
    all.sort((a,b)=>{
      const s=(b.score||0)-(a.score||0);
      if(s!==0) return s;
      const ad=a.completedAt&&a.completedAt.toDate?a.completedAt.toDate().getTime():0;
      const bd=b.completedAt&&b.completedAt.toDate?b.completedAt.toDate().getTime():0;
      return bd-ad;
    });
    return all.slice(0,limit);
  }

  window.DEBATEAI_SEED = {
    version: SEED_VERSION,
    merge,
    buildPool,
  };
})();
