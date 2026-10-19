import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import {
  BookOpen,
  ChevronDown,
  CircleHelp,
  Download,
  ExternalLink,
  History,
  Info,
  type LucideIcon,
  MessageSquareText,
  Pause,
  Play,
  Plug,
  Route,
  Settings2,
} from 'lucide-react';
import { t, useLocale } from './i18n';
import { RELEASE_CHANNEL, VERSION } from '../version';
import type { ConnectionInventory } from './Connections';

export type AppMenuAction =
  | 'connections'
  | 'settings'
  | 'guide'
  | 'help'
  | 'legend'
  | 'window'
  | 'updates'
  | 'about'
  | 'request'
  | 'activity'
  | 'pause'
  | 'resume';

export type AppMenuRunChrome = {
  live: boolean;
  paused: boolean;
  canPauseResume: boolean;
};

const MENU_ICONS: Record<AppMenuAction, LucideIcon> = {
  connections: Plug,
  settings: Settings2,
  guide: BookOpen,
  help: CircleHelp,
  legend: Route,
  window: ExternalLink,
  updates: Download,
  about: Info,
  request: MessageSquareText,
  activity: History,
  pause: Pause,
  resume: Play,
};

function calVerLabel(inventory: ConnectionInventory | null) {
  const version = inventory?.version || VERSION;
  const channel = inventory?.channel || RELEASE_CHANNEL || 'preview';
  return t('Hyperion {0} UTC · {1}', { 0: version, 1: channel });
}

function shouldAnimateMenu(reduceMotion: boolean) {
  if (reduceMotion) return false;
  if (typeof matchMedia !== 'function') return true;
  return !matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function AppMenu({
  open,
  onOpenChange,
  inventory,
  reduceMotion,
  isElectron,
  run,
  onAction,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inventory: ConnectionInventory | null;
  reduceMotion: boolean;
  isElectron: boolean;
  run?: AppMenuRunChrome | null;
  onAction: (action: AppMenuAction) => void;
}) {
  useLocale();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const version = calVerLabel(inventory);
  const animate = shouldAnimateMenu(reduceMotion);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const focusables = panel?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    );
    focusables?.[0]?.focus();

    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        panelRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      )
        return;
      onOpenChange(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onOpenChange(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onOpenChange]);

  const runAction = (action: AppMenuAction) => {
    if (triggerRef.current) {
      // Preserve focus target after the menu unmounts.
      triggerRef.current.focus();
    }
    // Close first, then act in the same turn so React batches menu teardown with
    // the next overlay (single-layer) and pause/resume are not raced by e2e GETs.
    onOpenChange(false);
    onAction(action);
  };

  const onPanelKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab' || !panelRef.current) return;
    const focusables = [
      ...panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled])',
      ),
    ];
    if (focusables.length === 0) return;
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="app-menu">
      <button
        ref={triggerRef}
        type="button"
        className="app-menu-trigger"
        aria-label={open ? t('Cerrar menú') : t('Abrir menú')}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => onOpenChange(!open)}
      >
        <span>{t('Menú')}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      {open && (
        <div
          ref={panelRef}
          id={menuId}
          className={`app-menu-panel${animate ? ' is-animated' : ' is-instant'}`}
          role="menu"
          aria-label={t('Menú')}
          onKeyDown={onPanelKeyDown}
        >
          <div className="app-menu-version" title={t('Versión de Hyperion')}>
            <span className="form-sr-only">{t('Versión de Hyperion')}: </span>
            {version}
          </div>
          {run && (
            <>
              <div className="app-menu-sep" role="separator" />
              <p className="app-menu-section">{t('Este flujo')}</p>
              <div className="app-menu-group">
                <MenuRow
                  icon={MENU_ICONS.request}
                  onSelect={() => runAction('request')}
                >
                  {t('Petición original')}
                </MenuRow>
                <MenuRow
                  icon={MENU_ICONS.activity}
                  onSelect={() => runAction('activity')}
                >
                  {t('Actividad')}
                </MenuRow>
                {run.canPauseResume && (
                  <MenuRow
                    icon={run.live ? MENU_ICONS.pause : MENU_ICONS.resume}
                    onSelect={() => runAction(run.live ? 'pause' : 'resume')}
                  >
                    {run.live ? t('Pausar') : t('Reanudar')}
                  </MenuRow>
                )}
              </div>
            </>
          )}
          <div className="app-menu-sep" role="separator" />
          <p className="app-menu-section">{t('Aplicación')}</p>
          <div className="app-menu-group">
            <MenuRow
              icon={MENU_ICONS.connections}
              onSelect={() => runAction('connections')}
              description={t('Configura tus aplicaciones de IA')}
            >
              {t('Conexiones')}
            </MenuRow>
            <MenuRow
              icon={MENU_ICONS.settings}
              onSelect={() => runAction('settings')}
            >
              {t('Ajustes')}
            </MenuRow>
          </div>
          <div className="app-menu-sep" role="separator" />
          <p className="app-menu-section">{t('Ayuda')}</p>
          <div className="app-menu-group">
            <MenuRow
              icon={MENU_ICONS.guide}
              onSelect={() => runAction('guide')}
            >
              {t('Guía de uso')}
            </MenuRow>
            <MenuRow icon={MENU_ICONS.help} onSelect={() => runAction('help')}>
              {t('Ayuda de conexión')}
            </MenuRow>
            <MenuRow
              icon={MENU_ICONS.legend}
              onSelect={() => runAction('legend')}
            >
              {t('Colores del flujo')}
            </MenuRow>
          </div>
          <div className="app-menu-sep" role="separator" />
          <p className="app-menu-section">{t('Más')}</p>
          <div className="app-menu-group">
            {!isElectron && (
              <MenuRow
                icon={MENU_ICONS.window}
                onSelect={() => runAction('window')}
              >
                {t('Abrir en ventana')}
              </MenuRow>
            )}
            {isElectron && (
              <MenuRow
                icon={MENU_ICONS.updates}
                onSelect={() => runAction('updates')}
              >
                {t('Buscar actualizaciones…')}
              </MenuRow>
            )}
            <MenuRow
              icon={MENU_ICONS.about}
              onSelect={() => runAction('about')}
            >
              {t('Acerca de Hyperion')}
            </MenuRow>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuRow({
  children,
  icon: Icon,
  onSelect,
  description,
}: {
  children: ReactNode;
  icon: LucideIcon;
  onSelect: () => void;
  description?: string;
}) {
  const descriptionId = useId();
  return (
    <button
      type="button"
      role="menuitem"
      className={`app-menu-row${description ? ' is-featured' : ''}`}
      aria-label={description ? t('Conexiones') : undefined}
      aria-describedby={description ? descriptionId : undefined}
      onClick={onSelect}
    >
      <span className="app-menu-row-icon" aria-hidden="true">
        <Icon size={18} strokeWidth={1.75} />
      </span>
      {description ? (
        <span className="app-menu-row-copy">
          <span>{children}</span>
          <small id={descriptionId}>{description}</small>
        </span>
      ) : (
        children
      )}
    </button>
  );
}
