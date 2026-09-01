// Event-only Elo for a continuous tournament day.
//
// Everyone starts the event at 1500. The table is rebuilt from the stored
// pairing results on every tournament payload, so a corrected ballot repairs
// the ladder without a second mutable result ledger.

export const TOURNAMENT_ELO_START = 1500;
export const TOURNAMENT_ELO_K = 32;

// The disclosed camera-presence rating adjustment, stored per side on
// the pairing by tournament-ledger (govCamRating/oppCamRating) from the
// ballot's tournamentScoring.ratingAdjustment. Clamped to [-20, 0] on
// read so a forged or corrupted positive value can never BUY rating:
// camera on is the ceiling and it costs nothing. Director-entered
// results carry no camera data and read as 0. It applies after the Elo
// update and never touches the winner.
function camRating(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-20, Math.min(0, n));
}

function atMs(value) {
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  if (value && Number.isFinite(Number(value.seconds))) return Number(value.seconds) * 1000;
  return Number(value) || 0;
}

export function tournamentRatings(entries, rounds) {
  const ratings = new Map((entries || []).map((entry) => [
    String(entry.entryId),
    { rating: TOURNAMENT_ELO_START, games: 0 },
  ]));
  const games = [];

  (rounds || []).forEach((round, roundIndex) => {
    const order = atMs(round.createdAt) || atMs(round.pairedAt)
      || Number(round.seq || round.roundNo) || roundIndex;
    (Array.isArray(round.pairings) ? round.pairings : []).forEach((pairing, pairingIndex) => {
      if (!pairing || pairing.status !== 'complete' || !['gov', 'opp'].includes(pairing.winner)) return;
      if (!ratings.has(String(pairing.govEntry)) || !ratings.has(String(pairing.oppEntry))) return;
      games.push({
        order,
        key: String(round.key || roundIndex) + ':' + String(pairing.pairingId || pairingIndex),
        gov: String(pairing.govEntry),
        opp: String(pairing.oppEntry),
        winner: pairing.winner,
        govCam: camRating(pairing.govCamRating),
        oppCam: camRating(pairing.oppCamRating),
      });
    });
  });

  games.sort((a, b) => a.order - b.order || a.key.localeCompare(b.key));
  games.forEach((game) => {
    const gov = ratings.get(game.gov);
    const opp = ratings.get(game.opp);
    const govExpected = 1 / (1 + Math.pow(10, (opp.rating - gov.rating) / 400));
    const govScore = game.winner === 'gov' ? 1 : 0;
    const delta = TOURNAMENT_ELO_K * (govScore - govExpected);
    gov.rating += delta;
    opp.rating -= delta;
    // Camera-presence adjustment, after the Elo update. Not zero-sum on
    // purpose: an avatar round burns the avatar user's rating without
    // paying their opponent, so nobody profits from someone else's
    // camera choice.
    gov.rating += game.govCam;
    opp.rating += game.oppCam;
    gov.games += 1;
    opp.games += 1;
  });

  return ratings;
}
