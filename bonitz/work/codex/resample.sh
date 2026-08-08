#!/bin/bash
# resample.sh <page> <col> <n>  -> work/codex/page-NNN-C.400.rN.txt
# Same inputs as read-column-400.sh; only the sample index differs. Tests
# whether the per-column ϗ decision is stable or varies between runs.
set -u
P=$(printf '%03d' "$1"); C="$2"; N="$3"
D="work/codex/strips400/page-$P-$C"
OUT="work/codex/page-$P-$C.400.r$N.txt"
LOG="work/codex/page-$P-$C.400.r$N.log"
IMGS=$(ls "$D"/strip-*.png | tr '\n' ' ')
{ cat work/codex/reader-prompt.md
  echo
  echo "Transcribe page $P column $C. The images are consecutive OVERLAPPING strips of the column, top to bottom; each repeats about 110px of the previous one, so do not transcribe the same line twice at a strip boundary."
} | codex exec -m gpt-5.6-sol -c model_reasoning_effort=high --sandbox read-only \
      -i $IMGS 2>"$LOG" >/dev/null
START=$(awk '/^codex[[:space:]]*$/{n=NR} END{print n}' "$LOG")
awk -v s="$START" 'NR>s' "$LOG" | awk '/^tokens used[[:space:]]*$/{exit} {print}' > "$OUT"
echo "$P-$C r$N: $(wc -l < "$OUT") lines, ϗ=$(grep -o 'ϗ' "$OUT" | wc -l | tr -d ' ')"
