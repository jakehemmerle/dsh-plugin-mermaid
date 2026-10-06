import { codeBlockProps } from './fiber';
import { type BlockState, observe, readFence, settle, type Theme } from './fence';
import { renderMermaid } from './render';

interface Context { effect(execute: () => () => void): unknown }

const BLOCK = '.md-code-block';
const CONTAINER = 'data-dsh-mermaid';
const ERROR = 'data-dsh-mermaid-error';
const THEME = 'data-dsh-mermaid-theme';
const TOGGLE = 'data-dsh-mermaid-toggle';
const VIEW = 'data-dsh-mermaid-view';
const SETTLE_POLL_MS = 500;
const MIN_SCALE = 0.7;

const CSS = `
${BLOCK}[${VIEW}="diagram"] [data-code-block-content] { display: none; }
${BLOCK}[${VIEW}="code"] > [${CONTAINER}] { display: none; }
[${CONTAINER}] { overflow-x: auto; background: transparent; padding: 12px 16px; }
[${CONTAINER}] > svg { display: block; margin: 0 auto; height: auto; }
[${CONTAINER}][${ERROR}] { padding: 4px 16px 10px; font-size: 12px; opacity: 0.6; white-space: pre-wrap; }
`;

const ICON_CODE = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M5.5 4.5 2 8l3.5 3.5M10.5 4.5 14 8l-3.5 3.5" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_DIAGRAM = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="1.5" y="1.5" width="5.5" height="4" rx="1" stroke="currentColor"/><rect x="9" y="10.5" width="5.5" height="4" rx="1" stroke="currentColor"/><path d="M4.25 5.5v7H9" stroke="currentColor"/></svg>';

type View = 'diagram' | 'code';

function currentTheme(): Theme {
  return document.documentElement.style.colorScheme === 'dark' ? 'dark' : 'light';
}

function strip(root: Element): void {
  root.querySelector(`:scope > [${CONTAINER}]`)?.remove();
  root.querySelector(`[${TOGGLE}]`)?.remove();
  root.removeAttribute(VIEW);
}

function setView(root: Element, toggle: HTMLElement | null, view: View): void {
  root.setAttribute(VIEW, view);
  if (toggle === null) return;
  const label = view === 'diagram' ? 'Show code' : 'Show diagram';
  if (toggle.getAttribute('aria-label') === label) return;
  toggle.setAttribute('aria-label', label);
  toggle.title = label;
  toggle.innerHTML = view === 'diagram' ? ICON_CODE : ICON_DIAGRAM;
}

function ensureToggle(root: Element): HTMLElement | null {
  const existing = root.querySelector<HTMLElement>(`[${TOGGLE}]`);
  if (existing !== null) return existing;
  const sibling = root.querySelector('[data-code-block-banner] button');
  const actions = sibling?.parentElement;
  if (!sibling || !actions) return null;
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = sibling.className;
  toggle.setAttribute(TOGGLE, '');
  toggle.addEventListener('click', () => {
    setView(root, toggle, root.getAttribute(VIEW) === 'diagram' ? 'code' : 'diagram');
  });
  actions.prepend(toggle);
  return toggle;
}

function ensureContainer(root: Element): HTMLElement {
  let container = root.querySelector<HTMLElement>(`:scope > [${CONTAINER}]`);
  if (container === null) {
    container = document.createElement('div');
    container.setAttribute(CONTAINER, '');
  }
  if (root.lastElementChild !== container) root.append(container);
  return container;
}

function parseSvg(markup: string): SVGSVGElement | null {
  const doc = new DOMParser().parseFromString(markup, 'text/html');
  const svg = doc.body.querySelector('svg');
  if (svg === null) return null;
  const width = Number.parseFloat(svg.style.maxWidth);
  // mermaid's width="100%" + max-width shrinks wide diagrams without bound; cap the shrink so text stays legible and the container scrolls instead.
  if (Number.isFinite(width) && width > 0) svg.style.minWidth = `${Math.round(width * MIN_SCALE)}px`;
  return document.adoptNode(svg);
}

export function apply(ctx: Context): void {
  ctx.effect(() => {
    const states = new WeakMap<Element, BlockState>();
    const shown = new WeakMap<Element, BlockState>();
    let seq = 0;
    let disposed = false;
    let frame: number | undefined;
    let poll: ReturnType<typeof setInterval> | undefined;

    const present = (root: Element, state: BlockState): void => {
      if (state.kind === 'waiting') {
        strip(root);
        shown.delete(root);
        return;
      }
      if (state.kind === 'rendering') return;
      const container = ensureContainer(root);
      if (state.kind === 'failed') {
        root.querySelector(`[${TOGGLE}]`)?.remove();
        root.removeAttribute(VIEW);
        if (shown.get(root) === state) return;
        container.setAttribute(ERROR, '');
        container.removeAttribute(THEME);
        container.textContent = `Mermaid: ${state.message.split('\n')[0]}`;
        shown.set(root, state);
        return;
      }
      const toggle = ensureToggle(root);
      const view = root.getAttribute(VIEW) === 'code' ? 'code' : 'diagram';
      setView(root, toggle, view);
      if (shown.get(root) === state) return;
      const svg = parseSvg(state.svg);
      container.removeAttribute(ERROR);
      container.setAttribute(THEME, state.key.theme);
      container.replaceChildren(...(svg ? [svg] : []));
      shown.set(root, state);
    };

    const scan = (): void => {
      if (disposed) return;
      const theme = currentTheme();
      let waiting = false;
      for (const root of document.querySelectorAll(BLOCK)) {
        const fence = readFence(codeBlockProps(root));
        if (fence === undefined) {
          if (states.delete(root)) strip(root);
          continue;
        }
        const { state, effect } = observe(states.get(root), fence, theme);
        states.set(root, state);
        if (state.kind === 'waiting') waiting = true;
        present(root, state);
        if (effect.kind !== 'render') continue;
        const { key } = effect;
        void renderMermaid(key, `dsh-mermaid-${++seq}`).then((result) => {
          const current = states.get(root);
          if (disposed || current === undefined) return;
          const next = settle(current, key, result);
          if (next === current) return;
          states.set(root, next);
          present(root, next);
        });
      }
      if (waiting && poll === undefined) poll = setInterval(scan, SETTLE_POLL_MS);
      if (!waiting && poll !== undefined) {
        clearInterval(poll);
        poll = undefined;
      }
    };

    const schedule = (): void => {
      if (frame === undefined && !disposed) frame = requestAnimationFrame(() => {
        frame = undefined;
        scan();
      });
    };

    const style = document.createElement('style');
    style.setAttribute('data-dsh-mermaid-style', '');
    style.textContent = CSS;
    document.head.append(style);
    const content = new MutationObserver(schedule);
    content.observe(document.body, { childList: true, subtree: true, characterData: true });
    const themeObserver = new MutationObserver(schedule);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    schedule();

    return () => {
      disposed = true;
      content.disconnect();
      themeObserver.disconnect();
      if (frame !== undefined) cancelAnimationFrame(frame);
      if (poll !== undefined) clearInterval(poll);
      style.remove();
      for (const el of document.querySelectorAll(`[${CONTAINER}], [${TOGGLE}]`)) el.remove();
      for (const el of document.querySelectorAll(`[${VIEW}]`)) el.removeAttribute(VIEW);
    };
  });
}
