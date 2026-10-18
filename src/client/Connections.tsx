import { useCallback, useEffect, useState } from 'react';
import { Bot, Code2, Orbit, Sparkles, Terminal } from 'lucide-react';
import { t, useLocale } from './i18n';

const CLIENT_ICONS: Record<string, typeof Bot> = {
  codex: Terminal,
  cursor: Code2,
  'claude-desktop': Sparkles,
  'claude-code': Sparkles,
  antigravity: Orbit,
  chatgpt: Bot,
  hermes: Bot,
};

function ClientMark({ id }: { id: string }) {
  const Icon = CLIENT_ICONS[id] || Bot;
  return (
    <span className="connection-client-mark" aria-hidden="true">
      <Icon size={28} strokeWidth={1.6} />
    </span>
  );
}

export type ConnectionStatusId =
  'configured' | 'missing' | 'conflict' | 'unknown';

export type ConnectionEntryPreview = {
  command?: string;
  args?: string[];
  cwd?: string;
  url?: string;
  type?: string;
  envKeys?: string[];
  envPreview?: Record<string, string>;
  skillPath?: string;
  owner?: string;
};

export type ConnectionRow = {
  id: string;
  name: string;
  status: ConnectionStatusId;
  path?: string;
  detail?: string;
  existing?: ConnectionEntryPreview;
  expected?: ConnectionEntryPreview;
};

export type ConnectionInventory = {
  version: string;
  channel: string;
  serviceUrl: string;
  integrations: ConnectionRow[];
  summary: { configured: number; conflicts: number; total: number };
};

const STATUS_LABEL: Record<ConnectionStatusId, string> = {
  configured: 'Configurada',
  missing: 'Sin configurar',
  conflict: 'Conflicto · no sobrescrita',
  unknown: 'No se pudo comprobar',
};

const PREVIEW_FIELDS: {
  key: keyof ConnectionEntryPreview;
  label: string;
}[] = [
  { key: 'type', label: 'type' },
  { key: 'command', label: 'command' },
  { key: 'args', label: 'args' },
  { key: 'cwd', label: 'cwd' },
  { key: 'url', label: 'url' },
  { key: 'envKeys', label: 'env' },
  { key: 'skillPath', label: 'skill' },
  { key: 'owner', label: 'owner' },
];

export function connectionsSummaryLine(summary: {
  configured: number;
  conflicts: number;
  total: number;
}) {
  if (summary.conflicts > 0 && summary.configured > 0)
    return t('{0} listas · {1} en conflicto', {
      0: summary.configured,
      1: summary.conflicts,
    });
  if (summary.conflicts > 0)
    return t('{0} en conflicto — Hyperion no sobrescribió esas entradas.', {
      0: summary.conflicts,
    });
  if (summary.configured === 0)
    return t('Ninguna aplicación tiene Hyperion configurado todavía.');
  if (summary.configured === summary.total)
    return t('Las {0} integraciones conocidas están configuradas.', {
      0: summary.configured,
    });
  return t(
    '{0} de {1} aplicaciones listas. Reinicia el cliente y abre un chat nuevo para cargar herramientas.',
    { 0: summary.configured, 1: summary.total },
  );
}

function truncatePath(path: string) {
  if (path.length <= 42) return path;
  return `${path.slice(0, 18)}…${path.slice(-18)}`;
}

function formatPreviewValue(
  entry: ConnectionEntryPreview | undefined,
  key: keyof ConnectionEntryPreview,
): string {
  if (!entry) return '—';
  const value = entry[key];
  if (value === undefined || value === '') return '—';
  if (key === 'args' && Array.isArray(value)) return value.join(' ');
  if (key === 'envKeys' && Array.isArray(value)) {
    const preview = entry.envPreview || {};
    return value
      .map((name) =>
        preview[name] !== undefined ? `${name}=${preview[name]}` : name,
      )
      .join(', ');
  }
  return String(value);
}

function fieldDiffers(
  existing: ConnectionEntryPreview | undefined,
  expected: ConnectionEntryPreview | undefined,
  key: keyof ConnectionEntryPreview,
): boolean {
  return (
    JSON.stringify(existing?.[key] ?? null) !==
    JSON.stringify(expected?.[key] ?? null)
  );
}

async function fetchInventory(
  signal?: AbortSignal,
): Promise<ConnectionInventory> {
  const res = await fetch('/api/connections', { signal });
  const body = await res.json();
  if (!res.ok)
    throw new Error(body.message || t('No se pudo completar la solicitud.'));
  return body as ConnectionInventory;
}

