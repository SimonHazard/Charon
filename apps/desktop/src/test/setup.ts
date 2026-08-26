import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

const mediaQueries = new Map<string, boolean>();
const mediaQueryLists = new Map<
  string,
  Set<{ matches: boolean; listeners: Set<EventListenerOrEventListenerObject> }>
>();

export function setMediaQuery(query: string, matches: boolean) {
  mediaQueries.set(query, matches);
  for (const list of mediaQueryLists.get(query) ?? []) {
    list.matches = matches;
    const event = new Event('change');
    for (const listener of list.listeners) {
      if (typeof listener === 'function') listener(event);
      else listener.handleEvent(event);
    }
  }
}

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: (query: string) => {
    const state = {
      matches: mediaQueries.get(query) ?? false,
      listeners: new Set<EventListenerOrEventListenerObject>(),
    };
    const lists = mediaQueryLists.get(query) ?? new Set();
    lists.add(state);
    mediaQueryLists.set(query, lists);
    return {
      get matches() {
        return state.matches;
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) =>
        state.listeners.add(listener),
      removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject) =>
        state.listeners.delete(listener),
      addListener: (listener: EventListenerOrEventListenerObject) => state.listeners.add(listener),
      removeListener: (listener: EventListenerOrEventListenerObject) =>
        state.listeners.delete(listener),
      dispatchEvent: (event: Event) => {
        for (const listener of state.listeners) {
          if (typeof listener === 'function') listener(event);
          else listener.handleEvent(event);
        }
        return true;
      },
    };
  },
});

HTMLElement.prototype.scrollTo = () => undefined;

afterEach(() => {
  cleanup();
  localStorage.clear();
  for (const query of mediaQueries.keys()) setMediaQuery(query, false);
  mediaQueries.clear();
});
