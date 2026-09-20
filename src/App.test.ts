import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import App from './App.svelte';

describe('App', () => {
  it('renders the app name and the Ask mode disclosure', () => {
    render(App);

    expect(screen.getByRole('heading', { name: 'BookaLLM' })).toBeTruthy();
    expect(screen.getByText(/Ask mode/)).toBeTruthy();
  });
});
