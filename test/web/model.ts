// Abstract action model and independent oracle for the web properties. Nothing here imports plugin code.
import fc from 'fast-check';

export type Lang = 'mermaid' | 'Mermaid' | 'MERMAID' | 'mermaid title';
export type Seg =
  | { kind: 'valid'; lang: Lang; dir: 'LR' | 'TD'; labels: string[] }
  | { kind: 'invalid'; lang: Lang; body: string }
  | { kind: 'other'; lang: 'js' | 'text' | 'none'; body: string }
  | { kind: 'prose'; text: string };
export type Action =
  | { t: 'send'; segs: Seg[] }
  | { t: 'sendHeld'; segs: Seg[] }
  | { t: 'toggle'; pick: number }
  | { t: 'theme'; theme: 'light' | 'dark' }
  | { t: 'reload' };

/** Few labels on purpose: identical diagrams recur within one session. */
export const LABELS = ['alpha', 'beta', 'gamma', 'δέλτα', '日本語', 'quote "q"', 'a & b'];
const lang = fc.constantFrom<Lang>('mermaid', 'mermaid', 'mermaid', 'Mermaid', 'MERMAID', 'mermaid title');
const valid = fc.record({
  kind: fc.constant('valid' as const), lang, dir: fc.constantFrom<'LR' | 'TD'>('LR', 'TD'),
  labels: fc.array(fc.constantFrom(...LABELS), { minLength: 1, maxLength: 3 }),
});
const invalid = fc.record({
  kind: fc.constant('invalid' as const), lang,
  body: fc.constantFrom('flowchart LR\n  A -->', 'flowchart TD\n  A[unclosed --> B', 'not a diagram at all', 'sequenceDiagram\n  A->>'),
});
const other = fc.record({
  kind: fc.constant('other' as const), lang: fc.constantFrom<'js' | 'text' | 'none'>('js', 'text', 'none'),
  body: fc.constantFrom('flowchart LR\n  A --> B', 'const a = 1;', 'graph TD; x'),
});
const prose = fc.record({ kind: fc.constant('prose' as const), text: fc.constantFrom('Here is a diagram.', 'Ünïcödé prose 🎉', 'See below:') });
const segs = fc.array(fc.oneof({ weight: 4, arbitrary: valid }, { weight: 2, arbitrary: invalid }, { weight: 1, arbitrary: other }, { weight: 1, arbitrary: prose }), { minLength: 1, maxLength: 3 });
const heldSegs = fc.tuple(valid, fc.array(fc.oneof(valid, invalid), { maxLength: 1 })).map(([v, rest]) => [v, ...rest] as Seg[]);

export const action: fc.Arbitrary<Action> = fc.oneof(
  { weight: 5, arbitrary: segs.map((s) => ({ t: 'send' as const, segs: s })) },
  { weight: 1, arbitrary: heldSegs.map((s) => ({ t: 'sendHeld' as const, segs: s })) },
  { weight: 3, arbitrary: fc.nat(20).map((pick) => ({ t: 'toggle' as const, pick })) },
  { weight: 2, arbitrary: fc.constantFrom<'light' | 'dark'>('light', 'dark').map((theme) => ({ t: 'theme' as const, theme })) },
  { weight: 1, arbitrary: fc.constant({ t: 'reload' as const }) },
);
/** Every sequence starts with a send so most cases exercise a populated transcript. */
export const actions = (maxLength: number): fc.Arbitrary<Action[]> =>
  fc.tuple(segs, fc.array(action, { maxLength: maxLength - 1 })).map(([first, rest]) => [{ t: 'send' as const, segs: first }, ...rest]);

export function codeOf(seg: Exclude<Seg, { kind: 'prose' }>): string {
  if (seg.kind !== 'valid') return seg.body;
  const nodes = seg.labels.map((l, i) => `  n${i}["${l.replaceAll('"', '#quot;')}"]`);
  const edges = seg.labels.slice(1).map((_, i) => `  n${i} --> n${i + 1}`);
  return [`flowchart ${seg.dir}`, ...nodes, ...edges].join('\n');
}

export function fenceText(seg: Seg): string {
  if (seg.kind === 'prose') return seg.text;
  const info = seg.kind === 'other' ? (seg.lang === 'none' ? '' : seg.lang) : seg.lang;
  return `\`\`\`${info}\n${codeOf(seg)}\n\`\`\``;
}

export function replyText(segs: Seg[], marker: string): string {
  return [...segs.map(fenceText), marker].join('\n\n');
}

export interface ModelBlock { kind: 'valid' | 'invalid' | 'other'; code: string; labels: string[]; view: 'diagram' | 'code' }
export interface Model { blocks: ModelBlock[]; theme: 'light' | 'dark'; turns: number }

