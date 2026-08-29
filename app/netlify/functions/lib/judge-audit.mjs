// ─────────────────────────────────────────────────────────────
// THE AUDIT RECORD — one immutable document per ballot.
//
// Fix 5. Perkins Coie's read of Papaya was to preserve the records that
// show the compliance rationale, because a regulator or a plaintiff
// will subpoena the model config. That is not a thing you can go and
// reconstruct after the fact: either the configuration was written down
// at the moment the verdict was issued, or it was not.
//
// So every ballot writes `judge_audit/{judgmentId}` carrying the season,
// the rubric version AND its hash, every juror's provider and model id,
// whether each model was the pinned one or an override, the raw votes,
// the panel outcome, a hash of the exact prompt each juror received,
// and the failures. Public read, server write only.
//
// NEVER UPDATED IN PLACE. Same posture as the credit ledger and the
// judgments collection: a correction is an appended revision, so the
// document cannot be quietly improved after someone complains about it.
// `writeAudit` is a create-if-absent transaction rather than a set, and
// the appeal path appends to the `revisions` subcollection.
//
// WHAT IS DELIBERATELY NOT STORED
// The full prompt text. It is tens of thousands of characters of
// adjudication core per juror per round, it is identical across every
// round in a season, and storing it per round would be a large cost for
// no evidentiary gain. The rubric hash pins the criteria, the prompt
// hash proves the jurors got identical input, and the transcript
// already lives on the round document. Those three together reproduce
// the input; a copy of the same 60KB block on every audit row does not
// add anything a subpoena could use.
// ─────────────────────────────────────────────────────────────
import { rubricHash } from './judge-charter.mjs';

export const AUDIT_COLLECTION = 'judge_audit';

// Strip a juror result down to what belongs in a permanent record.
// A vote is kept whether it agreed or not: the dissents are the most
// valuable rows in here.
function auditJuror(result, pinnedModel) {
  const j = {
    jurorId: result.jurorId || '',
    provider: result.provider || '',
    model: result.model || '',
    promptHash: result.promptHash || '',
    ok: !!result.ok,
    ms: Number(result.ms) || 0,
  };
  // Disclosed override. The charter allows running a model other than
  // the pin during an outage; it does not allow doing so quietly, and
  // this field is what makes that true.
  if (pinnedModel && result.model && result.model !== pinnedModel) {
    j.pinnedModel = pinnedModel;
    j.overridden = true;
  }
  if (result.ok && result.ballot) {
    j.vote = {
      winner: result.ballot.winner || null,
      propPoints: numOrNull(result.ballot.propPoints),
      oppPoints: numOrNull(result.ballot.oppPoints),
    };
    j.rfd = String(result.ballot.rfd || '').slice(0, 1200);
  } else if (!result.ok) {
    j.error = String(result.error || '').slice(0, 200);
  }
  return j;
}

function numOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Build the record. Pure, so the test script can assert the shape
// without a Firestore connection.
export function auditRecord({
  judgmentId, source, eventId, season, jurorResults, panel, motion, format, clashMapUsed, now,
}) {
  const pinned = new Map();
  const seasonJurors = (season && season.panel && season.panel.jurors) || [];
  for (const j of seasonJurors) pinned.set(j.id, j.model);
  // The disclosed single-judge fallback is an Anthropic seat named
  // `single`, not the season's `j1`. Map it back to the pinned primary so
  // an outage model override is stamped on the permanent record. Without
  // this, the public charter could announce an override while the ballot
  // audit quietly claimed no pin existed for that call.
  const primary = seasonJurors[0];
  if (primary && primary.provider === 'anthropic') pinned.set('single', primary.model);

  const jurors = (jurorResults || []).map((r) => auditJuror(r, pinned.get(r.jurorId)));
  const promptHashes = [...new Set(jurors.map((j) => j.promptHash).filter(Boolean))];

  return {
    id: judgmentId,
    judgmentId,
    source,
    eventId,
    judgeType: 'ai-panel',

    // What governed the decision.
    seasonId: season ? season.id : '',
    rubricVersion: season ? season.rubricVersion : '',
    rubricHash: season ? rubricHash(season.rubricVersion) : '',
    rubricPublished: !!(season && season.published),

    // Who decided it.
    jurors,
    // One distinct hash means every juror saw byte-identical input,
    // which is what makes their disagreement attributable to the models
    // rather than to the prompt. More than one is a defect worth
    // seeing in the record.
    promptHashes,
    identicalPrompts: promptHashes.length === 1,

    // How it came out, including the disagreement.
    panel: panel || null,

    motion: String(motion || '').slice(0, 500),
    format: String(format || '').slice(0, 40),
    clashMapUsed: !!clashMapUsed,

    // Appeal state mirrors onto the audit row so the public record of a
    // decision and the public record of its review sit together.
    appealState: 'none',
    revisionCount: 0,

    createdAt: now || Date.now(),
  };
}

// Write once. A second write for the same judgment is a no-op rather
// than an overwrite, matching recordJudgment: an audit row is a
// historical fact about a moment, not a mutable view of current state.
export async function writeAudit(db, record) {
  const ref = db.collection(AUDIT_COLLECTION).doc(record.id);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return { written: false, reason: 'already_recorded' };
    tx.set(ref, record);
    return { written: true };
  });
}

// Append a revision. The only way an audit row's story changes.
// `kind` is 'appeal_filed' | 'appeal_resolved' | 'settlement_reversed'.
export async function appendRevision(db, judgmentId, revision) {
  const ref = db.collection(AUDIT_COLLECTION).doc(judgmentId);
  const revRef = ref.collection('revisions').doc();
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    tx.set(revRef, { ...revision, judgmentId, at: revision.at || Date.now() });
    if (snap.exists) {
      const cur = snap.data();
      tx.update(ref, {
        revisionCount: (Number(cur.revisionCount) || 0) + 1,
        ...(revision.appealState ? { appealState: revision.appealState } : {}),
      });
    }
  });
  return { appended: true };
}
