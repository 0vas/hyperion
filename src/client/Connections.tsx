import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  ArrowLeft,
  Bot,
  ChevronDown,
  CircleHelp,
  Code2,
  Copy,
  Orbit,
  RefreshCw,
  Sparkles,
  Terminal,
  TriangleAlert,
} from 'lucide-react';
import { RELEASE_CHANNEL, VERSION } from '../version';
import type {
  OwnedRuntimePreflight,
  RuntimeFileCode,
} from '../adapters/connection-runtime';
import { t, useLocale } from './i18n';
import {
  connectionMessage,
  describeConnectionMessage,
  formatConnectionMessage,
  type ConnectionMessage,
} from './connection-messages';

const CLIENT_ICONS: Record<string, typeof Bot> = {
  codex: Terminal,
  cursor: Code2,
  'claude-desktop': Sparkles,
  'claude-code': Terminal,
  antigravity: Orbit,
  chatgpt: Bot,
  hermes: Bot,
};

function ClientMark({ id }: { id: string }) {
  const Icon = CLIENT_ICONS[id] || Bot;
  return (
    <span className="connection-client-mark" aria-hidden="true">
      <Icon size={20} strokeWidth={1.75} />
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
  runtimePreflight?: OwnedRuntimePreflight;
  integrations: ConnectionRow[];
  summary: { configured: number; conflicts: number; total: number };
};

const STATUS_LABEL: Record<ConnectionStatusId, string> = {
  configured: 'Configurada localmente',
  missing: 'Sin configurar',
  conflict: 'Conflicto',
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
  return t('Configuradas localmente: {0}/{1}', {
    0: summary.configured,
    1: summary.total,
  });
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
    formatPreviewValue(existing, key) !== formatPreviewValue(expected, key)
  );
}

async function fetchInventory(
  signal?: AbortSignal,
): Promise<ConnectionInventory> {
  const res = await fetch('/api/connections', { signal });
  const body = await res.json();
  if (!res.ok)
    throw new Error(body.message || 'No se pudo completar la solicitud.');
  return body as ConnectionInventory;
}

export function useConnectionInventory(enabled: boolean) {
  const [inventory, setInventory] = useState<ConnectionInventory | null>(null);
  const [error, setError] = useState<ConnectionMessage | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setInventory(await fetchInventory());
    } catch (err) {
      setError(
        err instanceof Error
          ? describeConnectionMessage(err.message)
          : connectionMessage('requestFailed'),
      );
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    if (!enabled) {
      setBusy(false);
      return;
    }
    const controller = new AbortController();
    setBusy(true);
    setError(null);
    void fetchInventory(controller.signal)
      .then(setInventory)
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(
          err instanceof Error
            ? describeConnectionMessage(err.message)
            : connectionMessage('requestFailed'),
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [enabled]);
  return { inventory, error, busy, refresh, setInventory };
}

