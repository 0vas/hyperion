import { useSyncExternalStore } from 'react';
import {
  resolveLocale,
  translate,
  validPreference,
  type LanguagePreference,
  type Locale,
} from '../i18n/core';
export { languages, type LanguagePreference } from '../i18n/core';
const key = 'hyperion.language.v1';
const listeners = new Set<() => void>();
let preference: LanguagePreference = 'system';
let desktopLocale: Locale | undefined;
try {
  const saved = globalThis.localStorage?.getItem(key);
  if (validPreference(saved)) preference = saved;
} catch {
  /* Storage can be unavailable in private windows. */
}
export const getLanguagePreference = () => preference;
export const getLocale = () =>
  (preference === 'system' && desktopLocale) ||
  resolveLocale(
    preference,
    typeof window === 'undefined' ? ['es'] : navigator.languages,
  );
export const t = (message: string, values?: Record<string, string | number>) =>
  translate(getLocale(), message, values);
export function localizedLabels<T extends Record<string, string>>(
  source: T,
): T {
  return Object.defineProperties(
    {},
    Object.fromEntries(
      Object.entries(source).map(([key, value]) => [
        key,
        { enumerable: true, get: () => t(value) },
      ]),
    ),
  ) as T;
}
function notify() {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = getLocale();
    document.title = t('Hyperion — Tu trabajo, paso a paso');
  }
  listeners.forEach((listener) => listener());
}
function apply(preferenceValue: LanguagePreference) {
  preference = preferenceValue;
  try {
    globalThis.localStorage?.setItem(key, preference);
  } catch {
    /* Keep the session preference. */
  }
  notify();
}
export async function setLanguagePreference(value: LanguagePreference) {
  if (!validPreference(value)) return;
  const bridge =
    typeof window === 'undefined' ? undefined : window.hyperionDesktop;
  // Desktop persists first so a failed write cannot silently diverge from its menus.
  if (bridge) await bridge.setLanguage(value);
  apply(value);
}
export function useLocale() {
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => `${preference}:${getLocale()}`,
  );
  return getLocale();
}
type LanguageSnapshot = { preference: LanguagePreference; locale: Locale };
export async function initializeLanguage() {
  const receive = (value: LanguageSnapshot) => {
    if (
      validPreference(value.preference) &&
      (value.locale === 'es' || value.locale === 'en')
    ) {
      desktopLocale = value.locale;
      apply(value.preference);
    }
  };
  window.addEventListener('languagechange', notify);
  window.addEventListener('storage', (event) => {
    if (!window.hyperionDesktop && event.key === key) {
      preference = validPreference(event.newValue) ? event.newValue : 'system';
      notify();
    }
  });
  try {
    if (window.hyperionDesktop) {
      window.hyperionDesktop.onLanguageChanged(receive);
      receive(await window.hyperionDesktop.getLanguage());
    }
  } finally {
    notify();
  }
}
declare global {
  interface Window {
    hyperionDesktop?: {
      getLanguage(): Promise<LanguageSnapshot>;
      setLanguage(value: LanguagePreference): Promise<void>;
      onLanguageChanged(callback: (value: LanguageSnapshot) => void): void;
      checkForUpdates?(): Promise<void>;
      /** Host-configured connectorSchema object for outbound Enviar; never invent in UI. */
      resumeConnector?: unknown;
    };
  }
}
