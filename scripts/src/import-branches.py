"""Build branches.master.json from the approved branch workbook, without silently cleaning data.
Usage: python3 -I import-branches.py <input.xlsx> <output.json> <report.md>"""
import sys, json, datetime, collections, openpyxl

src, out, rep = sys.argv[1:4]
ws = openpyxl.load_workbook(src).active
rows = [(i, r) for i, r in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2) if r[0]]
codes = collections.Counter((r[1] or '').strip().upper() for _, r in rows if r[1])
branches, issues = [], []

def iso(v):
    return v.date().isoformat() if isinstance(v, datetime.datetime) else None

for n, r in rows:
    name = str(r[0]).strip()
    code_raw = (str(r[1]).strip() if r[1] else '')
    code = code_raw.upper()
    flags = []
    if not code: flags.append('missing-code')
    elif codes[code] > 1: flags.append('duplicate-code')
    if code_raw and code_raw != code: flags.append('code-case-normalized')
    opened = iso(r[4])
    if r[4] and not opened: flags.append('opening-date-not-a-date')
    if not r[4]: flags.append('no-opening-date')
    closed_raw = None if r[8] is None else str(r[8])
    if closed_raw: flags.append('has-closure-date-needs-status-confirmation')
    if r[10] and str(r[10]).strip() not in ('مدينة جديدة',): flags.append('note-in-city-entry-column')
    if r[9]: flags.append('acquisition-text-unparsed')
    if r[7] is not None and not isinstance(r[7], int): flags.append('branch-number-not-numeric')
    bid = code if code and 'duplicate-code' not in flags else f'ROW{n}'
    branches.append({
        'id': bid, 'code': code or None, 'nameAr': name, 'ownership': r[2], 'category': r[3],
        'openedAt': opened, 'openedAtRaw': None if opened or r[4] is None else str(r[4]),
        'closedAtRaw': closed_raw, 'branchNumber': r[7], 'acquisitionRaw': r[9], 'noteRaw': r[10],
        'mapUrl': r[5], 'phone': r[6],
        'status': 'needs-review' if closed_raw or not r[4] else 'active',
        'sourceRow': n, 'flags': flags,
    })
    if flags: issues.append((n, name, code_raw, flags))

json.dump(branches, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
with open(rep, 'w', encoding='utf-8') as f:
    f.write(f'# Branch import validation report\n\nRows: {len(branches)} · active: {sum(b["status"]=="active" for b in branches)} · needs-review: {sum(b["status"]=="needs-review" for b in branches)}\n\n')
    f.write('Nothing was corrected silently. Rows below need an owner decision before production load.\n\n| Excel row | Branch | Code | Flags |\n|---|---|---|---|\n')
    for n, name, c, fl in issues: f.write(f'| {n} | {name} | {c or "—"} | {", ".join(fl)} |\n')
print(len(branches), 'branches,', len(issues), 'flagged')
