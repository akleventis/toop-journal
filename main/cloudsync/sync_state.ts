// SyncState enum is defined in renderer/lib/types.ts so both the main
// process and renderer can import it from a single source of truth.
import { SyncState } from '../../renderer/lib/types';
export { SyncState };

// Manages sync state and notifies registered listeners on every transition.
// State changes originate in the main process (aws_client, transact, aws_config)
// and are pushed to the renderer via IPC (see main.ts → webContents.send).
class SyncStateMachine {
  private state: SyncState = SyncState.UNINITIALIZED;

  // Array of callbacks registered via onStateChange. Each is called with the
  // new state whenever setState is invoked.
  private listeners: ((state: SyncState) => void)[] = [];

  // Updates state and synchronously notifies all listeners.
  setState(newState: SyncState) {
    this.state = newState;
    this.listeners.forEach(l => l(newState));
  }

  getState(): SyncState {
    return this.state;
  }

  // Registers a listener and returns an unsubscribe function.
  // Call the returned function to remove the listener (e.g. on component unmount).
  onStateChange(listener: (state: SyncState) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }
}

// Singleton — imported and used directly by aws_client, transact, and aws_config.
export const syncStateMachine = new SyncStateMachine();
