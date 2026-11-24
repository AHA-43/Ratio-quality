"""Resolve each branch's Google Maps link to coordinates. Prints: ID|lat|lng|method  (run where Google is reachable)."""
import json, re, sys, subprocess
branches = json.load(open(sys.argv[1], encoding='utf-8'))
pat = [re.compile(r'!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)'), re.compile(r'@(-?\d+\.\d+),(-?\d+\.\d+)'), re.compile(r'[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)'), re.compile(r'center=(-?\d+\.\d+)%2C(-?\d+\.\d+)')]
for b in branches:
    url = (b.get('mapUrl') or '').strip()
    if not url.startswith('http'):
        print(f"{b['id']}|||no-url"); continue
    try:
        out = subprocess.run(['curl', '-sL', '-m', '25', '-A', 'Mozilla/5.0', '-w', '\n__FINAL__%{url_effective}', url], capture_output=True, text=True, timeout=40).stdout
    except Exception:
        print(f"{b['id']}|||error"); continue
    final = out.rsplit('__FINAL__', 1)[-1]
    hit = None
    for src, name in ((final, 'url'), (out, 'body')):
        for p in pat:
            m = p.search(src)
            if m and 16 <= float(m.group(1)) <= 33 and 34 <= float(m.group(2)) <= 56: hit = (m.group(1), m.group(2), name); break
        if hit: break
    print(f"{b['id']}|{hit[0]}|{hit[1]}|{hit[2]}" if hit else f"{b['id']}|||unresolved")
