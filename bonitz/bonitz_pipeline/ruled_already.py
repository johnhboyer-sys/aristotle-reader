"""Sites a card is about to re-ask, that John has already answered.

    python3 -m bonitz_pipeline.ruled_already --queue work/.../queue-x.json

A ruling belongs to the SITE, and it outranks whatever the readers agree on
afterwards. The case this module exists for: at `page-116-R:61:2844` the card
offered `raοtetur | tractetur | uactetur` — LlamaParse and Genie BOTH reading
`tractetur` — and John ruled `none`, meaning the ink shows something else. A
later sweep found the same line, asked LlamaParse again, got `tractetur`
again, and built a card proposing it. Two readers agreeing is not new
evidence when the ruling was made against the ink that overrules them.

⚠ A SITE IS NOT A LINE. Matching `page-116-R:61` against the stores flags 24
of 52 cards, nearly all of them different tokens sharing a line. The address
is `page-NNN-C:line:word_off` and nothing shorter.

⚠ AN EXCLUSION IS NOT A RULING. `dispute:letters:b>t` was ACCEPTED with
`page-112-L:23:1056` in its `excluded` list: John declined ONE change there
and did not rule the site correct. A different change with new evidence is a
fair question, so this is reported as `excluded` and not as `ruled`.

⚠ `none` IS THE LOUDEST ANSWER. It means he looked and rejected what he was
shown. Re-proposing a form out of that same form-set is the worst case and
carries its own severity, `rejected`.

A REPORTER, NOT A GATE. It says what a queue would re-ask; whether to ask
anyway — with his prior answer written on the card — is a judgement about the
evidence, and belongs to whoever builds the queue.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path

SITE = re.compile(r'(?:site:)?page-(\d{3})-([LR]):(\d+):(\d+)$')


class RuledAlreadyError(RuntimeError):
    pass


@dataclass(frozen=True)
class Collision:
    site: str
    severity: str        # 'rejected' | 'acknowledged' | 'ruled' | 'excluded'
    verdict: str
    sid: str
    store: str
    why: str


def _forms_in(sid: str) -> list[str]:
    """The forms a form-set card put in front of him, from its own key."""
    return sid.split(':', 1)[1].split('|') if sid.startswith('forms:') else []


def _index(stores) -> dict[tuple, list[tuple]]:
    out: dict[tuple, list[tuple]] = {}
    seen_any = False
    for root in stores:
        root = Path(root)
        if not root.is_dir():
            continue
        for f in sorted(root.glob('*.json')):
            seen_any = True
            try:
                doc = json.loads(f.read_text(encoding='utf-8'))
            except Exception:
                continue
            if not isinstance(doc, dict):
                continue
            for sid, r in doc.items():
                if not isinstance(r, dict):
                    continue
                verdict = r.get('verdict') or ''
                detail = r.get('detail') or ''
                excluded = {s for s in (r.get('excluded') or [])
                            if isinstance(s, str)}
                for s in (r.get('sites') or []):
                    if not isinstance(s, str):
                        continue
                    m = SITE.match(s)
                    if not m:
                        continue
                    key = (int(m[1]), m[2], int(m[3]), int(m[4]))
                    out.setdefault(key, []).append(
                        (sid, verdict, detail, s in excluded, f.name))
    if not seen_any:
        raise RuledAlreadyError(
            f'no ruling stores under {[str(s) for s in stores]} — refusing to '
            f'report a queue clean that was never checked against anything')
    return out


def collisions(entries, stores) -> list[Collision]:
    idx = _index(stores)
    out = []
    for e in entries:
        key = (int(e['page']), e['col'], int(e['line']), int(e['word_off']))
        for sid, verdict, detail, was_excluded, store in idx.get(key, []):
            site = f'page-{key[0]:03d}-{key[1]}:{key[2]}:{key[3]}'
            if was_excluded:
                out.append(Collision(site, 'excluded', verdict, sid, store,
                                     'held out of this change; he did not rule '
                                     'the site correct'))
                continue
            forms = _forms_in(sid)
            want = e.get('becomes', '')
            # ⚠ A WHOLE-LINE CARD HIDES THE FORM INSIDE ITSELF. The card that
            # prompted this module proposed `tractetur, quaestionis ac docti-`,
            # so an equality test against the form-set saw nothing and the
            # rejected form sailed through. Look for it as a WORD.
            rejected = next((f for f in forms if f and (
                f == want or re.search(r'(?<!\w)' + re.escape(f) + r'(?!\w)',
                                       want))), '')
            if verdict == 'none' and rejected:
                # ⚠ AN OVERRIDE MUST BE WRITTEN DOWN, NOT ASSUMED. A queue may
                # re-ask a refused question when it has evidence he did not
                # have — at 116-R:61 the first card was word-level and showed
                # no whole-line crop, and the line turns out to be TRUNCATED,
                # missing `nae, sed certos quosdam Ari-` outright. Saying so in
                # `ack_ruled` keeps the re-ask visible and reviewable; leaving
                # the field empty keeps it an error.
                ack = (e.get('ack_ruled') or '').strip()
                out.append(Collision(
                    site, 'acknowledged' if ack else 'rejected', verdict, sid,
                    store,
                    (f'deliberately re-asked: {ack}' if ack else
                     f'he was shown {rejected!r} in this very form-set and '
                     f'ruled none — the ink shows something else')))
            # ⚠ `none` IS NOT THE ONLY WAY HE SAYS NO. A form-set ACCEPTED with
            # a detail that is not the form we now propose means he was shown
            # ours and chose another — `forms:τοῆς|τοῖς` accepted as `τοῆϛ` is
            # the case. Rate that as mild and the settled question gets asked
            # again with a softer label on it.
            elif (verdict == 'accept' and rejected and detail
                    and detail != rejected):
                out.append(Collision(
                    site, 'rejected', verdict, sid, store,
                    f'he was shown {rejected!r} in this form-set and accepted '
                    f'{detail!r} instead'))
            else:
                out.append(Collision(site, 'ruled', verdict, sid, store,
                                     f'already answered {verdict!r}'))
    return out


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--queue', required=True, action='append')
    ap.add_argument('--stores', action='append',
                    default=None, help='default: work/rulings and work/sweeps')
    a = ap.parse_args(argv)
    stores = a.stores or ['work/rulings', 'work/sweeps']
    entries = []
    for q in a.queue:
        doc = json.loads(Path(q).read_text(encoding='utf-8'))
        entries += doc['entries'] if isinstance(doc, dict) else doc
    got = collisions(entries, stores)
    rank = {'rejected': 0, 'acknowledged': 1, 'ruled': 2, 'excluded': 3}
    for c in sorted(got, key=lambda c: (rank[c.severity], c.site)):
        print(f'{c.severity.upper():9} {c.site}  {c.sid}')
        print(f'          {c.why}  [{c.store}]')
    n = len(got)
    print(f'{n} of {len(entries)} cards touch a site the stores have answered',
          file=sys.stderr)
    return 1 if any(c.severity == 'rejected' for c in got) else 0


if __name__ == '__main__':
    raise SystemExit(main())
