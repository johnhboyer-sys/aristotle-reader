#!/bin/bash
# read-column.sh <page> <col>   -> work/codex/page-NNN-C.txt
set -u
P=$(printf '%03d' "$1"); C="$2"
D="images/strips/page-$P-$C"
OUT="work/codex/page-$P-$C.txt"
IMGS=$(ls "$D"/strip-*.png | tr '\n' ' ')
{ cat work/codex/reader-prompt.md
  echo
  echo "Transcribe page $P column $C. The images are consecutive OVERLAPPING strips of the column, top to bottom; each repeats about 110px of the previous one, so do not transcribe the same line twice at a strip boundary."
} | codex exec -m gpt-5.6-sol -c model_reasoning_effort=high --sandbox read-only \
      -i $IMGS 2>"work/codex/page-$P-$C.log" \
  >/dev/null
# the final response sits after the LAST "codex" marker line and before the
# "tokens used" footer; the marker can carry trailing whitespace so anchor loosely
awk '/^codex[[:space:]]*$/{n=NR} END{print n}' "work/codex/page-$P-$C.log" > /tmp/_m
START=$(cat /tmp/_m)
awk -v s="$START" 'NR>s' "work/codex/page-$P-$C.log" \
  | awk '/^tokens used[[:space:]]*$/{exit} {print}' > "$OUT"
echo "$P-$C: $(wc -l < "$OUT") lines"
