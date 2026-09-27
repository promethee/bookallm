import { describe, expect, it } from 'vitest';
import {
  IDLE_UNLOAD_CHOICES,
  IDLE_UNLOAD_DEFAULT,
  isIdleUnload,
  keepAliveFor,
} from './defaults';

describe('the idle unload choices', () => {
  it('offers 5, 10 and 30 minutes, and never', () => {
    expect(IDLE_UNLOAD_CHOICES).toEqual([5, 10, 30, 'never']);
  });

  it('defaults to 10 minutes', () => {
    expect(IDLE_UNLOAD_DEFAULT).toBe(10);
  });

  it.each([5, 10, 30, 'never'])('accepts %j', (value) => {
    expect(isIdleUnload(value)).toBe(true);
  });

  it.each([0, 15, '10', '10m', -1, null, undefined, 'Never'])(
    'rejects %j',
    (value) => {
      expect(isIdleUnload(value)).toBe(false);
    },
  );
});

describe('keepAliveFor', () => {
  it.each([
    [5, '5m'],
    [10, '10m'],
    [30, '30m'],
  ] as const)('sends %i minutes as %j', (minutes, keepAlive) => {
    expect(keepAliveFor(minutes)).toBe(keepAlive);
  });

  it('keeps the model with no time limit for "never"', () => {
    expect(keepAliveFor('never')).toBe(-1);
  });

  it('uses the default when no choice was saved', () => {
    expect(keepAliveFor(undefined)).toBe('10m');
  });
});
