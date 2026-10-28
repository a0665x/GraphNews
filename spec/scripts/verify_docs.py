#!/usr/bin/env python3
"""Offline check of local Markdown links in spec; no network or DB access."""
from pathlib import Path
import re
import sys
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[2]
SPEC = ROOT / 'spec'
errors = []
files = sorted(SPEC.rglob('*.md'))
for path in files:
    for target in re.findall(r'\[[^\]]*\]\(([^)]+)\)', path.read_text()):
        target = target.strip().strip('<>')
        parsed = urlsplit(target)
        if parsed.scheme or target.startswith('#'):
            continue
        destination = (path.parent / unquote(parsed.path)).resolve()
        if not destination.exists():
            errors.append(f'{path.relative_to(ROOT)} -> {target}')
for required in ['PROJECT_MAP.md', 'ARCHITECTURE.md', 'RUNTIME.md', 'DATA_MODEL.md',
                 'UI.md', 'API.md', 'TESTING.md', 'SOURCES_AND_CACHE.md']:
    if not (SPEC / required).is_file():
        errors.append('Missing entry: ' + required)
if errors:
    print('\n'.join(errors), file=sys.stderr)
    sys.exit(1)
print(f'PASS: {len(files)} spec Markdown files; local links and required entries exist')
