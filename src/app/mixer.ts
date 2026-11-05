// Developed by Interactive 63 (https://interactive63.com)
//
// Talks to the mixing worker. Each request carries an id, and only the latest one can settle with a result, so a slow
// answer can never land on a newer target. A worker error or a request that runs past the timeout rejects and replaces
// the worker, since a stuck worker would otherwise hold every later request.
//
// Usage: const mixer = createMixClient(startMixWorker); const recipe = await mixer.mix(target, paintIds, null);
// The promise gives null when the request was cancelled or replaced by a newer one.
import type { Rgb } from '../colour/convert';
import type { Recipe } from '../colour/solver';

// How long a mix may run before it counts as stuck. Far above the slowest expected phone run.
export const MIX_TIMEOUT_MS = 30_000;

/** What the page sends to the worker. */
export interface MixRequest {
  id: number;
  target: Rgb;
  paintIds: readonly string[];
  maxPaints: number | null;
}

/** What the worker sends back. */
export interface MixReply {
  id: number;
  recipe: Recipe | null;
}

/** The part of Worker used here, which tests can fake. */
export interface MixWorker {
  onmessage: ((event: MessageEvent<MixReply>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(request: MixRequest): void;
  terminate(): void;
}

/** The running request. */
interface Pending {
  id: number;
  resolve: (recipe: Recipe | null) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** Mixing as the rest of the app sees it. */
export interface MixClient {
  mix(target: Rgb, paintIds: readonly string[], maxPaints: number | null): Promise<Recipe | null>;
  /** Abandons the running request, if any, which then gives null. */
  cancel(): void;
}

/** Starts the real worker. Vite bundles the file from this exact URL pattern. */
export function startMixWorker(): MixWorker {
  return new Worker(new URL('../worker/mix.worker.ts', import.meta.url), { type: 'module' }) as MixWorker;
}

/** Creates a client around a function that starts a worker, which runs on first use and after any failure. */
export function createMixClient(startWorker: () => MixWorker, timeoutMs: number = MIX_TIMEOUT_MS): MixClient {
  let worker: MixWorker | null = null;
  let pending: Pending | null = null;
  let nextId = 1;

  /** Clears the running request and returns it. */
  function takePending(): Pending | null {
    const taken = pending;
    if (taken) clearTimeout(taken.timer);
    pending = null;
    return taken;
  }

  /** Stops the worker and fails the running request. The next request starts a fresh worker. */
  function fail(message: string): void {
    worker?.terminate();
    worker = null;
    takePending()?.reject(new Error(message));
  }

  /** Returns the live worker, starting one if needed. */
  function liveWorker(): MixWorker {
    if (worker) return worker;
    const started = startWorker();
    started.onmessage = ({ data }) => {
      if (data.id === pending?.id) takePending()?.resolve(data.recipe);
    };
    started.onerror = () => fail('The mixing worker failed.');
    worker = started;
    return started;
  }

  return {
    mix(target, paintIds, maxPaints) {
      takePending()?.resolve(null);
      const id = nextId++;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => fail('The mix timed out.'), timeoutMs);
        pending = { id, resolve, reject, timer };
        liveWorker().postMessage({ id, target, paintIds: [...paintIds], maxPaints });
      });
    },
    cancel() {
      takePending()?.resolve(null);
    },
  };
}
