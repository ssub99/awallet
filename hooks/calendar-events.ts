type CalendarRefreshCallback = () => void;

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
const applyTargetListeners = new Set<CalendarRefreshCallback>();

export const applyPendingCalendarTargetEvent = {
  subscribe(callback: CalendarRefreshCallback): () => void {
    applyTargetListeners.add(callback);
    return () => {
      applyTargetListeners.delete(callback);
    };
  },
  emit(): void {
    applyTargetListeners.forEach((cb) => {
      try {
        cb();
      } catch {
        // ignore subscriber errors
      }
    });
  },
};


