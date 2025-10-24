/**
 * Global event emitter for create bottom sheet
 * Simple pub/sub pattern to trigger create sheet from anywhere
 */

type CreateSheetListener = () => void;

class CreateSheetEventEmitter {
  private listeners: Set<CreateSheetListener> = new Set();

  subscribe(listener: CreateSheetListener): () => void {
    this.listeners.add(listener);
    
    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(): void {
    this.listeners.forEach(listener => listener());
  }
}

export const createSheetEvent = new CreateSheetEventEmitter();

