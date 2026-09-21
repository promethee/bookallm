import { describe, expect, it } from 'vitest';
import { createProgressTracker, toPullEvent } from './progress';

/** Lines captured from a real `POST /api/pull` on Ollama 0.34.0 (all parts already present). */
const REAL_PARTS = [
  {
    status: 'pulling f535f83ec568',
    digest: 'sha256:f535',
    total: 270885952,
    completed: 270885952,
  },
  {
    status: 'pulling fbacade46b4d',
    digest: 'sha256:fbac',
    total: 68,
    completed: 68,
  },
  {
    status: 'pulling d502d55c1d60',
    digest: 'sha256:d502',
    total: 675,
    completed: 675,
  },
  {
    status: 'pulling 58d1e17ffe51',
    digest: 'sha256:58d1',
    total: 11357,
    completed: 11357,
  },
  {
    status: 'pulling f02dd72bb242',
    digest: 'sha256:f02d',
    total: 59,
    completed: 59,
  },
  {
    status: 'pulling b0f58c4c1a3c',
    digest: 'sha256:b0f5',
    total: 561,
    completed: 561,
  },
];

describe('createProgressTracker', () => {
  it('starts in the preparing phase with no total', () => {
    const progress = createProgressTracker().update({
      status: 'pulling manifest',
    });

    expect(progress).toEqual({
      phase: 'preparing',
      completedBytes: 0,
      totalBytes: 0,
    });
    expect(progress.fraction).toBeUndefined();
  });

  it('sums completed and total bytes across parts', () => {
    const tracker = createProgressTracker();
    tracker.update({ status: 'pulling manifest' });

    tracker.update({
      status: 'pulling a',
      digest: 'a',
      total: 1000,
      completed: 250,
    });
    const progress = tracker.update({
      status: 'pulling b',
      digest: 'b',
      total: 500,
      completed: 250,
    });

    expect(progress).toEqual({
      phase: 'downloading',
      completedBytes: 500,
      totalBytes: 1500,
      fraction: 500 / 1500,
    });
  });

  it('replaces a part’s numbers when it reports again instead of adding them', () => {
    const tracker = createProgressTracker();
    tracker.update({ digest: 'a', total: 1000, completed: 100 });

    const progress = tracker.update({
      digest: 'a',
      total: 1000,
      completed: 600,
    });

    expect(progress).toMatchObject({
      completedBytes: 600,
      totalBytes: 1000,
      fraction: 0.6,
    });
  });

  it('reaches a fraction of 1 on a real complete pull', () => {
    const tracker = createProgressTracker();
    let last = tracker.update({ status: 'pulling manifest' });
    for (const line of REAL_PARTS) last = tracker.update(line);

    const total = REAL_PARTS.reduce((sum, part) => sum + part.total, 0);
    expect(last).toEqual({
      phase: 'downloading',
      completedBytes: total,
      totalBytes: total,
      fraction: 1,
    });
  });

  it('follows the phases of a real pull from start to done', () => {
    const tracker = createProgressTracker();
    const phases = [
      { status: 'pulling manifest' },
      REAL_PARTS[0],
      { status: 'verifying sha256 digest' },
      { status: 'writing manifest' },
      { status: 'success' },
    ].map((event) => tracker.update(event).phase);

    expect(phases).toEqual([
      'preparing',
      'downloading',
      'verifying',
      'finishing',
      'done',
    ]);
  });

  it('treats removing unused parts as finishing', () => {
    const tracker = createProgressTracker();

    expect(tracker.update({ status: 'removing any unused layers' }).phase).toBe(
      'finishing',
    );
  });

  it('keeps the previous phase for status text it does not recognise', () => {
    const tracker = createProgressTracker();
    tracker.update({ digest: 'a', total: 10, completed: 1 });

    const progress = tracker.update({
      status: 'some wording from a future Ollama',
    });

    expect(progress.phase).toBe('downloading');
    expect(progress.completedBytes).toBe(1);
  });

  it('can see the fraction fall when a new part appears, so it is not promised to rise', () => {
    const tracker = createProgressTracker();
    const first = tracker.update({ digest: 'a', total: 100, completed: 100 });

    const second = tracker.update({ digest: 'b', total: 100, completed: 0 });

    expect(first.fraction).toBe(1);
    expect(second.fraction).toBe(0.5);
  });

  it('never reports a fraction above 1', () => {
    const progress = createProgressTracker().update({
      digest: 'a',
      total: 10,
      completed: 12,
    });

    expect(progress.fraction).toBe(1);
  });

  it('reports progress on every line, so updates are frequent', () => {
    const tracker = createProgressTracker();
    const results = [1, 2, 3].map((n) =>
      tracker.update({ digest: 'a', total: 3, completed: n }),
    );

    expect(results.map((p) => p.completedBytes)).toEqual([1, 2, 3]);
  });
});

describe('toPullEvent', () => {
  it('picks the known fields', () => {
    expect(
      toPullEvent({
        status: 's',
        digest: 'd',
        total: 1,
        completed: 2,
        extra: true,
      }),
    ).toEqual({ status: 's', digest: 'd', total: 1, completed: 2 });
  });

  it('ignores fields of the wrong type', () => {
    expect(toPullEvent({ status: 5, total: '10', error: {} })).toEqual({});
  });

  it('rejects lines that are not objects', () => {
    expect(toPullEvent(null)).toBeUndefined();
    expect(toPullEvent('text')).toBeUndefined();
    expect(toPullEvent(7)).toBeUndefined();
  });
});
