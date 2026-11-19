import { LiveAcpChat } from './live-acp-chat.mjs';
import {
  LIVE_HARNESSES,
  LiveHarnessLauncherStore,
  resolveHarness,
  resolveHarnesses,
  saveHarnessExecutable,
} from './harness-launcher.mjs';

/**
 * Owns a single selected local chat harness. The renderer receives only the
 * supported names and normalized events; executable paths stay in main.
 */
export class LiveHarnessChat {
  constructor({
    userData,
    directory,
    url,
    onEvent,
    onError,
    store = new LiveHarnessLauncherStore(userData),
    resolveHarnesses: resolveAll = () => resolveHarnesses({ userData, store }),
    factories,
  }) {
    this.userData = userData;
    this.directory = directory;
    this.url = url;
    this.onEvent = onEvent;
    this.onError = onError;
    this.store = store;
    this.resolveAll = resolveAll;
    this.factories =
      factories ||
      Object.fromEntries(
        LIVE_HARNESSES.map(({ id }) => [
          id,
          () =>
            new LiveAcpChat({
              harness: id,
              userData,
              directory,
              url,
              onEvent,
              onError,
              resolveExecutable: () => resolveHarness(id, { userData, store }),
            }),
        ]),
      );
    this.selected = store.getSelected() || this.firstReady() || 'codex';
    this.chat = null;
  }

  firstReady() {
    return this.resolveAll().find((harness) => harness.status === 'ready')?.id;
  }

  snapshot() {
    return {
      selected: this.selected,
      harnesses: this.resolveAll().map(({ id, label, status }) => ({
        id,
        label,
        status,
      })),
    };
  }

  selectHarness(id) {
    if (!LIVE_HARNESSES.some((harness) => harness.id === id))
      throw new Error('Unsupported local chat harness.');
    if (this.chat?.turnId || this.chat?.connecting)
      throw new Error(
        'Wait for the active local chat turn before changing harness.',
      );
    this.chat?.dispose?.();
    this.selected = id;
    this.store.select(id);
    this.chat = null;
    return this.snapshot();
  }

  active() {
    if (!this.chat) {
      const factory = this.factories[this.selected];
      if (!factory) throw new Error('Unsupported local chat harness.');
      this.chat = factory();
    }
    return this.chat;
  }

  connect(runId) {
    if (
      this.chat?.runId &&
      this.chat.runId !== runId &&
      !this.chat.turnId &&
      !this.chat.connecting
    ) {
      this.chat.dispose();
      this.chat = null;
    }
    return this.active().connect(runId);
  }

  send(runId, text) {
    return this.active().send(runId, text);
  }

  stop(runId) {
    return this.active().stop(runId);
  }

  approve(runId, token, decision) {
    return this.active().approve(runId, token, decision);
  }

  resolveUncertain(runId) {
    return this.active().resolveUncertain(runId);
  }

  chooseExecutable(executable) {
    if (!executable)
      throw new Error('Choose an executable before saving the local harness.');
    return saveHarnessExecutable({
      userData: this.userData,
      id: this.selected,
      executable,
      store: this.store,
    });
  }

  dispose() {
    this.chat?.dispose?.();
    if (this.chat?.child) this.chat.child.kill?.('SIGTERM');
    this.chat = null;
  }
}
