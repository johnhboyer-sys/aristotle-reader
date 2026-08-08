#!/bin/bash
# read-column-400.sh <page> <col>  -> work/codex/page-NNN-C.400.txt
# Identical to read-column.sh except the images come from the 1870 archive.org
# scan at 400 dpi instead of the 1955 reprint in book.pdf. Prompt, model and
# reasoning effort are held constant so the scan is the only changed variable.
set -u
P=$(printf '%03d' "$1"); C="$2"
D="work/codex/strips400/page-$P-$C"
OUT="work/codex/page-$P-$C.400.txt"
LOG="work/codex/page-$P-$C.400.log"
IMGS=$(ls "$D"/strip-*.png | tr '\n' ' ')
{ cat work/codex/reader-prompt.md
  echo
  echo "Transcribe page $P column $C. The images are consecutive OVERLAPPING strips of the column, top to bottom; each repeats about 110px of the previous one, so do not transcribe the same line twice at a strip boundary."
} | codex exec -m gpt-5.6-sol -c model_reasoning_effort=high --sandbox read-only \
      -i $IMGS 2>"$LOG" >/dev/null
START=$(awk '/^codex[[:space:]]*$/{n=NR} END{print n}' "$LOG")
awk -v s="$START" 'NR>s' "$LOG" | awk '/^tokens used[[:space:]]*$/{exit} {print}' > "$OUT"
echo "$P-$C: $(wc -l < "$OUT") lines"
