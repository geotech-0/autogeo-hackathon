# Integration contract · 2026-09-21
React + TypeScript + Vite, Three.js, Lucide. Root owns package/lock, App, styles.css, contracts, storage, data common seeds, deployment and integrated documentation. Each agent owns only its assigned feature directories and work notes. No shared file edits without root agreement.

Each feature has default export in src/features/<domain>/<Name>Page.tsx: DesignPage, GroundPage, FieldPage, MaintenancePage. Props import FeatureProps from ../../contracts. No routing dependency. Root renders the page and supplies records, async onSave(draft), notify(message,tone).

ProjectRecordDraft requires stage/title/status/summary/payload. onSave supplies ID, timestamp, site/zone, synthetic source defaults, revision. Pass id to update existing record; preserve revision audit inside payload as appropriate. Avoid NaN/Infinity; keep numeric calculation input separate from source metadata. Use the shared IndexedDB adapter through onSave; don't create another database. Persistent in-progress form hook provided by root at ../../storage/useDraft.

Common CSS: .panel .panel-header .panel-title .muted .eyebrow .btn .btn-primary .btn-secondary .btn-ghost .badge .badge-success .badge-warning .badge-danger .field .field-grid .notice .notice-warning .notice-error .table-wrap .data-table .section-tabs .toolbar .empty-state. Feature-specific CSS goes in feature directory, selectors prefixed design-/ground-/field-/maintenance-. All charts require units, legend, raw-row correspondence. Default fixtures synthetic and consistent site A-01, local meters, footprint x0..120 y0..100. Source labels explicit. Do not ship real coordinates or report identifiers.

First actual component with fixture export within 60–90 minutes; grow incrementally. Send interface/dependency requests to root. UI must work at 1440/1024/390. Public assets must be intentionally allowlisted. No external runtime API.
