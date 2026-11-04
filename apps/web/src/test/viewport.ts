/**
 * jsdom has no layout and no window.matchMedia, so tests get a stand-in driven
 * by a pretend screen width. It understands the one form the app uses,
 * `(min-width: <n>rem)`, and fails loudly on anything else.
 */
const DESKTOP_WIDTH = 1280;
const REM = 16;

let width = DESKTOP_WIDTH;

class FakeMediaQueryList extends EventTarget implements MediaQueryList {
  onchange = null;
  private readonly minWidth: number;

  constructor(readonly media: string) {
    super();
    const match = /^\(min-width: ([\d.]+)rem\)$/.exec(media);
    if (!match?.[1]) throw new Error(`Test matchMedia cannot read: ${media}`);
    this.minWidth = Number(match[1]) * REM;
  }

  get matches() {
    return width >= this.minWidth;
  }

  // Deprecated, but part of the MediaQueryList type. The app does not use them.
  addListener() {
    throw new Error('Use addEventListener');
  }
  removeListener() {
    throw new Error('Use removeEventListener');
  }
}

// One list per query, like a subscription target that outlives each render.
const lists = new Map<string, FakeMediaQueryList>();

window.matchMedia = (query) => {
  const list = lists.get(query) ?? new FakeMediaQueryList(query);
  lists.set(query, list);
  return list;
};

/** Changes the pretend screen width. Wrap it in act() when something is rendered. */
export function setViewportWidth(pixels: number) {
  width = pixels;
  for (const list of lists.values()) list.dispatchEvent(new Event('change'));
}

export function resetViewport() {
  width = DESKTOP_WIDTH;
}

export const PHONE_WIDTH = 375;
