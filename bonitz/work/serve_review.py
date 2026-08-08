#!/usr/bin/env python3
"""
Serve the review pages and accept verdicts back.

Mobile Safari cannot use navigator.clipboard over plain http (not a secure
context) and a file:// page gets no persistent localStorage, so neither
"copy" nor "download" is a usable way off an iPhone.  Posting the verdicts
back to the machine that served them is.

    python3 work/serve_review.py            # 0.0.0.0:8777, serves work/

POST /save with a JSON body writes work/verdicts/verdicts-<range>-<view>.json.
Every write also drops a timestamped copy in work/verdicts/history/, because
losing an hour of hand-adjudication to a clobbered file would be unforgivable.
"""

from __future__ import annotations
import json
import re
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'verdicts'
SAFE = re.compile(r'^[A-Za-z0-9_.-]+$')


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)

    def do_POST(self):                                    # noqa: N802
        if self.path.rstrip('/') != '/save':
            self.send_error(404)
            return
        try:
            n = int(self.headers.get('Content-Length', 0))
            body = json.loads(self.rfile.read(n).decode('utf-8'))
            rng = str(body.get('range', 'unknown'))
            view = str(body.get('view', 'unknown'))
            if not (SAFE.match(rng) and SAFE.match(view)):
                raise ValueError('bad range/view')
            OUT.mkdir(exist_ok=True)
            (OUT / 'history').mkdir(exist_ok=True)
            text = json.dumps(body, ensure_ascii=False, indent=1)
            name = f'verdicts-{rng}-{view}.json'
            (OUT / name).write_text(text, encoding='utf-8')
            stamp = datetime.now().strftime('%Y%m%d-%H%M%S')
            (OUT / 'history' / f'{stamp}-{name}').write_text(text, encoding='utf-8')
            count = len(body.get('verdicts', []))
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'ok': True, 'saved': count,
                                         'file': name}).encode())
            print(f'saved {count} verdicts -> {name}')
        except Exception as e:                            # noqa: BLE001
            self.send_response(400)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'ok': False,
                                         'error': str(e)}).encode())

    def log_message(self, fmt, *args):
        if 'POST' in (args[0] if args else ''):
            super().log_message(fmt, *args)


if __name__ == '__main__':
    print(f'serving {ROOT} on 0.0.0.0:8777  (POST /save -> {OUT})')
    ThreadingHTTPServer(('0.0.0.0', 8777), Handler).serve_forever()
