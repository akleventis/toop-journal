import { SyncState } from "../../../shared/types.js";
export { SyncState };

class SyncStateMachine {
  private state: SyncState = SyncState.UNINITIALIZED;
  private listeners: ((state: SyncState) => void)[] = [];

  setState(newState: SyncState) {
    this.state = newState;
    this.listeners.forEach(l => l(newState));
  }

  getState(): SyncState {
    return this.state;
  }

  onStateChange(listener: (state: SyncState) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }
}

export const syncStateMachine = new SyncStateMachine();