export function useConnectionInventory(enabled: boolean) {
  const [inventory, setInventory] = useState<ConnectionInventory | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      setInventory(await fetchInventory());
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t('No se pudo completar la solicitud.'),
      );
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void fetchInventory(controller.signal)
      .then(setInventory)
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(
          err instanceof Error
            ? err.message
            : t('No se pudo completar la solicitud.'),
        );
      });
    return () => controller.abort();
  }, [enabled]);
  return { inventory, error, busy, refresh, setInventory };
}

function calVerLabel(inventory: ConnectionInventory | null) {
  if (!inventory?.version) return '';
  return t('Hyperion {0} UTC · {1}', {
    0: inventory.version,
    1: inventory.channel || 'preview',
  });
}

export function ConflictResolverBody({
  row,
  onReplace,
  onCopyPath,
  onGuide,
  onClose,
}: {
  row: ConnectionRow;
  onReplace: () => void;
  onCopyPath: () => void;
  onGuide: () => void;
  onClose: () => void;
}) {
  useLocale();
  const fields = PREVIEW_FIELDS.filter(
    (field) =>
      row.existing?.[field.key] !== undefined ||
      row.expected?.[field.key] !== undefined,
  );
  return (
    <>
      <h2 id="conflict-title">{t('Conflicto en {0}', { 0: row.name })}</h2>
      <p>
        {t('Ya existe otra conexión Hyperion en {0}. No se sobrescribió.', {
          0: row.name,
        })}
      </p>
      {row.path && (
        <p className="muted">{t('Archivo: {0}', { 0: row.path })}</p>
      )}
      {fields.length > 0 && (
        <div className="conflict-compare">
          <div className="conflict-compare-col">
            <h3>{t('Entrada actual')}</h3>
            <dl>
              {fields.map((field) => (
                <div
                  key={`current-${field.key}`}
                  className={
                    fieldDiffers(row.existing, row.expected, field.key)
                      ? 'is-diff'
                      : undefined
                  }
                >
                  <dt>{field.label}</dt>
                  <dd>{formatPreviewValue(row.existing, field.key)}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="conflict-compare-col">
            <h3>{t('Entrada esperada')}</h3>
            <dl>
              {fields.map((field) => (
                <div
                  key={`expected-${field.key}`}
                  className={
                    fieldDiffers(row.existing, row.expected, field.key)
                      ? 'is-diff'
                      : undefined
                  }
                >
                  <dt>{field.label}</dt>
                  <dd>{formatPreviewValue(row.expected, field.key)}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}
      {fields.some((field) =>
        fieldDiffers(row.existing, row.expected, field.key),
      ) && (
        <p className="muted conflict-diff-note">{t('Campos que difieren')}</p>
      )}
      <p className="muted">
        {t(
          'Se creará un respaldo del archivo antes de escribir la entrada Hyperion esperada.',
        )}
      </p>
      <div className="modal-actions">
        <button type="button" className="primary" onClick={onReplace}>
          {t('Reemplazar conexión')}
        </button>
        {row.path && (
          <button type="button" className="secondary" onClick={onCopyPath}>
            {t('Copiar ruta')}
          </button>
        )}
        <button type="button" className="ghost-button" onClick={onGuide}>
          {t('Abrir guía')}
        </button>
        <button type="button" className="ghost-button" onClick={onClose}>
          {t('Cerrar')}
        </button>
      </div>
    </>
  );
}

export function ConnectionsView({
  online,
  inventory,
  error,
  busy,
  onClose,
  onRefresh,
  onSetup,
  onConflict,
  onHelp,
  onConnectAi,
}: {
  online: boolean;
  inventory: ConnectionInventory | null;
  error: string;
  busy: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onSetup: (clientId: string) => void;
  onConflict: (row: ConnectionRow) => void;
  onHelp: () => void;
  onConnectAi: () => void;
}) {
  useLocale();
  const [copied, setCopied] = useState('');
  async function copyPath(path: string) {
    try {
      await navigator.clipboard.writeText(path);
      setCopied(path);
      window.setTimeout(() => setCopied(''), 2000);
    } catch {
      setCopied('');
    }
  }
  const version = calVerLabel(inventory);
  const serviceHost = inventory?.serviceUrl
    ? inventory.serviceUrl.replace(/^https?:\/\//, '')
    : '';
  return (
    <div className="connections-view">
      <header className="connections-identity">
        <div>
          <span className="eyebrow">{t('CONEXIONES')}</span>
          <h2 id="popup-title">{t('Conexiones')}</h2>
          {version ? (
            <p className="connections-calver" title={t('Versión de Hyperion')}>
              <span className="form-sr-only">{t('Versión de Hyperion')}: </span>
              {version}
            </p>
          ) : (
            <p className="connections-calver muted">…</p>
          )}
        </div>
        <div className="connections-identity-actions">
          <button
            type="button"
            className="ghost-button"
            disabled={busy}
            onClick={onRefresh}
          >
            {t('Volver a comprobar')}
          </button>
          <button type="button" className="ghost-button" onClick={onClose}>
            {t('Volver al canvas')}
          </button>
        </div>
      </header>

      <div className="connection-service-strip">
        <div>
          <strong>
            <span
              className={`connection-online-dot${online ? '' : ' is-offline'}`}
              aria-hidden="true"
            />
            {t('Servicio local')}
          </strong>
          <p>
            {online ? t('Conectado') : t('Sin conexión')}
            {serviceHost ? ` · ${serviceHost}` : ''}
          </p>
          <p className="muted connection-honesty">
            {t(
              'El servicio local responde en este equipo. No indica qué aplicación de IA está en uso.',
            )}
          </p>
        </div>
        <span
          className={`connection-status-badge ${online ? 'is-online' : 'is-offline'}`}
        >
          {online ? t('Conectado') : t('Sin conexión')}
        </span>
      </div>

      <section className="connections-hero" aria-live="polite">
        <span className="eyebrow">{t('Tus aplicaciones de IA')}</span>
        <p className="connections-summary">
          {inventory
            ? connectionsSummaryLine(inventory.summary)
            : busy
              ? '…'
              : t('Ninguna aplicación tiene Hyperion configurado todavía.')}
        </p>
        <p className="muted">
          {t(
            'Hyperion prepara la entrada local en cada aplicación. «Configurada» no significa que un chat abierto ya haya cargado las herramientas.',
          )}
        </p>
        <button type="button" className="primary" onClick={onConnectAi}>
          {t('Conectar con mi IA…')}
        </button>
      </section>

      <ul className="connection-card-grid" aria-live="polite">
        {(inventory?.integrations || []).map((row) => (
          <li key={row.id} className={`connection-card status-${row.status}`}>
            <div className="connection-card-head">
              <div className="connection-card-title">
                <ClientMark id={row.id} />
                <strong>{row.name}</strong>
              </div>
              <span className={`connection-status-badge status-${row.status}`}>
                {t(STATUS_LABEL[row.status])}
              </span>
            </div>
            {row.path ? (
              <p className="connection-path" title={row.path}>
                <span className="eyebrow">{t('Archivo de configuración')}</span>
                {truncatePath(row.path)}
              </p>
            ) : (
              <p className="connection-path muted">{t('Ruta no disponible')}</p>
            )}
            {row.status === 'conflict' && row.detail && (
              <p className="connection-conflict-note">{row.detail}</p>
            )}
            <div className="connection-row-actions">
              {row.status === 'missing' && (
                <button
                  type="button"
                  className="primary"
                  onClick={() => onSetup(row.id)}
                >
                  {t('Configurar…')}
                </button>
              )}
              {row.status === 'configured' && row.path && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => void copyPath(row.path!)}
                >
                  {copied === row.path ? t('Ruta copiada') : t('Copiar ruta')}
                </button>
              )}
              {row.status === 'configured' && (
                <button
                  type="button"
                  className="ghost-button"
                  onClick={onRefresh}
                >
                  {t('Volver a comprobar')}
                </button>
              )}
              {row.status === 'conflict' && (
                <button
                  type="button"
                  className="primary"
                  onClick={() => onConflict(row)}
                >
                  {t('Resolver conflicto…')}
                </button>
              )}
              {row.status === 'conflict' && row.path && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => void copyPath(row.path!)}
                >
                  {copied === row.path ? t('Ruta copiada') : t('Copiar ruta')}
                </button>
              )}
              {row.status === 'unknown' && (
                <button type="button" className="primary" onClick={onRefresh}>
                  {t('Reintentar comprobación')}
                </button>
              )}
              {row.status === 'unknown' && row.path && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => void copyPath(row.path!)}
                >
                  {copied === row.path ? t('Ruta copiada') : t('Copiar ruta')}
                </button>
              )}
              <button type="button" className="ghost-button" onClick={onHelp}>
                {row.status === 'conflict' ? t('Guía') : t('Ayuda')}
              </button>
            </div>
          </li>
        ))}
      </ul>

      <p className="muted connections-footer-note">
        {t(
          'Hyperion no sobrescribe una entrada distinta. Si hay conflicto, resuélvelo en el cliente o retira la entrada antigua y vuelve a conectar.',
        )}
      </p>
      {error && (
        <p role="alert" className="popup-error">
          {error}
        </p>
      )}
      {version && (
        <footer
          className="connections-calver-footer"
          title={t('Versión de Hyperion')}
        >
          {version}
          {' · MIT'}
        </footer>
      )}
    </div>
  );
}
