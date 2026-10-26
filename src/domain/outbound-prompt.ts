import { z } from 'zod';
import { connectorSchema } from './continuation.js';

/** PR1 ships continuation_prompt only; linked_cycle_prompt is PR-later. */
export const outboundPromptKindSchema = z.literal('continuation_prompt');

export const enqueueOutboundPromptSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    commandId: z.string().uuid(),
    text: z.string().trim().min(1).max(8000),
    connector: connectorSchema,
    kind: outboundPromptKindSchema.default('continuation_prompt'),
  })
  .strict();

export const outboundClaimSchema = z
  .object({ connectorId: z.string().trim().min(1).max(128) })
  .strict();

export const outboundSettleSchema = z
  .object({
    leaseToken: z.string().uuid(),
    outcome: z.enum(['accepted', 'failed']),
    reconciled: z.boolean().optional(),
    message: z.string().max(2000).optional(),
  })
  .strict();

export type OutboundPromptKind = z.infer<typeof outboundPromptKindSchema>;
export type EnqueueOutboundPrompt = z.infer<typeof enqueueOutboundPromptSchema>;
export type OutboundPromptStatus =
  'queued' | 'leased' | 'delivered' | 'failed' | 'uncertain' | 'cancelled';

/** Public projection — never includes sessionId. */
export type OutboundPromptState = {
  status: OutboundPromptStatus;
  kind: OutboundPromptKind;
  connectorId: string;
  harness: string;
  updatedAt: number;
  jobId?: string;
};

/** Claimed delivery for a send/resume connector (includes session for trusted local code). */
export type OutboundPromptDelivery = {
  id: string;
  kind: OutboundPromptKind;
  runId: string;
  revision: number;
  commandId: string;
  text: string;
  connectorId: string;
  harness: string;
  sessionId: string;
  scope: 'managed-session' | 'native-chat';
  leaseToken: string;
  leaseUntil: number;
};
