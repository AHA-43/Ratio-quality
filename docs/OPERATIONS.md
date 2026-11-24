# Ratio Quality — operations, data protection and roadmap

## Data locations
| Data | Where | Notes |
|---|---|---|
| Inspections, branches, actions, equipment, baristas | Cloud Firestore (`ratio-quality`) + device cache (IndexedDB) | Drafts are written locally first and synced when online. |
| Barista evaluations | Firestore `baristaEvals` | Readable only by the evaluator and quality leads (rules). |
| Photos | Device until Storage is enabled; then Cloud Storage `evidence/{inspectionId}/` | Upload failures keep the photo locally and retry on next save. |
| Audit log | Firestore `audit` | Append-only; no update/delete allowed by rules. |
| Shared settings | Firestore `config/app` | Mandatory evidence + email recipient lists; quality leads only. |

## Access model
Invite-only accounts (no self sign-up). Roles: `admin`, `quality_manager`, `inspector`; per-user `canApprove`.
Enforced twice: in the UI and in `firestore.rules` (tested in CI on the emulator — a failing rule test blocks deployment).
Approved inspections cannot be modified or deleted by anyone through the app; each carries a SHA-256 hash of its content.

## Backup & recovery (recommended configuration — owner action in Google Cloud console)
1. Firestore → **Disaster recovery**: enable **Point-in-time recovery** (7-day window) and a **daily scheduled backup** with 14-week retention.
2. After enabling Storage: turn on **Object versioning** and a soft-delete window for the bucket.
3. Quarterly: restore the latest backup into a separate database and open a sample of approved reports to verify the hash matches.
4. Monthly: export the Excel report of all approved inspections as an offline archive.

## Retention (proposal — needs management approval)
- Approved inspections, signatures, audit log: keep **5 years**.
- Drafts never submitted: delete after **90 days**.
- Corrective actions: keep with their inspection.
- Barista evaluations: keep **2 years** after the employee leaves, then anonymise.
Deletion of approved records requires an admin action outside the app and is logged.

## Release process
Push to `claude/ratio-quality-requirements-pb9ouc` → GitHub Actions: install → unit tests → security-rules tests → build → deploy hosting → publish Firestore/Storage rules → invite users in `config/invites.txt` → ensure owner is admin.
To invite a user: add their email on a new line in `config/invites.txt` and push; they receive a "set your password" email.

## Known limitations
- Report emails are prepared on the phone (share sheet / mail app); automatic server-side sending, retries and sending history need Cloud Functions (Blaze plan) and an email provider.
- PDF is produced by the browser's print-to-PDF; a server-rendered PDF also needs Cloud Functions.
- The AI writing assistant is not implemented pending an approved data-handling design and provider.
- Electronic signatures are simple e-signatures (name, time, drawn image), not certified legal signatures.

## Deferred features (post-launch roadmap)
1. Calendar-based visit scheduling and assignment.
2. Automated visit assignments by region/inspector.
3. QR-code branch check-in.
4. Advanced / predictive analytics.
5. Branch-manager portal (v1 uses email only).
6. Server-side email delivery with history and retries; server-rendered PDF.
7. AI writing assistant (text-only suggestions with explicit acceptance; original and accepted text stored).

## Accessibility audit (axe-core)
Build with `vite build --mode shot`, run `vite preview --port 4181`, install `axe-core` in a scratch folder and inject `axe.min.js` on each page with Playwright (390×844), running tags wcag2a, wcag2aa, best-practice. Last result: 3 minor findings (two heading-order notes, one contrast on a decorative counter). Re-run after any colour change.

## Content-Security-Policy
`firebase.json` serves the policy as `Content-Security-Policy-Report-Only` (source of truth: `artifacts/ratio-quality/csp.txt`). The post-deploy smoke test fails if the browser logs any violation. When it has been green for a few deploys, rename the header to `Content-Security-Policy` to enforce. `CSP_TEST=1 vite preview` serves the enforced policy locally.

## Support
Settings → الدعم → «نسخ التشخيص» copies version, device, storage, pending uploads and the last 40 errors (no inspection data).
