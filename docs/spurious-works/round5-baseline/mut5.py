import sys, shutil, subprocess, json, pathlib, html
WT = pathlib.Path("/Users/johnboyer/Developer/aristotle-reader/.claude/worktrees/agent-a782a5f9d3204d01e")
SC = pathlib.Path('/Users/johnboyer/Developer/aristotle-reader/.claude/worktrees/agent-a782a5f9d3204d01e/build/prob-ocr/work/opus-mut')
muts = json.load(open(sys.argv[1]))
for n, (book, old, new, label) in enumerate(muts, 1):
    d = SC / f"m{n}"
    if d.exists(): shutil.rmtree(d)
    d.mkdir()
    for f in (WT / "sources/prob-forster").glob("book-*.html"):
        shutil.copyfile(f, d / f.name)
    p = d / f"book-{book:02d}.html"
    t = p.read_text()
    c = t.count(old)
    if c != 1:
        print(f"{n} {label}: SKIP count={c}"); continue
    p.write_text(t.replace(old, new))
    r = subprocess.run([sys.executable, "-B", "pipeline/tools/build_prob_forster.py", "--ocr-dir", "build/prob-ocr", "--verify", "--books", str(d)], cwd=WT, capture_output=True, text=True)
    finds = [l for l in r.stdout.splitlines() if l.startswith("  ")]
    print(f"{n} {label}: exit={r.returncode} {'CAUGHT' if r.returncode==1 else 'MISSED'}")
    for l in finds[:6]: print("   ", l[:260])
    shutil.rmtree(d)
