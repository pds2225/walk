import hashlib, json, subprocess
from pathlib import Path

base = Path(r'D:\walk\.worktrees')
locations = json.loads((base / 'main-sync-inventory-20261005.json').read_text(encoding='utf-8-sig'))
records = []
for item in locations:
    root = Path(item['path'])
    candidates = set()
    for directory in [root, root / 'web']:
        for pattern in ['.env', '.env.*']:
            candidates.update(path for path in directory.glob(pattern) if path.is_file())
    for name in ['.streamlit/secrets.toml', '.vercel/project.json', 'web/.vercel/project.json', 'RESUME.md', 'SESSION_RECAP.md']:
        path = root / name
        if path.is_file():
            candidates.add(path)
    records.extend({'path': str(path), 'hash': hashlib.sha256(path.read_bytes()).hexdigest()} for path in sorted(candidates))
stashes = subprocess.check_output(['git', '-C', r'D:\walk', 'stash', 'list', '--format=%H'], text=True).splitlines()
payload = {'preservedFiles': records, 'stashes': stashes}
(base / 'main-sync-preservation-20261006.json').write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'locations': len(locations), 'protectedLocalFiles': len(records), 'stashes': len(stashes)}))
