// scripts/ocr-repair.ts
//
// Thin CLI for the Goal-A OCR-repair pipeline. Run with:
//
//   npx tsx desktop/scripts/ocr-repair.ts --config ~/Documents/aristotle-ocr/<corpus>/config.json [--through N]
//
// Reads the corpus backbone, runs repair stages 1..N in order (none yet at
// stage 0), grades the text with the frozen Goal-B converter after every
// stage, prints the honesty-report delta, and writes stage outputs +
// change-lists + reports into the corpus outDir (never the repo).

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadCorpusConfig, type CorpusConfig } from '../src/lib/ocr-repair/corpus-config';
import { grade, formatSummary, diffSummaries, type GradeSummary } from '../src/lib/ocr-repair/grade';
import { slicePages } from '../src/lib/ocr-repair/slice';
import { repairSkeleton } from '../src/lib/ocr-repair/skeleton';
import { reseatGutter } from '../src/lib/ocr-repair/gutter-reseat';
import { normalizeSpacing } from '../src/lib/ocr-repair/spacing';
import { extractWitnessAnchors } from '../src/lib/ocr-repair/witness-anchors';
import { vote } from '../src/lib/ocr-repair/vote';
import { renderReview, parseDecisions } from '../src/lib/ocr-repair/review';
import { renderPairingMarkdown } from '../src/lib/ocr-repair/witness-pairing';
import type { ChangeRecord } from '../src/lib/ocr-repair/changelist';
import type { ReviewDecisions } from '../src/lib/ocr-repair/review';

interface StageResult {
  text: string;
  /** JSONL-ready change records (changelist.ts shapes them; none at stage 0). */
  changes: object[];
  /** Extra files to persist (e.g. sliced-off front/back matter — kept, never deleted). */
  artifacts?: Record<string, string>;
  files?: { root: 'out' | 'reports' | 'stages'; name: string; content: string }[];
}

interface StageContext {
  witnessText: string;
  decisions?: ReviewDecisions;
  droppedLines: string[];
  stage3Records: ChangeRecord[];
}

type Stage = {
  n: number;
  name: string;
  run: (text: string, config: CorpusConfig, context: StageContext) => StageResult;
};

// Stages register here as they are built (slice, skeleton, gutter-reseat,
// spacing, align+vote). Stage 0 is the grade of the raw backbone itself.
const STAGES: Stage[] = [
  {
    n: 1,
    name: 'slice',
    run: (text, config) => {
      const { text: sliced, changes, frontMatter, backMatter } = slicePages(text, config);
      const artifacts: Record<string, string> = {};
      if (frontMatter) artifacts['removed-front-matter.txt'] = frontMatter;
      if (backMatter) artifacts['removed-back-matter.txt'] = backMatter;
      return { text: sliced, changes, artifacts };
    },
  },
  {
    n: 2,
    name: 'skeleton',
    run: (text, config) => repairSkeleton(text, config),
  },
  {
    n: 3,
    name: 'gutter',
    run: (text, config, context) => {
      const witness = extractWitnessAnchors(context.witnessText);
      return reseatGutter(text, config, witness);
    },
  },
  {
    n: 4,
    name: 'spacing',
    run: (text, config) => normalizeSpacing(text, config),
  },
  {
    n: 5,
    name: 'vote',
    run: (text, config, context) => {
      const outcome = vote(text, context.witnessText, config, context.decisions, {
        stage3Records: context.stage3Records,
        droppedLines: context.droppedLines,
      });
      return {
        text: outcome.text,
        changes: outcome.changes,
        files: [
          { root: 'reports', name: 'stage5-pairing.json', content: JSON.stringify(outcome.pairing, null, 2) + '\n' },
          { root: 'reports', name: 'stage5-pairing.md', content: renderPairingMarkdown(outcome.pairing) },
          { root: 'reports', name: 'stage5-dropped.json', content: JSON.stringify(outcome.dropped, null, 2) + '\n' },
          { root: 'out', name: `review-${config.id}.md`, content: renderReview(outcome.review) },
        ],
      };
    },
  },
];

function parseArgs(argv: string[]): { configPath: string; through: number; decisionsPath?: string } {
  let configPath = '';
  let through = 0;
  let decisionsPath: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--config') configPath = argv[++i] ?? '';
    else if (argv[i] === '--through') through = Number(argv[++i] ?? '0');
    else if (argv[i] === '--decisions') decisionsPath = argv[++i] ?? '';
    else throw new Error(`unknown argument ${argv[i]}`);
  }
  if (!configPath) throw new Error('usage: ocr-repair.ts --config <config.json> [--through N] [--decisions review.md]');
  if (!Number.isInteger(through) || through < 0) throw new Error(`bad --through value`);
  return { configPath, through, decisionsPath };
}

function readJsonl(path: string): ChangeRecord[] {
  let raw = '';
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return [];
  }
  return raw
    .split(/\n/u)
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as ChangeRecord);
}

function main() {
  const { configPath, through, decisionsPath } = parseArgs(process.argv.slice(2));
  const config = loadCorpusConfig(configPath);
  const reportsDir = join(config.outDir, 'reports');
  const stagesDir = join(config.outDir, 'stages');
  mkdirSync(reportsDir, { recursive: true });
  mkdirSync(stagesDir, { recursive: true });

  let text = readFileSync(config.backbonePath, 'utf8');
  const witnessText = readFileSync(config.witnessPath, 'utf8');
  const decisions = decisionsPath ? parseDecisions(readFileSync(decisionsPath, 'utf8')) : undefined;

  console.log(`corpus: ${config.id} (${config.workTitle})`);
  console.log(`backbone: ${config.backbonePath}`);
  console.log('\nstage 0 — raw backbone baseline:');
  let prev: GradeSummary = grade(text).summary;
  console.log(formatSummary(prev));
  writeFileSync(join(reportsDir, 'stage0-baseline.json'), JSON.stringify(prev, null, 2) + '\n');

  for (const stage of STAGES) {
    if (stage.n > through) break;
    const currentGrade = grade(text);
    const context: StageContext = {
      witnessText,
      decisions,
      droppedLines: currentGrade.report?.droppedLines ?? [],
      stage3Records: stage.n === 5 ? readJsonl(join(config.outDir, 'changes-stage3.jsonl')) : [],
    };
    const { text: repaired, changes, artifacts, files } = stage.run(text, config, context);
    text = repaired;
    for (const [name, content] of Object.entries(artifacts ?? {})) {
      writeFileSync(join(stagesDir, name), content);
    }
    for (const file of files ?? []) {
      const dir = file.root === 'reports' ? reportsDir : file.root === 'stages' ? stagesDir : config.outDir;
      writeFileSync(join(dir, file.name), file.content);
    }
    const summary = grade(text).summary;
    console.log(`\nstage ${stage.n} — ${stage.name}: ${changes.length} change records`);
    const delta = diffSummaries(prev, summary);
    console.log(delta.length ? delta : '  (no counter moved)');
    writeFileSync(
      join(stagesDir, `stage${stage.n}-${stage.name}.txt`),
      text
    );
    writeFileSync(
      join(reportsDir, `stage${stage.n}-${stage.name}.json`),
      JSON.stringify(summary, null, 2) + '\n'
    );
    if (changes.length || stage.n === 5) {
      const jsonl = changes.length ? changes.map((c) => JSON.stringify(c)).join('\n') + '\n' : '';
      writeFileSync(join(config.outDir, `changes-stage${stage.n}.jsonl`), jsonl);
    }
    prev = summary;
  }
}

main();
