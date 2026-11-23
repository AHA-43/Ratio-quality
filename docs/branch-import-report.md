# Branch import validation report

Rows: 136 · active: 124 · needs-review: 1

Nothing was corrected silently. Rows below need an owner decision before production load.

| Excel row | Branch | Code | Flags |
|---|---|---|---|
| 6 | الاحساء - الاحساء مول | HAS.02 | has-closure-date-needs-status-confirmation, note-in-city-entry-column |
| 17 | الطائف- منتزه الردف | TIF.02 | has-closure-date-needs-status-confirmation |
| 19 | الرياض - ونتر لاند | RIY.03 | has-closure-date-needs-status-confirmation, branch-number-not-numeric |
| 27 | حائل - طريق الأمير عبدالمحسن بن سعود | HIL.01 | acquisition-text-unparsed |
| 29 | تبوك الجامعة - كلية الشريعة | TBK.04 | has-closure-date-needs-status-confirmation |
| 30 | تبوك الجامعة - كلية إدارة الأعمال | TBK.05 | has-closure-date-needs-status-confirmation |
| 34 | الاحساء - حي النسيم | HAS.05 | acquisition-text-unparsed |
| 39 | الرياض - حي قرطبة | RIY.04 | acquisition-text-unparsed |
| 43 | الرياض - تركي الأول | RIY.07 | has-closure-date-needs-status-confirmation |
| 47 | المدينة - قباء | MED.02 | has-closure-date-needs-status-confirmation |
| 48 | املج | UML.01 | opening-date-not-a-date |
| 51 | الرياض- حي التعاون | RIY.12 | has-closure-date-needs-status-confirmation |
| 55 | بيشة | BSH.01 | acquisition-text-unparsed |
| 59 | الأحساء- السلام | has.10 | code-case-normalized |
| 65 | الرياض - حي الربيع | RIY.13 | duplicate-code, has-closure-date-needs-status-confirmation, acquisition-text-unparsed |
| 69 | ينبع - شركة ياسرف | YNB.08 | has-closure-date-needs-status-confirmation, note-in-city-entry-column |
| 70 | الرياض-  أنس بن مالك | RIY.08 | has-closure-date-needs-status-confirmation |
| 89 | مطار الأحساء | B09 | note-in-city-entry-column |
| 98 | الدمام - عيادة الحقيل | DMM.04 | branch-number-not-numeric |
| 100 | الخبر- عيادة الحقيل | KHB.08 | branch-number-not-numeric |
| 101 | القطيف - محطة الخنيزي | QTF.02 | duplicate-code |
| 102 | الجبيل - الراجع | jub.02 | code-case-normalized |
| 110 | الرياض طويق | RIY.13 | duplicate-code |
| 111 | الاحساء - الكلية التقنية | — | missing-code |
| 132 | الخرج - درايف ثرو2 | KRJ.03 | no-opening-date |
| 133 | بيشة - ابها | BSH.04 | no-opening-date |
| 134 | القطيف- تاروت | QTF.02 | duplicate-code, no-opening-date |
| 135 | الخبر - ايفاء | KHB.11 | no-opening-date |
| 136 | مصر | — | missing-code, no-opening-date |
| 137 | حائل- | HIL.03 | no-opening-date |

## Decisions applied
- Rows with a closure date → **closed**: kept for historical reports, not offered for new visits.
- Rows without an opening date but with a branch code → **active** (treated as newly opening).
- `الاحساء - الكلية التقنية` (no code, has opening date) → active, identified internally by its Excel row.
- `مصر` (no code, no opening date, outside KSA) → hidden pending review.
- Duplicate codes (`RIY.13`, `QTF.02`) remain separate branches with internal IDs `ROW{n}`.
