// Developed by Interactive 63 (https://interactive63.com)
//
// Tests the worker client with a fake worker: stale replies are ignored, and failures reject and replace the worker.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMixClient, type MixReply, type MixRequest, type MixWorker } from '../../src/app/mixer';
import type { Recipe } from '../../src/colour/solver';

const TARGET = { r: 1, g: 2, b: 3 };
const TIMEOUT_MS = 1000;

/** A stand-in recipe, told apart by its score. */
function recipe(deltaE2000: number): Recipe {
  return { deltaE2000 } as Recipe;
}

/** A worker that records requests and lets a test reply by hand. */
class FakeWorker implements MixWorker {
  onmessage: MixWorker['onmessage'] = null;
  onerror: MixWorker['onerror'] = null;
  requests: MixRequest[] = [];
  terminated = false;

  postMessage(request: MixRequest): void {
    this.requests.push(request);
  }

  terminate(): void {
    this.terminated = true;
  }

  /** Delivers a reply to the client. */
  reply(id: number, result: Recipe | null): void {
    this.onmessage?.({ data: { id, recipe: result } } as MessageEvent<MixReply>);
  }
}

/** Builds a client and keeps every worker it starts. */
function setUp() {
  const workers: FakeWorker[] = [];
  const client = createMixClient(() => {
    const worker = new FakeWorker();
    workers.push(worker);
    return worker;
  }, TIMEOUT_MS);
  return { client, workers };
}

/** The most recent request sent to a worker. */
function lastRequest(worker: FakeWorker | undefined): MixRequest {
  const request = worker?.requests.at(-1);
  if (!request) throw new Error('No request was sent.');
  return request;
}

describe('createMixClient', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts one worker and resolves with its reply', async () => {
    const { client, workers } = setUp();
    const result = client.mix(TARGET, ['white'], 2);
    expect(lastRequest(workers[0])).toMatchObject({ target: TARGET, paintIds: ['white'], maxPaints: 2 });
    workers[0]?.reply(lastRequest(workers[0]).id, recipe(1));
    await expect(result).resolves.toEqual(recipe(1));
    client.mix(TARGET, ['white'], null);
    expect(workers).toHaveLength(1);
    client.cancel();
  });

  it('gives null to a replaced request and ignores its late reply', async () => {
    const { client, workers } = setUp();
    const first = client.mix(TARGET, ['white'], null);
    const firstId = lastRequest(workers[0]).id;
    const second = client.mix(TARGET, ['black'], null);
    await expect(first).resolves.toBeNull();

    workers[0]?.reply(firstId, recipe(1));
    let settled = false;
    void second.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    workers[0]?.reply(lastRequest(workers[0]).id, recipe(2));
    await expect(second).resolves.toEqual(recipe(2));
  });

  it('gives null when cancelled, and ignores the late reply', async () => {
    const { client, workers } = setUp();
    const result = client.mix(TARGET, ['white'], null);
    client.cancel();
    await expect(result).resolves.toBeNull();
    workers[0]?.reply(lastRequest(workers[0]).id, recipe(1));
  });

  it('rejects on timeout and starts a fresh worker for the next request', async () => {
    const { client, workers } = setUp();
    const result = client.mix(TARGET, ['white'], null);
    vi.advanceTimersByTime(TIMEOUT_MS);
    await expect(result).rejects.toThrow('timed out');
    expect(workers[0]?.terminated).toBe(true);

    const next = client.mix(TARGET, ['white'], null);
    expect(workers).toHaveLength(2);
    workers[1]?.reply(lastRequest(workers[1]).id, recipe(3));
    await expect(next).resolves.toEqual(recipe(3));
  });

  it('does not time out after a reply', async () => {
    const { client, workers } = setUp();
    const result = client.mix(TARGET, ['white'], null);
    workers[0]?.reply(lastRequest(workers[0]).id, recipe(1));
    await result;
    vi.advanceTimersByTime(TIMEOUT_MS);
    expect(workers[0]?.terminated).toBe(false);
  });

  it('rejects on a worker error and restarts', async () => {
    const { client, workers } = setUp();
    const result = client.mix(TARGET, ['white'], null);
    workers[0]?.onerror?.({} as ErrorEvent);
    await expect(result).rejects.toThrow('worker failed');
    expect(workers[0]?.terminated).toBe(true);
    client.mix(TARGET, ['white'], null);
    expect(workers).toHaveLength(2);
    client.cancel();
  });
});
