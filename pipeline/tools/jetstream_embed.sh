#!/usr/bin/env bash
# Embed the topic-search units with every model, on a GPU VM (Jetstream2 or any
# CUDA machine). Writes only vector files, no rankings.
#
# On the VM, from a clone of this repo:
#   1. copy build/topics/units.jsonl up from the laptop (it holds gated English:
#      keep it on a private volume, never in a public image or shared folder);
#   2. bash pipeline/tools/jetstream_embed.sh
#   3. copy build/topics/emb-*.npy back (not the -parts folders).
#
# One job per GPU: with four GPUs, four jobs run at once. A rerun resumes from
# the saved chunks. Logs go to build/topics/logs/.
set -euo pipefail

cd "$(dirname "$0")/.."                      # pipeline/
UNITS=../build/topics/units.jsonl
[ -s "$UNITS" ] || { echo "missing $UNITS — copy it from the laptop first" >&2; exit 1; }
command -v nvidia-smi >/dev/null || { echo "no nvidia-smi: not a GPU machine" >&2; exit 1; }
command -v uv >/dev/null || { curl -LsSf https://astral.sh/uv/install.sh | sh; export PATH="$HOME/.local/bin:$PATH"; }

uv sync --extra align
uv pip install -q "sentence-transformers>=5" "transformers>=4.56"   # voyage-4-nano needs both

JOBS=(
  "BAAI/bge-base-en-v1.5 english"
  "BAAI/bge-m3 english"
  "BAAI/bge-m3 greek"
  "voyageai/voyage-4-nano english"
  "voyageai/voyage-4-nano greek"
)
NGPU=$(nvidia-smi -L | wc -l)
echo "units: $(wc -l < "$UNITS"); GPUs: $NGPU; jobs: ${#JOBS[@]}"
mkdir -p ../build/topics/logs

i=0; fail=0; pids=()
for job in "${JOBS[@]}"; do
  read -r model field <<<"$job"
  gpu=$(( i % NGPU ))
  log="../build/topics/logs/$(basename "$model")-$field.log"
  CUDA_VISIBLE_DEVICES=$gpu uv run --extra align python tools/topic_embed.py embed \
    --model "$model" --field "$field" --device cuda --batch-size 64 >"$log" 2>&1 &
  pids+=($!); echo "GPU $gpu: $model $field -> $log"
  i=$(( i + 1 ))
  if (( i % NGPU == 0 )); then for p in "${pids[@]}"; do wait "$p" || fail=1; done; pids=(); fi
done
for p in "${pids[@]}"; do wait "$p" || fail=1; done

ls -la ../build/topics/emb-*.npy
(( fail == 0 )) || { echo "a job failed: see build/topics/logs/" >&2; exit 1; }
