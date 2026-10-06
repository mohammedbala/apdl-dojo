// Hash router: '#/path/:param?query'. Pages mount into a container and may return a cleanup function.
export interface RouteCtx {
  path: string;
  params: Record<string, string>;
  query: URLSearchParams;
  root: HTMLElement;
}

export type Cleanup = () => void;
export type PageFn = (ctx: RouteCtx) => void | Cleanup | Promise<void | Cleanup>;

interface Route {
  pattern: string;
  re: RegExp;
  keys: string[];
  page: PageFn;
  full?: boolean;
}

export interface Router {
  add(pattern: string, page: PageFn, opts?: { full?: boolean }): Router;
  notFound(page: PageFn): Router;
  start(): void;
  navigate(hash: string): void;
  current(): { path: string; pattern: string | null };
  onChange(fn: (path: string) => void): () => void;
}

export function parseHash(hash: string): { path: string; query: URLSearchParams } {
  const h = hash.replace(/^#/, '') || '/';
  const [p, q] = h.split('?');
  const path = '/' + p.replace(/^\/+/, '').replace(/\/+$/, '');
  return { path, query: new URLSearchParams(q ?? '') };
}

export function compile(pattern: string): { re: RegExp; keys: string[] } {
  const keys: string[] = [];
  const src = pattern
    .replace(/\/+$/, '')
    .split('/')
    .map((seg) => {
      if (seg.startsWith(':')) {
        keys.push(seg.slice(1));
        return '([^/]+)';
      }
      return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return { re: new RegExp(`^${src || '/'}$`), keys };
}

export function createRouter(root: HTMLElement): Router {
  const routes: Route[] = [];
  let fallback: PageFn = ({ root: r }) => {
    r.textContent = 'Not found';
  };
  let cleanup: Cleanup | null = null;
  let cur = { path: '/', pattern: null as string | null };
  let token = 0;
  const listeners = new Set<(p: string) => void>();

  const resolve = async () => {
    const my = ++token;
    const { path, query } = parseHash(location.hash);
    if (cleanup) {
      try { cleanup(); } catch (e) { console.error(e); }
      cleanup = null;
    }
    root.innerHTML = '';
    let match: { route: Route; params: Record<string, string> } | null = null;
    for (const r of routes) {
      const m = r.re.exec(path);
      if (m) {
        const params: Record<string, string> = {};
        r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
        match = { route: r, params };
        break;
      }
    }
    cur = { path, pattern: match?.route.pattern ?? null };
    const container = document.createElement('div');
    container.className = match?.route.full ? 'page full' : 'page';
    root.appendChild(container);
    for (const l of listeners) l(path);
    try {
      const res = await (match ? match.route.page : fallback)({ path, params: match?.params ?? {}, query, root: container });
      if (my !== token) {
        if (typeof res === 'function') res();
        return;
      }
      if (typeof res === 'function') cleanup = res;
    } catch (e) {
      console.error(e);
      container.innerHTML = '';
      const pre = document.createElement('pre');
      pre.textContent = `This page failed to load:\n${e instanceof Error ? e.stack ?? e.message : String(e)}`;
      container.appendChild(pre);
    }
    window.scrollTo(0, 0);
  };

  const api: Router = {
    add(pattern, page, opts) {
      const { re, keys } = compile(pattern);
      routes.push({ pattern, re, keys, page, full: opts?.full });
      return api;
    },
    notFound(page) {
      fallback = page;
      return api;
    },
    start() {
      window.addEventListener('hashchange', resolve);
      void resolve();
    },
    navigate(hash) {
      const h = hash.startsWith('#') ? hash : `#${hash}`;
      if (location.hash === h) void resolve();
      else location.hash = h;
    },
    current: () => cur,
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  return api;
}

let globalRouter: Router | null = null;
export function setRouter(r: Router): void {
  globalRouter = r;
}
export function navigate(hash: string): void {
  if (globalRouter) globalRouter.navigate(hash);
  else location.hash = hash;
}
