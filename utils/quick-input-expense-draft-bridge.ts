import type {
  QuickInputExpenseDraftSeed,
  QuickInputIncomeDraftSeed,
  QuickInputPendingRecord,
} from '@/utils/quick-input-pending-record';
import {
  pendingToExpenseDraftSeed,
  pendingToIncomeDraftSeed,
} from '@/utils/quick-input-pending-record';

type QuickInputRecordDraftCallbacks = {
  onComplete: (pending: QuickInputPendingRecord) => void;
  onCancel: () => void;
};

let activeDraft: {
  pending: QuickInputPendingRecord;
  callbacks: QuickInputRecordDraftCallbacks;
} | null = null;

export function beginQuickInputRecordEdit(
  pending: QuickInputPendingRecord,
  callbacks: QuickInputRecordDraftCallbacks,
): void {
  activeDraft = { pending, callbacks };
}

/** @deprecated use beginQuickInputRecordEdit */
export const beginQuickInputExpenseEdit = beginQuickInputRecordEdit;

export function peekQuickInputExpenseDraftSeed(): QuickInputExpenseDraftSeed | null {
  if (!activeDraft || activeDraft.pending.recordType === 'income') {
    return null;
  }
  return pendingToExpenseDraftSeed(activeDraft.pending);
}

export function peekQuickInputIncomeDraftSeed(): QuickInputIncomeDraftSeed | null {
  if (!activeDraft || activeDraft.pending.recordType !== 'income') {
    return null;
  }
  return pendingToIncomeDraftSeed(activeDraft.pending);
}

export function isQuickInputRecordDraftActive(): boolean {
  return activeDraft != null;
}

/** @deprecated use isQuickInputRecordDraftActive */
export const isQuickInputExpenseDraftActive = isQuickInputRecordDraftActive;

export function completeQuickInputRecordEdit(pending: QuickInputPendingRecord): void {
  const draft = activeDraft;
  activeDraft = null;
  draft?.callbacks.onComplete(pending);
}

/** @deprecated use completeQuickInputRecordEdit */
export const completeQuickInputExpenseEdit = completeQuickInputRecordEdit;

export function cancelQuickInputRecordEdit(): void {
  const draft = activeDraft;
  activeDraft = null;
  draft?.callbacks.onCancel();
}

/** @deprecated use cancelQuickInputRecordEdit */
export const cancelQuickInputExpenseEdit = cancelQuickInputRecordEdit;
