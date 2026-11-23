# Ratio Quality — progress notes

Live: https://ratio-quality.web.app — auto-deployed by GitHub Actions on every push to this branch.
CI gate: unit tests (scoring, checklist, Excel export) + Firestore security-rules tests on the emulator.

## Implemented
- Official 46-item checklist (PDF), versioned (`official-pdf-v1`); severity fixed by the checklist (not editable per answer).
- Scoring: weights 10/5/1, N/A excluded, any failed Critical ⇒ غير مقبول, classification on unrounded value.
- Branch master (136; 120 active), searchable by name/code; branch code saved on each inspection.
- Firebase Auth (invite-only), Firestore sync (offline-first via Dexie), photo upload to Storage (when enabled).
- Roles: admin / quality_manager / inspector + per-user "can approve". Project owner (earliest account) is set to admin by CI. Users page to manage roles.
- Workflow: Draft → Submitted → Approved, with "return for correction" (reason recorded). Approved reports locked server-side (rules) with SHA-256 snapshot hash.
- Sequential inspection numbers RQ-YYYY-NNNNN (transactional counter; offline drafts get LOCAL-… until online).
- Electronic signatures: inspector + branch representative (or recorded reason if unable). Captures name, time, signature image. Not a certified legal signature.
- Previous-visit card when choosing a branch; recurring-finding detection by question ID + branch (inspector confirms).
- Tasting sub-scores 1–5 (Q27–31), informational only.
- Corrective actions: statuses incl. مُسند, derived "overdue", default deadlines 24h/72h/7d by severity, change history, closure verification by quality leads only (enforced in rules), link to equipment.
- Barista individual evaluations (Q37–46) per inspection, multiple baristas, history/trend, repeated skill gaps ⇒ training recommendation. Visible to evaluator + quality leads only (rules).
- Equipment registry with maintenance log and maintenance requests.
- Analytics dashboard with filters (date, branch, section, severity, inspector); excludes non-official checklist versions.
- Exports from the saved record: PDF (print), Excel (4 sheets, filterable), PowerPoint (branded, per-finding slides, action plan, signatures). Share sheet on phones; ready-made Arabic email draft (mailto).
- Append-only audit log (submit, approve, return, action changes, exports, user changes).

## Defaults assumed (change if wrong)
- Branch-score uses the inspection's own Section 4 answers; individual barista scores are separate and do not change it.
- Deadline clock starts when the action is created. Recurring = failed at the previous submitted/approved visit of the same branch.
- A failure corrected during the visit stays a failure in the score.

## Still needs the owner
- Blaze plan + enable Storage (photos to cloud). Server-side email sending and the AI writing assistant need Cloud Functions (Blaze) and a chosen provider.
- Licensed fonts (TT Fors, Volt Arabic). Decision on the 30 flagged branch rows. Retention period.
- Make the repository private again.

## Deferred (future roadmap)
Calendar scheduling, automatic assignments, QR check-in, predictive analytics, branch-manager portal.
