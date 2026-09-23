# Corpus export index

The 2026-09-23 corpus audit found 15 records flagged `contributable:true`, but the manifest breakdown scanned zero records and the normal export failed because their composite Firestore index was missing. The unordered round export could read the flagged records. A zero breakdown therefore did not mean an empty corpus.

`app/firestore.indexes.json` now declares the required collection-scoped index on `generations`: `contributable ASCENDING`, then `createdAt ASCENDING`. This supports the unfiltered corpus export, manifest breakdown and nightly audit. Queries adding format or kind filters may need separate indexes.

The index creation was accepted through Firebase Console on 2026-09-23 and initially showed **Building**. At `2026-09-23T15:36:55.088Z`, the authenticated unfiltered export returned HTTP 200 with 15 JSONL records and the manifest reported `breakdownScanned:15`. Those successful indexed queries establish that the read path is working; the Console status for this specific index was not separately rechecked. Do not run the scheduled audit as a read-only check because it can quarantine records.

`firebase.json` points to this index file. A Netlify deployment alone does not deploy Firestore indexes. Index readiness restores the query only; it does not establish transcript completeness, consent receipts or eligibility for a benchmark shipment.