export function addTurn(model: Model, segs: Seg[]): void {
  for (const s of segs) {
    if (s.kind === 'prose') continue;
    model.blocks.push({ kind: s.kind, code: codeOf(s), labels: s.kind === 'valid' ? s.labels : [], view: 'diagram' });
  }
  model.turns += 1;
}

/** What the page shows for one `.md-code-block`, read from the DOM only. */
export interface BlockSnap {
  code: string;
  contentDisplay: string;
  containers: number;
  containerIsLast: boolean;
  containerDisplay: string | null;
  error: boolean;
  text: string;
  theme: string | null;
  svgs: number;
  toggles: string[];
  executable: string[];
}
export interface PageSnap { blocks: BlockSnap[]; svgIds: string[]; stray: number; empties: number }

/** Violations of the eventual (settled) invariants; empty when the page matches the model. */
export function violations(model: Model, snap: PageSnap, { uniqueIds = true } = {}): string[] {
  const out: string[] = [];
  if (snap.blocks.length !== model.blocks.length) out.push(`P-01: ${snap.blocks.length} code blocks on the page, model has ${model.blocks.length}`);
  if (snap.stray !== 0) out.push(`P-09: ${snap.stray} stray render nodes under <body>`);
  const validCount = model.blocks.filter((b) => b.kind === 'valid').length;
  const svgTotal = snap.blocks.reduce((n, b) => n + b.svgs, 0);
  if (svgTotal !== validCount) out.push(`P-02: ${svgTotal} diagrams, model expects ${validCount}`);
  if (uniqueIds) {
    const dup = snap.svgIds.filter((id, i) => snap.svgIds.indexOf(id) !== i);
    if (dup.length) out.push(`P-10: duplicate diagram svg ids ${JSON.stringify([...new Set(dup)])}`);
  }
  model.blocks.forEach((m, i) => {
    const b = snap.blocks[i];
    if (!b) return;
    const where = `block ${i} (${m.kind})`;
    if (b.code.trimEnd() !== m.code.trimEnd()) out.push(`P-01: ${where} shows code ${JSON.stringify(b.code)} expected ${JSON.stringify(m.code)}`);
    if (b.executable.length) out.push(`P-08: ${where} has executable content ${b.executable.join(',')}`);
    if (m.kind === 'other') {
      if (b.containers || b.toggles.length) out.push(`P-03: ${where} non-mermaid fence was decorated`);
      if (b.contentDisplay === 'none') out.push(`P-03: ${where} non-mermaid code hidden`);
      return;
    }
    if (b.containers !== 1 || !b.containerIsLast) { out.push(`P-02: ${where} has ${b.containers} containers (last=${b.containerIsLast})`); return; }
    if (m.kind === 'invalid') {
      if (!b.error || !b.text.startsWith('Mermaid: ') || b.text.length <= 'Mermaid: '.length || b.text.includes('\n')) out.push(`P-06: ${where} error line ${JSON.stringify(b.text)}`);
      if (b.toggles.length) out.push(`P-06: ${where} failed block has a toggle`);
      if (b.contentDisplay === 'none') out.push(`P-06: ${where} failed block hides its code`);
      if (b.svgs) out.push(`P-06: ${where} failed block shows a diagram`);
      return;
    }
    if (b.error || b.svgs !== 1) { out.push(`P-02: ${where} error=${b.error} svgs=${b.svgs} text=${JSON.stringify(b.text.slice(0, 80))}`); return; }
    const flat = b.text.replace(/\s+/g, ' ');
    for (const l of m.labels) if (!flat.includes(l)) out.push(`P-02: ${where} label ${JSON.stringify(l)} missing from diagram`);
    if (b.theme !== model.theme) out.push(`P-05: ${where} rendered for ${b.theme}, page is ${model.theme}`);
    const label = m.view === 'diagram' ? 'Show code' : 'Show diagram';
    if (b.toggles.length !== 1 || b.toggles[0] !== label) out.push(`P-04: ${where} toggles ${JSON.stringify(b.toggles)} expected [${label}]`);
    if (m.view === 'diagram' && (b.contentDisplay !== 'none' || b.containerDisplay === 'none')) out.push(`P-04: ${where} diagram view shows code=${b.contentDisplay} diagram=${b.containerDisplay}`);
    if (m.view === 'code' && (b.contentDisplay === 'none' || b.containerDisplay !== 'none')) out.push(`P-04: ${where} code view shows code=${b.contentDisplay} diagram=${b.containerDisplay}`);
  });
  return out;
}
