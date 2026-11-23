# Ratio Quality — progress notes

## Done in this pass (no cloud, no email, no deploy)
- Checklist rebuilt from the official 46-question PDF: exact order, titles, severities (4 Critical / 32 Major / 10 Minor, total weight 210) and units. Only the two standards printed in the PDF are pre-filled (Q11 3–5 °C, Q12 90–150 ppm); everything else is "to be set from approved recipes".
- Old provisional checklist saved on devices is replaced (`CHECKLIST_VERSION`); finalized inspections keep their own snapshots.
- Scoring: classification uses the unrounded score (188/209 no longer shows as Excellent). Tests for structure, severities and 90/80/70 boundaries.
- Corrective actions can no longer cycle Closed → Open.
- Build no longer requires `PORT`/`BASE_PATH`; theme colour is brand navy `#07014F`.
- `branches.master.json` (136 branches) generated from the approved workbook with every data problem flagged, not fixed: see `branch-import-report.md`.

## Defaults I assumed (change if wrong)
- N/A excluded from the denominator; a failure corrected during the visit stays a failure in the score.
- Tasting sub-scores (Q27–31: sweetness, acidity, body, balance, 1–5) are informational; constants exist, UI not yet wired.

## Still needs owner input before building
Corrective-action clock start, recurring-finding window, roles & barista data access, signature fallback, retention period, data region, email provider, AI provider, licensed fonts (TT Fors, Volt Arabic) and vector logos, branch status for the 30 flagged rows.
