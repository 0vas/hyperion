import type {
  ConnectionInventory,
  ConnectionRow,
  ConnectionStatusId,
} from './Connections';
import { connectionStatusLabel } from './Connections';

export type BubbleConnectionOption = Pick<
  ConnectionRow,
  'id' | 'name' | 'status'
>;

/** Rows for the Desktop chat bubble picker — DESKTOP_CLIENTS projection only. */
export function bubbleConnectionOptions(
  inventory: ConnectionInventory | null | undefined,
): BubbleConnectionOption[] {
  return (inventory?.integrations || []).map((row) => ({
    id: row.id,
    name: row.name,
    status: row.status,
  }));
}

export function bubbleConnectionOptionLabel(
  row: Pick<BubbleConnectionOption, 'name' | 'status'>,
  translate: (message: string) => string = (message) => message,
): string {
  return `${row.name} — ${translate(connectionStatusLabel(row.status))}`;
}

/** Guard against green-lie copy on picker labels. */
export function bubbleOptionClaimsLiveConnection(label: string): boolean {
  return /\b(conectado|connected)\b/i.test(label);
}

export function bubbleStatusIsHonest(status: ConnectionStatusId): boolean {
  return (
    status === 'configured' ||
    status === 'missing' ||
    status === 'conflict' ||
    status === 'unknown'
  );
}
