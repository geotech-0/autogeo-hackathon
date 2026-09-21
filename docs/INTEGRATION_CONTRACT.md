# Integration contract · real-site revision · 2026-09-21

React + TypeScript + Vite, Three.js and Lucide. Root owns package/lock, App, common styles, contracts, storage, shared source policy, deployment and integration. Feature owners edit assigned directories; shared files require coordination.

Each feature exports its page from `src/features/<domain>/<Name>Page.tsx`. `FeatureProps` comes from `src/contracts`: `records`, asynchronous `onSave(draft)`, `notify(message,tone)`, and optional `requestedRecordId`. A requested record is restored once on entry or ID change; subsequent record updates must not overwrite an edited draft.

`ProjectRecordDraft` requires stage/title/status/summary/payload. `onSave` supplies identity, time and revision using the current real site (`icheon-xi-deriche`, zone `IC-EXC`); features explicitly preserve their source ID/revision and origin. Passing an existing ID creates a new revision. `calculated` describes a method and does not turn real source data into synthetic data. Reject nonfinite numeric values and retain conflicts/limitations in the payload.

Use the common IndexedDB adapter and `storage/useDraft`. The real-site database is `autogeo-icheon-v2`; the prior synthetic database remains separate. Common records, revisions, drafts and attachments support archive export/import. Do not create feature-specific databases. Keep attachment and source references valid across restore.

## Real-site spatial contract

- Frame: `icheon-local-m`; origin ENH `[239800, 521450, 0]`, metres. Absolute source E/N and observation elevations remain unchanged.
- Drone source CRS is EPSG:5186. Borehole CRS identification is not independently confirmed; preserve its original X/Y and the explicit E=Y, N=X mapping.
- Four survey campaigns, 32 distinct campaign-qualified borehole IDs and 96 variable intervals; unknown terminal boundaries remain unknown. Current real model defaults to the 2022-08 campaign. The fixed four-layer/120×100m synthetic contract is only a separate example.
- Shared `RealSiteMap` uses absolute E/N for holes, annotations and click callbacks. User registration operates about the common origin. DSM/LAS heights and older borehole collar elevations are different observations, not automatic settlement measurements.

## Source access and publication

`src/data/source-access.ts` defines `HAS_PROVIDED_ORIGINALS` and the common local-source notice. Default local mode can open the provided originals. A derived public candidate uses `VITE_SOURCE_ACCESS=derived`, omits original PDF/log/quality directories from `dist`, and replaces original-image requests with a local-source notice. Preserve real transcribed data, source page references and calculations.

Public assets must be allowlisted deliberately. Actual coordinates, measurements and imagery are now intentional **local candidate** assets; their external publication is still awaiting user confirmation. The existing public URL remains the older synthetic release. Never treat a successful local derived build as publication approval. `node scripts/build-derived.mjs` is the derived build entry point; do not remove local originals.

## UI and historical distinction

Use shared `.panel`, `.btn`, `.badge`, `.field`, `.notice`, `.data-table` and toolbar styles; prefix feature selectors. Charts need units, legend and raw-row correspondence. Verify 1440/1024/390 layouts and source/record restore. No external runtime API is required.

Historical initial contract: the first 60–90 minute integration used synthetic site A-01, a 120×100m local footprint and no real coordinates in the published bundle. That milestone is complete; it is not the current default data contract.
