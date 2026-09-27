import { describe, expect, it, vi } from 'vitest';
import { configureTray, type TrayConfig } from './tray';

const CONFIG: TrayConfig = {
  closeToTray: true,
  showLabel: 'Show BookaLLM',
  quitLabel: 'Quit BookaLLM',
};

describe('configureTray', () => {
  it('does nothing in the browser build', async () => {
    const invoke = vi.fn();

    await configureTray(CONFIG, { isTauri: false, invoke });

    expect(invoke).not.toHaveBeenCalled();
  });

  it('sends the setting and menu text to the native side', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined);

    await configureTray(CONFIG, { isTauri: true, invoke });

    expect(invoke).toHaveBeenCalledWith('configure_tray', {
      closeToTray: true,
      showLabel: 'Show BookaLLM',
      quitLabel: 'Quit BookaLLM',
    });
  });

  it('never throws when the native side fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const invoke = vi.fn().mockRejectedValue(new Error('no tray'));

    await expect(
      configureTray(CONFIG, { isTauri: true, invoke }),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
