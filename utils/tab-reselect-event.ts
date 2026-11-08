/**
 * Emitted when the user taps an already-selected main tab (home / challenge / report).
 */

export type TabReselectName = 'home' | 'challenge' | 'report';

type TabReselectListener = (tabName: TabReselectName) => void;

class TabReselectEventEmitter {
  private listeners = new Set<TabReselectListener>();

  subscribe(listener: TabReselectListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(tabName: TabReselectName): void {
    this.listeners.forEach((listener) => {
      listener(tabName);
    });
  }
}

export const tabReselectEvent = new TabReselectEventEmitter();
