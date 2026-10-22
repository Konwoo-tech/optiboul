import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDeconnexionAutomatique } from './inactivite.ts';

const surExpiration = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  surExpiration.mockReset();
});
afterEach(() => vi.useRealTimers());

const monter = (actif = true) =>
  renderHook(() => useDeconnexionAutomatique({ minutes: 1, actif, onExpire: surExpiration }));

describe('déconnexion automatique', () => {
  it('ne se déclenche pas avant la fin du délai', () => {
    monter();
    vi.advanceTimersByTime(50_000);
    expect(surExpiration).not.toHaveBeenCalled();
  });

  it('se déclenche une fois le délai dépassé, au contrôle suivant', () => {
    monter();
    vi.advanceTimersByTime(80_000);
    expect(surExpiration).toHaveBeenCalledTimes(1);
  });

  it('repart de zéro à chaque activité', () => {
    monter();
    vi.advanceTimersByTime(50_000);
    window.dispatchEvent(new Event('mousemove'));
    vi.advanceTimersByTime(50_000);
    expect(surExpiration).not.toHaveBeenCalled();
    for (const evenement of ['keydown', 'mousedown', 'touchstart']) {
      window.dispatchEvent(new Event(evenement));
    }
    vi.advanceTimersByTime(50_000);
    expect(surExpiration).not.toHaveBeenCalled();
  });

  it('ne fait rien quand il est inactif (personne n’est connecté)', () => {
    monter(false);
    vi.advanceTimersByTime(600_000);
    expect(surExpiration).not.toHaveBeenCalled();
  });

  it('se désabonne au démontage', () => {
    const { unmount } = monter();
    unmount();
    vi.advanceTimersByTime(600_000);
    expect(surExpiration).not.toHaveBeenCalled();
  });
});
