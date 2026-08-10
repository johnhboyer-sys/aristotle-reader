#!/bin/bash
# Read 10 Hicks pages with Grok, offline, three at a time.
BASE="/Users/johnboyer/Developer/aristotle-reader/sources/da-hicks/work/grok-2026-08-10"
GROK=/Users/johnboyer/.grok/bin/grok
cd "$BASE" || exit 1
PAGES=(p095-translation p094-greek p014-greek p144-greek p186-notes \
       p314-notes p454-notes p584-notes p594-appendix p614-index)
i=0
for slug in "${PAGES[@]}"; do
  (
    start=$(date +%s)
    "$GROK" --prompt-file "prompts/$slug.md" \
            --effort high \
            --disable-web-search \
            --permission-mode bypassPermissions \
            --cwd "$BASE" \
            --session-id "$(printf 'aa000000-0000-4000-8000-%012d' $((10#${slug:1:3})))" \
            > "out/$slug.txt" 2> "out/$slug.err"
    echo "$slug exit=$? secs=$(( $(date +%s) - start )) lines=$(wc -l < out/$slug.txt)" >> out/_status.log
  ) &
  i=$((i+1))
  if (( i % 3 == 0 )); then wait; fi
done
wait
echo "ALL DONE $(date)" >> out/_status.log
