"""Word-level offset mapping between two versions of a chapter."""
import bisect, difflib, re


def spans(s):
    sp = []
    m0 = re.match(r'\s+', s)
    if m0:
        sp.append((0, m0.end()))
    return sp + [(m.start(), m.end()) for m in re.finditer(r'\S+\s*', s)]


class Map:
    def __init__(self, o, n):
        self.o, self.n = o, n
        self.os, self.ns = spans(o), spans(n)
        ot, nt = [o[a:b] for a, b in self.os], [n[a:b] for a, b in self.ns]
        self.ops = difflib.SequenceMatcher(None, ot, nt, autojunk=False).get_opcodes()
        self.starts = [a for a, _ in self.os]

    def tok(self, off):
        return bisect.bisect_right(self.starts, off) - 1

    def f(self, off):
        if off >= len(self.o):
            return len(self.n)
        i = self.tok(off)
        for tag, i1, i2, j1, j2 in self.ops:
            if i1 <= i < i2:
                if tag == 'equal':
                    return self.ns[j1 + (i - i1)][0] + (off - self.os[i][0])
                return self.ns[j1][0] if j1 < len(self.ns) else len(self.n)
        return len(self.n)

    def touches(self, lo, hi):
        hi = min(hi, len(self.o))
        if lo >= hi:
            return False
        a, b = self.tok(lo), self.tok(hi - 1)
        return any(tag != 'equal' and ((i1 <= b and i2 > a) or (i1 == i2 and a < i1 <= b))
                   for tag, i1, i2, j1, j2 in self.ops)