function calVerLabel(inventory: ConnectionInventory | null) {
  return t('Hyperion {0} UTC · {1}', {
    0: inventory?.version || VERSION,
    1: inventory?.channel || RELEASE_CHANNEL,
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
          'Se creará un respaldo del archivo antes de escribir la entrada Hyperion esperada. Se conservarán los demás servidores MCP.',
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

const FILE_LABELS: Record<RuntimeFileCode, string> = {
  readable_file: 'Archivo legible',
  missing: 'Archivo no encontrado',
  not_regular_file: 'No es un archivo normal',
  read_denied: 'Hyperion no pudo leerlo por permisos',
  check_failed: 'No se pudo comprobar',
};
const RUNTIME_TARGETS = [
  { key: 'executable', label: 'Ejecutable de Hyperion' },
  { key: 'launcher', label: 'Lanzador MCP' },
] as const;

function fileCode(value: string | undefined): RuntimeFileCode {
  return value && Object.hasOwn(FILE_LABELS, value)
    ? (value as RuntimeFileCode)
    : 'check_failed';
}

function ConnectionAppRow({
  row,
  expanded,
  onToggle,
  busy,
  onRefresh,
  onSetup,
  onConflict,
  onHelp,
}: {
  row: ConnectionRow;
  expanded: boolean;
  onToggle: () => void;
  busy: boolean;
  onRefresh: () => void;
  onSetup: (id: string) => void;
  onConflict: (row: ConnectionRow) => void;
  onHelp: () => void;
}) {
  const [copyResult, setCopyResult] = useState<{
    path: string;
    status: 'success' | 'error';
  }>();
  const detailId = useId();
  const toggle = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (expanded) toggle.current?.scrollIntoView({ block: 'nearest' });
  }, [expanded]);
  async function copyPath() {
    setCopyResult(undefined);
    const path = row.path!;
    try {
      await navigator.clipboard.writeText(path);
      setCopyResult({ path, status: 'success' });
    } catch {
      setCopyResult({ path, status: 'error' });
    }
  }
  const action =
    row.status === 'configured'
      ? onHelp
      : row.status === 'missing'
        ? () => onSetup(row.id)
        : row.status === 'conflict'
          ? () => onConflict(row)
          : onRefresh;
  const label =
    row.status === 'configured'
      ? 'Ayuda de conexión'
      : row.status === 'missing'
        ? 'Configurar…'
        : row.status === 'conflict'
          ? 'Resolver conflicto…'
          : 'Comprobar';
  const subtype =
    row.id === 'claude-desktop'
      ? 'Aplicación de escritorio'
      : row.id === 'claude-code'
        ? 'Herramienta de desarrollo'
        : '';
  const message = row.detail ? describeConnectionMessage(row.detail) : null;
  const explanations = {
    configured:
      'La configuración local de {0} coincide con la esperada. No confirma que el chat tenga herramientas.',
    missing: 'No se encontró una conexión Hyperion configurada para {0}.',
    conflict:
      'La entrada de Hyperion existente es distinta. Se conserva sin cambios.',
    unknown: 'No se pudo comprobar la configuración local de {0}.',
  };
  return (
    <li
      className={`connection-row status-${row.status}`}
      data-client-id={row.id}
    >
      <button
        type="button"
        className="connection-row-toggle"
        ref={toggle}
        aria-expanded={expanded}
        aria-controls={detailId}
        onClick={onToggle}
      >
        <ClientMark id={row.id} />
        <span className="connection-row-label">
          <strong>{row.name}</strong>
          <span className={`connection-status status-${row.status}`}>
            {row.status === 'conflict' && (
              <TriangleAlert size={14} strokeWidth={1.75} aria-hidden="true" />
            )}
            {t(
              row.status === 'conflict'
                ? 'Conflicto · sin cambios'
                : STATUS_LABEL[row.status],
            )}
          </span>
        </span>
        <ChevronDown
          className="connection-row-chevron"
          size={16}
          strokeWidth={1.75}
          aria-hidden="true"
        />
      </button>
      <div className="connection-app-details" id={detailId} hidden={!expanded}>
        {subtype && <p className="connection-subtype">{t(subtype)}</p>}
        <p className="connection-explanation">
          {message?.kind === 'product'
            ? formatConnectionMessage(message)
            : t(explanations[row.status], { 0: row.name })}
        </p>
        <div className="connection-row-actions">
          <button
            type="button"
            className={`connection-main-action ${row.status === 'configured' ? 'secondary' : 'primary'}`}
            disabled={busy && row.status !== 'configured'}
            onClick={action}
          >
            {t(label)}
          </button>
          <button
            type="button"
            className="ghost-button"
            disabled={busy && row.status === 'configured'}
            onClick={row.status === 'configured' ? onRefresh : onHelp}
          >
            {t(row.status === 'configured' ? 'Comprobar' : 'Ayuda de conexión')}
          </button>
        </div>
        {row.path ? (
          <>
            <span className="connection-detail-label">{t('Ruta local')}</span>
            <p className="connection-path">{row.path}</p>
            <button
              type="button"
              className="ghost-button"
              onClick={() => void copyPath()}
            >
              <Copy size={16} strokeWidth={1.75} aria-hidden="true" />
              {t('Copiar ruta')}
            </button>
            <p role="status" className="connection-copy-result">
              {copyResult?.path === row.path && copyResult.status === 'success'
                ? t('Ruta copiada')
                : copyResult?.path === row.path && copyResult.status === 'error'
                  ? t('No se pudo copiar la ruta.')
                  : ''}
            </p>
          </>
        ) : (
          <p>{t('Ruta no disponible')}</p>
        )}
        {row.detail && (
          <details className="connection-original-diagnostic">
            <summary>{t('Mensaje de diagnóstico original')}</summary>
            <p>{row.detail}</p>
          </details>
        )}
      </div>
    </li>
  );
}

export function ConnectionsView({
  online,
  inventory,
  error,
  inventoryError,
  notice,
  busy,
  onClose,
  onRefresh,
  onSetup,
  onConflict,
  onHelp,
}: {
  online: boolean;
  inventory: ConnectionInventory | null;
  error: ConnectionMessage | null;
  inventoryError: ConnectionMessage | null;
  notice: ConnectionMessage | null;
  busy: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onSetup: (clientId: string) => void;
  onConflict: (row: ConnectionRow) => void;
  onHelp: () => void;
}) {
  useLocale();
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [revealRuntime, setRevealRuntime] = useState(0);
  const diagnosticsId = useId();
  const view = useRef<HTMLDivElement>(null);
  const identity = useRef<HTMLElement>(null);
  const runtimeDetails = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const header = identity.current;
    if (!header) return;
    // Native keyboard scrolling must clear the sticky header, also after text
    // zoom or a locale change wraps its controls onto another line.
    const measure = () =>
      view.current?.style.setProperty(
        '--connections-header-size',
        `${header.getBoundingClientRect().height + 8}px`,
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    if (!revealRuntime) return;
    runtimeDetails.current?.focus();
    runtimeDetails.current?.scrollIntoView({ block: 'nearest' });
  }, [revealRuntime]);
  const preflight =
    inventory?.runtimePreflight?.scope === 'expected_mcp_files'
      ? inventory.runtimePreflight
      : undefined;
  const results = RUNTIME_TARGETS.map((target) => ({
    ...target,
    code: preflight ? fileCode(preflight[target.key]?.code) : undefined,
  }));
  const issues = results.filter(
    (result) => result.code && result.code !== 'readable_file',
  );
  const hasFailure = issues.some((result) => result.code !== 'check_failed');
  const checkedAt =
    preflight?.checkedAt && Number.isFinite(Date.parse(preflight.checkedAt))
      ? new Date(preflight.checkedAt).toISOString()
      : undefined;
  const bothReadable = preflight && issues.length === 0;
  return (
    <div className="connections-view" ref={view}>
      <header className="connections-identity" ref={identity}>
        <div>
          <h2 id="popup-title">{t('Conexiones')}</h2>
          <p className="connections-calver" title={t('Versión de Hyperion')}>
            <span className="form-sr-only">{t('Versión de Hyperion')}: </span>
            {calVerLabel(inventory)}
          </p>
        </div>
        <div className="connections-identity-actions">
          <button
            type="button"
            className="ghost-button"
            disabled={busy}
            onClick={onRefresh}
          >
            <RefreshCw size={16} strokeWidth={1.75} aria-hidden="true" />
            {t('Comprobar')}
          </button>
          <button type="button" className="ghost-button" onClick={onClose}>
            <ArrowLeft size={16} strokeWidth={1.75} aria-hidden="true" />
            {t('Volver al canvas')}
          </button>
        </div>
      </header>
      <section className="connection-overview">
        <p className="connection-service-state">
          <span
            className={`connection-online-dot${online ? '' : ' is-offline'}`}
            aria-hidden="true"
          />
          {t(
            online
              ? 'Servicio local · Conectado'
              : 'Servicio local · Sin conexión',
          )}
        </p>
        <p>{t('Herramientas en este chat: desconocidas.')}</p>
      </section>
      <div className="connections-apps-heading">
        <h3>{t('Aplicaciones compatibles')}</h3>
        <p className="connections-summary" role="status">
          {inventoryError
            ? t('No se pudo comprobar')
            : inventory
              ? connectionsSummaryLine(inventory.summary)
              : busy
                ? t('Comprobando configuración local…')
                : t('Sin comprobar')}
        </p>
      </div>
      {error && (
        <p role="alert" className="popup-error">
          {formatConnectionMessage(error)}
        </p>
      )}
      {notice && (
        <p role="status" className="connection-setup-notice">
          {formatConnectionMessage(notice)}
        </p>
      )}
      {issues.length > 0 && (
        <aside
          className="connection-runtime-notice"
          data-severity={hasFailure ? 'warning' : 'unknown'}
          aria-label={t('Archivos del adaptador')}
        >
          <div role="status">
            {hasFailure ? (
              <TriangleAlert size={18} strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <CircleHelp size={18} strokeWidth={1.75} aria-hidden="true" />
            )}
            {issues.length > 1 && (
              <strong>
                {t('Los archivos del adaptador requieren atención')}
              </strong>
            )}
            {issues.map((result) => (
              <p key={result.key}>
                {t(result.label)}: {t(FILE_LABELS[result.code!])}
              </p>
            ))}
          </div>
          <button
            type="button"
            className="ghost-button"
            onClick={() => {
              setDiagnosticsOpen(true);
              setRevealRuntime((value) => value + 1);
            }}
          >
            {t('Ver diagnóstico')}
          </button>
        </aside>
      )}
      <ul className="connection-list">
        {(inventory?.integrations || []).map((row) => (
          <ConnectionAppRow
            key={row.id}
            row={row}
            expanded={selectedClient === row.id}
            onToggle={() =>
              setSelectedClient((value) => (value === row.id ? null : row.id))
            }
            busy={busy}
            onRefresh={onRefresh}
            onSetup={onSetup}
            onConflict={onConflict}
            onHelp={onHelp}
          />
        ))}
      </ul>
      <aside
        className="connection-limit-notice"
        role="note"
        aria-label={t('ChatGPT Desktop no es una conexión local')}
      >
        <strong>{t('ChatGPT Desktop no es una conexión local')}</strong>
        <p>
          {t(
            'ChatGPT Desktop no usa el MCP stdio de este equipo. Work mode no es un requisito de Hyperion. Para Hyperion en local usa Cursor, Codex, Claude Desktop o Claude Code.',
          )}
        </p>
      </aside>
      <footer className="connections-footer">
        <button
          type="button"
          className="ghost-button connection-diagnostics-toggle"
          aria-expanded={diagnosticsOpen}
          aria-controls={diagnosticsId}
          onClick={() => {
            setDiagnosticsOpen(!diagnosticsOpen);
            if (!diagnosticsOpen) setRevealRuntime((value) => value + 1);
          }}
        >
          {t('Diagnóstico')}
          <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
        <button type="button" className="ghost-button" onClick={onHelp}>
          {t('Ayuda de conexión')}
        </button>
        <span>MIT</span>
      </footer>
      <section
        className="connection-service-details"
        id={diagnosticsId}
        hidden={!diagnosticsOpen}
      >
        <div
          className="connection-runtime-details"
          role="region"
          aria-labelledby={`${diagnosticsId}-title`}
          ref={runtimeDetails}
          tabIndex={-1}
        >
          <h3 id={`${diagnosticsId}-title`}>{t('Diagnóstico')}</h3>
          {inventory?.serviceUrl && (
            <p className="connection-service-url">{inventory.serviceUrl}</p>
          )}
          <p>
            {t(
              online
                ? 'El servicio local responde en este equipo. No indica qué aplicación de IA está en uso.'
                : 'No se ha confirmado una respuesta del servicio local.',
            )}
          </p>
          <h4>{t('Archivos del adaptador')}</h4>
          {bothReadable && (
            <p>{t('Hyperion puede leer los archivos del adaptador.')}</p>
          )}
          <dl>
            {results.map((result) => (
              <div
                key={result.key}
                data-runtime-target={result.key}
                data-code={result.code || 'not_checked'}
              >
                <dt>{t(result.label)}</dt>
                <dd>
                  {result.code
                    ? t(FILE_LABELS[result.code])
                    : t('Sin comprobar')}
                </dd>
              </div>
            ))}
          </dl>
          {checkedAt && (
            <p>
              <time dateTime={checkedAt}>
                {t('Comprobado a las {0} UTC', {
                  0: checkedAt.replace('T', ' ').replace(/\.\d{3}Z$/, ''),
                })}
              </time>
            </p>
          )}
          <p>{t('Inicio MCP y llamada de herramienta: sin comprobar.')}</p>
          <p>{t('Herramientas en este chat: desconocidas.')}</p>
          {issues.some(
            (result) =>
              result.code === 'missing' || result.code === 'not_regular_file',
          ) && (
            <p>
              {t(
                'Comprueba que estás usando la instalación prevista de Hyperion. Después, vuelve a comprobar o abre Ayuda de conexión.',
              )}
            </p>
          )}
          {issues.some((result) => result.code === 'read_denied') && (
            <p>
              {t(
                'Consulta Ayuda de conexión para revisar el acceso de Hyperion al archivo.',
              )}
            </p>
          )}
          {issues.some((result) => result.code === 'check_failed') && (
            <p>
              {t(
                'Vuelve a comprobar. Este resultado no confirma que falte un archivo.',
              )}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
