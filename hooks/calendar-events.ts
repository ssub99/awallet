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


