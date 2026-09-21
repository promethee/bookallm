import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import App from './App.svelte';
import { bookOf, harness, READY } from './lib/onboarding/testing/harness';

describe('the app shell', () => {
  it('shows the language choice on the first launch and puts focus on its heading', async () => {
    const { services } = await harness(READY);

    render(App, { props: { services } });

    const heading = await screen.findByRole('heading', {
      level: 1,
      name: 'Choose your language',
    });
    expect(document.activeElement).toBe(heading);
  });

  it('preselects French and speaks French when the system prefers French', async () => {
    const { services } = await harness(READY, { systemLanguages: ['fr-FR'] });

    render(App, { props: { services } });

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Choisissez votre langue',
      }),
    ).toBeTruthy();
    expect(
      (screen.getByRole('radio', { name: 'Français' }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    expect(screen.getByRole('button', { name: 'Continuer' })).toBeTruthy();
  });

  it('keeps a language control visible on every screen', async () => {
    const first = await harness(READY);
    const { unmount } = render(App, { props: { services: first.services } });
    await screen.findByRole('heading', {
      level: 1,
      name: 'Choose your language',
    });
    expect(screen.getByLabelText('Language')).toBeTruthy();
    unmount();

    const returning = await harness(READY, {
      language: 'en',
      books: [await bookOf('Candide')],
    });
    render(App, { props: { services: returning.services } });
    await screen.findByRole('heading', { level: 1, name: 'BookaLLM' });
    expect(screen.getByLabelText('Language')).toBeTruthy();
  });

  it('switches every visible text at once when the language control changes', async () => {
    const { services } = await harness(READY, {
      language: 'en',
      books: [await bookOf('Candide')],
    });
    render(App, { props: { services } });
    await screen.findByText('Ask mode — answers are cited, check them');

    await fireEvent.change(screen.getByLabelText('Language'), {
      target: { value: 'fr' },
    });

    expect(
      screen.getByText(
        'Mode Question — les réponses sont citées, vérifiez-les',
      ),
    ).toBeTruthy();
    expect(screen.getByLabelText('Langue')).toBeTruthy();
    expect(
      screen.queryByText('Ask mode — answers are cited, check them'),
    ).toBeNull();
  });

  it('moves focus to the new screen’s heading when the screen changes', async () => {
    const { services } = await harness(READY, {
      language: 'en',
      books: [await bookOf('Candide')],
    });
    render(App, { props: { services } });
    await screen.findByRole('heading', { level: 1, name: 'BookaLLM' });

    await fireEvent.click(
      screen.getByRole('button', { name: 'Import a book' }),
    );

    const heading = await screen.findByRole('heading', {
      level: 1,
      name: 'Add a book',
    });
    expect(document.activeElement).toBe(heading);
  });

  it('has exactly one main heading on each screen', async () => {
    const { services } = await harness(READY, {
      language: 'en',
      books: [await bookOf('Candide')],
    });
    render(App, { props: { services } });
    await screen.findByRole('heading', { level: 1, name: 'BookaLLM' });

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('uses native controls that the keyboard can reach', async () => {
    const { services } = await harness(READY);
    render(App, { props: { services } });
    await screen.findByRole('heading', {
      level: 1,
      name: 'Choose your language',
    });

    const controls = [
      screen.getByLabelText('Language'),
      screen.getByRole('radio', { name: 'English' }),
      screen.getByRole('radio', { name: 'Français' }),
      screen.getByRole('button', { name: 'Continue' }),
    ];

    for (const control of controls)
      expect(control.tabIndex).toBeGreaterThanOrEqual(0);
  });

  it('tells the reader plainly when nothing can be remembered', async () => {
    const { services } = await harness(READY);
    services.storage.booksProblem = 'unavailable';

    render(App, { props: { services } });

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('will be forgotten');
  });

  it('tells the reader in French when storage is full', async () => {
    const { services, settings } = await harness(READY, {
      language: 'fr',
      books: [await bookOf('Candide')],
    });
    settings.problem = () => 'full';

    render(App, { props: { services } });

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('pas assez de place');
  });
});
