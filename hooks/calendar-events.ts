type CalendarRefreshCallback = () => void;
type PendingCalendarTarget = { year: number; month: number; targetDate: string };

const listeners = new Set<CalendarRefreshCallback>();

export const calendarRefreshEvent = {
  subscribe(callback: CalendarRefreshCallback): () => void {
    listeners.add(callback);
    return () => {
      listeners.delete(callback);
    };
  },
  emit(): void {
    listeners.forEach((cb) => {
      try {
        cb();
      } catch {
        // ignore subscriber errors
      }
    });
  },
};

/** 홈에 있을 때 pendingCalendarTarget 적용 요청 (간편입력 등) */
type ApplyTargetCallback = (target?: PendingCalendarTarget) => void;
const applyTargetListeners = new Set<ApplyTargetCallback>();
let latestPendingCalendarTarget: PendingCalendarTarget | null = null;

export const setLatestPendingCalendarTarget = (target: PendingCalendarTarget): void => {
  latestPendingCalendarTarget = target;
};

export const getLatestPendingCalendarTarget = (): PendingCalendarTarget | null =>
  latestPendingCalendarTarget;

export const consumeLatestPendingCalendarTarget = (): PendingCalendarTarget | null => {
  const target = latestPendingCalendarTarget;
  latestPendingCalendarTarget = null;
  return target;
};

export const applyPendingCalendarTargetEvent = {
  subscribe(callback: ApplyTargetCallback): () => void {
    applyTargetListeners.add(callback);
    return () => {
      applyTargetListeners.delete(callback);
    };
  },
  emit(target?: PendingCalendarTarget): void {
    if (target) {
      latestPendingCalendarTarget = target;
    }
    applyTargetListeners.forEach((cb) => {
      try {
        cb(target);
      } catch {
        // ignore subscriber errors
      }
    });
  },
};


