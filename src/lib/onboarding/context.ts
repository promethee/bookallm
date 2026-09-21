import { getContext, setContext } from 'svelte';
import type { OnboardingController } from './controller.svelte';

/** The Svelte context key screens use to find the controller (tests use it too). */
export const CONTROLLER_KEY = Symbol('onboarding-controller');

export const setController = (controller: OnboardingController): void => {
  setContext(CONTROLLER_KEY, controller);
};

export const getController = (): OnboardingController =>
  getContext<OnboardingController>(CONTROLLER_KEY);
