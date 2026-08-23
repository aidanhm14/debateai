// ─────────────────────────────────────────────────────────────
// JUDGE ROSTER (server twin) — the rotating bench for general
// clash rounds, resolvable server-side so the ranked ballot path
// (/api/live-judge) applies the same judge the debaters were shown.
//
// SOURCE OF TRUTH PAIRING: app/js/judge-roster.js carries the full
// client roster (names, notes, display rows); this file carries only
// what the model needs (key, name, lens) plus the same FNV-1a draw.
// The two MUST stay in sync on keys, names, lens text, roster order,
// and the hash — scripts/test-judge-roster.mjs asserts all five.
// Order matters: the draw is (hash % length), so reordering either
// file reassigns every round's judge.
//
// This is presentation-plus-emphasis, not a second panel: the guard
// below rides every injection, and nothing here can name a winner,
// dictate points, or override deciding on the flow. Assignment is a
// pure function of the room id, so neither debater (nor the
// operator, short of a deploy) can steer a given round to a judge.
// ─────────────────────────────────────────────────────────────

export const PARADIGM_GUARD =
  'This judge paradigm shifts emphasis only. It may change what the ballot ' +
  'emphasises, what gets resolved first, and how hard particular mistakes are ' +
  'punished. It may NOT name a winner, dictate scores, override deciding on ' +
  'what was actually said, or invent a burden neither side accepted. When the ' +
  'paradigm and the record conflict, the record wins.';

export const ROSTER = [
  {
    key: "dean",
    name: "Warrant judge",
    lens:
      "Judge on stated reasoning. Reward arguments whose logic is explicit: claim, warrant, and why it matters. Never fill a logical gap on a speaker's behalf; if a key step was skipped, say exactly which one, on both sides. Give no credit for rhetorical polish that carries no reasoning.",
  },
  {
    key: "backrow",
    name: "Lay judge",
    lens:
      "Judge as an attentive, intelligent listener who has never seen competitive debate. Reward clear explanation and comparisons an outsider could repeat. Give no weight to jargon or technique that was never explained in plain terms. Do not vote on a technical point that was not made understandable.",
  },
  {
    key: "bookkeeper",
    name: "Impact judge",
    lens:
      "Judge on weighing. Resolve the round through explicit comparison: magnitude, probability, and timeframe. Reward speakers who compare their case against the other side's best case directly. Where neither side weighed, name the default you fell back on and say the debaters left it to you.",
  },
  {
    key: "umpire",
    name: "Flow judge",
    lens:
      "Judge strictly on the record of what was said, speech by speech. An argument that was extended and never answered counts once its significance was stated. Penalise final-speech mischaracterisation of earlier speeches, and give no weight to arguments introduced after the other side could answer them.",
  },
];

// FNV-1a, byte-identical to the client implementation.
export function hashSeed(str) {
  let h = 0x811c9dc5;
  str = String(str || '');
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function personaForRoom(room) {
  if (!room) return null;
  return ROSTER[hashSeed(room) % ROSTER.length];
}

// The block a ballot prompt carries. Mirrors the client's shape; the
// tab-room framing tells the model neither debater chose this.
export function assignedParadigmBlock(room, judgePicks) {
  // An agreed non-chair lens outranks the draw, same rule as the
  // client. judgePicks is the round doc's { pro, con } map; the lens
  // text itself lives client-side, so on the server path an agreed
  // lens simply suppresses the assigned persona rather than replacing
  // it (the client fallback path carries the lens text).
  const pro = judgePicks && judgePicks.pro;
  const con = judgePicks && judgePicks.con;
  if (pro && con && pro === con && pro !== 'chair') return '';
  const j = personaForRoom(room);
  if (!j) return '';
  return (
    `ASSIGNED JUDGE PARADIGM ("${j.name}") — assigned to this round the way a tab room assigns a judge; neither debater chose it, and both were shown it before the round started. Apply it as your evaluative posture ON TOP of the adjudication method above. Name the judge once in the RFD so the debaters can see who heard the round.\n` +
    `PARADIGM: ${j.lens}\n` +
    PARADIGM_GUARD
  );
}
