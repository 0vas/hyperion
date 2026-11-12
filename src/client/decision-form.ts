import { t } from './i18n';
import type { Step } from '../domain/workflow';
import { matchesPort } from '../domain/value-types';
export type FormPort = NonNullable<Step['outputs']>[number];
export function fieldLabel(port: FormPort) {
  return (
    port.form?.label ||
    port.description ||
    port.name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ')
  );
}
export function parseField(port: FormPort, value: string): unknown {
  return port.type === 'string'
    ? value
    : port.type === 'number'
      ? Number(value)
      : JSON.parse(value);
}
/** Prefill amend drafts from saved typed outputs. */
export function draftFromOutputValues(step: Step): Record<string, string> {
  const saved = step.outputValues || {};
  const draft: Record<string, string> = {};
  for (const port of step.outputs || []) {
    if (!Object.hasOwn(saved, port.name)) continue;
    const value = saved[port.name];
    draft[port.name] =
      port.type === 'string'
        ? String(value ?? '')
        : port.type === 'boolean'
          ? value
            ? 'true'
            : 'false'
          : port.type === 'number'
            ? String(value)
            : JSON.stringify(value);
  }
  return draft;
}

export function fieldError(port: FormPort, value: string): string | undefined {
  if (!value.trim())
    return port.required
      ? port.type === 'boolean' || port.form?.options
        ? t('Elige una opción.')
        : t('Completa este campo.')
      : undefined;
  try {
    if (matchesPort(port, parseField(port, value))) return;
  } catch {
    /* Present a field-specific message below. */
  }
  if (port.form?.options) return t('Elige una de las opciones disponibles.');
  return port.type === 'number'
    ? t('Escribe un número válido.')
    : port.type === 'boolean'
      ? t('Elige Sí o No.')
      : port.type === 'array'
        ? t('Usa una lista válida entre corchetes [ ].')
        : t('Usa un objeto válido entre llaves { }.');
}
