"""Report CSS selectors in a direction module that are not scoped to .dir-<k>."""
import re, sys
from pathlib import Path
kit = Path(sys.argv[1])
for k in sys.argv[2].split(','):
    css = (kit / 'dirs' / k / 'style.css').read_text(encoding='utf-8')
    css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
    bad = []
    # walk the text, tracking at-rule blocks whose bodies hold rules
    i, depth_stack = 0, []
    tokens = re.finditer(r'([^{}]*)([{}])', css)
    stack = []
    for m in tokens:
        head, br = m.group(1).strip(), m.group(2)
        if br == '{':
            if head.startswith('@'):
                kind = head.split()[0]
                stack.append(kind)
            else:
                # a rule, unless we're inside a keyframes block
                if stack and stack[-1] in ('@keyframes', '@font-face'):
                    stack.append('frame'); continue
                for sel in head.split(','):
                    sel = sel.strip()
                    if sel and f'.dir-{k}' not in sel:
                        bad.append(sel)
                stack.append('rule')
        else:
            if stack: stack.pop()
    print(k, 'unscoped:', bad[:20] if bad else 'none')
