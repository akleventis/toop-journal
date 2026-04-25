import { SyncState } from '../../shared/types';
export { SyncState };

// Manages sync state and notifies registered listeners on every transition.
// State changes originate in aws_client/transact/aws_config and are pushed to the renderer via IPC.
class SyncStateMachine {
  private state: SyncState = SyncState.UNINITIALIZED;
  private listeners: ((state: SyncState) => void)[] = [];

  // Updates state and synchronously notifies all registered listeners.
  setState(newState: SyncState) {
    this.state = newState;
    this.listeners.forEach(l => l(newState));
  }

  getState(): SyncState {
    return this.state;
  }

  // Registers a listener; returns an unsubscribe function.
  onStateChange(listener: (state: SyncState) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }
}

// imported and used directly by aws_client, transact, and aws_config.
export const syncStateMachine = new SyncStateMachine();
