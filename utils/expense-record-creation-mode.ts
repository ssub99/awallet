/** expense-record create 진입 퍼널 (동일 화면, param으로 분기) */
export const EXPENSE_RECORD_CREATION_FUNNEL_PARAM = 'creationFunnel';
export const EXPENSE_RECORD_QUICK_INPUT_DRAFT_PARAM = 'quickInputDraft';

export type ExpenseRecordScreenMode = 'edit' | 'create';

/** create 진입: 일반 퍼널 vs 간편 확인 카드 변경 */
export type ExpenseRecordCreationFunnel = 'screen' | 'quickInputDraft';

export type ExpenseRecordCreationContext =
  | { kind: 'edit' }
  | { kind: 'create'; funnel: ExpenseRecordCreationFunnel };

/** 일반 퍼널 저장 후 동작 (계속 생성 UI는 후속) */
export type ScreenFunnelSaveIntent = 'complete' | 'continue';

export const EXPENSE_RECORD_SCREEN_FUNNEL_ROUTE_PARAMS = {
  [EXPENSE_RECORD_CREATION_FUNNEL_PARAM]: 'screen',
} as const;

export const EXPENSE_RECORD_QUICK_INPUT_DRAFT_ROUTE_PARAMS = {
  [EXPENSE_RECORD_QUICK_INPUT_DRAFT_PARAM]: '1',
  [EXPENSE_RECORD_CREATION_FUNNEL_PARAM]: 'quickInputDraft',
} as const;

/** Amplitude `screen_name` — 일반 소비 기록 / 간편 바텀시트 / 카테고리 기본 */
export const EXPENSE_RECORD_ANALYTICS_SCREEN_NAME = '/expense-record';
export const EXPENSE_RECORD_SHEET_ANALYTICS_SCREEN_NAME = '/expense-record-sheet';
export const EXPENSE_CATEGORY_ANALYTICS_SCREEN_NAME = '/expense-category';
export const EXPENSE_EDIT_ANALYTICS_SCREEN_NAME = '/expense-edit';

export function resolveExpenseRecordCreationContext(params: {
  mode?: ExpenseRecordScreenMode;
  quickInputDraft?: string;
  creationFunnel?: string;
}): ExpenseRecordCreationContext {
  if (params.mode === 'edit') {
    return { kind: 'edit' };
  }

  if (
    params.quickInputDraft === '1' ||
    params.creationFunnel === 'quickInputDraft'
  ) {
    return { kind: 'create', funnel: 'quickInputDraft' };
  }

  return { kind: 'create', funnel: 'screen' };
}

/** 소비 기록 화면 analytics screen_name (간편 드래프트 → sheet) */
export function resolveExpenseRecordAnalyticsScreenName(
  context: ExpenseRecordCreationContext,
): string {
  if (context.kind === 'edit') {
    return EXPENSE_EDIT_ANALYTICS_SCREEN_NAME;
  }
  if (context.funnel === 'quickInputDraft') {
    return EXPENSE_RECORD_SHEET_ANALYTICS_SCREEN_NAME;
  }
  return EXPENSE_RECORD_ANALYTICS_SCREEN_NAME;
}

/**
 * 카테고리 목록 화면 analytics screen_name.
 * UI는 공용, 간편 바텀시트에서 들어온 경우만 expense-record-sheet로 귀속.
 */
export function resolveExpenseCategoryAnalyticsScreenName(params: {
  quickInputDraft?: string;
  creationFunnel?: string;
}): string {
  if (
    params.quickInputDraft === '1' ||
    params.creationFunnel === 'quickInputDraft'
  ) {
    return EXPENSE_RECORD_SHEET_ANALYTICS_SCREEN_NAME;
  }
  return EXPENSE_CATEGORY_ANALYTICS_SCREEN_NAME;
}

export function isQuickInputDraftCreationContext(
  context: ExpenseRecordCreationContext,
): context is { kind: 'create'; funnel: 'quickInputDraft' } {
  return context.kind === 'create' && context.funnel === 'quickInputDraft';
}

export function isScreenFunnelCreationContext(
  context: ExpenseRecordCreationContext,
): context is { kind: 'create'; funnel: 'screen' } {
  return context.kind === 'create' && context.funnel === 'screen';
}

export function resolveScreenFunnelSaveIntent(
  intent: ScreenFunnelSaveIntent | undefined,
): ScreenFunnelSaveIntent {
  return intent === 'continue' ? 'continue' : 'complete';
}

export function formatScreenFunnelContinueCreateToast(savedCount: number): string {
  const count = Number.isFinite(savedCount) && savedCount > 0 ? Math.floor(savedCount) : 1;
  return `${count}건의 기록이 생성되었습니다.`;
}

if (__DEV__) {
  const draft = resolveExpenseRecordCreationContext({
    mode: 'create',
    quickInputDraft: '1',
  });
  console.assert(
    isQuickInputDraftCreationContext(draft),
    'quickInputDraft=1 → quickInputDraft funnel',
  );

  const screen = resolveExpenseRecordCreationContext({
    mode: 'create',
    creationFunnel: 'screen',
  });
  console.assert(
    isScreenFunnelCreationContext(screen),
    'creationFunnel=screen → screen funnel',
  );

  console.assert(
    formatScreenFunnelContinueCreateToast(3) === '3건의 기록이 생성되었습니다.',
    'continue-create toast copy',
  );

  console.assert(
    resolveExpenseRecordAnalyticsScreenName(draft) ===
      EXPENSE_RECORD_SHEET_ANALYTICS_SCREEN_NAME,
    'draft funnel → expense-record-sheet screen_name',
  );
  console.assert(
    resolveExpenseRecordAnalyticsScreenName(screen) ===
      EXPENSE_RECORD_ANALYTICS_SCREEN_NAME,
    'screen funnel → expense-record screen_name',
  );
  console.assert(
    resolveExpenseCategoryAnalyticsScreenName({ quickInputDraft: '1' }) ===
      EXPENSE_RECORD_SHEET_ANALYTICS_SCREEN_NAME,
    'category from draft → expense-record-sheet',
  );
  console.assert(
    resolveExpenseCategoryAnalyticsScreenName({}) ===
      EXPENSE_CATEGORY_ANALYTICS_SCREEN_NAME,
    'category default → expense-category',
  );
}
