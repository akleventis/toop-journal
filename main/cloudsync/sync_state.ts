import { SyncState } from '../../shared/types';
export { SyncState };

/**
 * Manages sync state and notifies registered listeners on every transition.
 * State changes originate in the main process (aws_client, transact, aws_config)
 * and are pushed to the renderer via IPC (see main.ts → webContents.send).
 */
class SyncStateMachine {
  private state: SyncState = SyncState.UNINITIALIZED;
  private listeners: ((state: SyncState) => void)[] = [];

  /**
   * Updates state and synchronously notifies all registered listeners.
   *
   * @param {SyncState} newState - The new sync state to transition to.
   */
  setState(newState: SyncState) {
    this.state = newState;
    this.listeners.forEach(l => l(newState));
  }

  getState(): SyncState {
    return this.state;
  }

  /**
   * Registers a state change listener.
   *
   * @param {(state: SyncState) => void} listener - Called with the new state on every transition.
   * @returns {() => void} Unsubscribe function — call to remove the listener (e.g. on component unmount).
   */
  onStateChange(listener: (state: SyncState) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }
}

// imported and used directly by aws_client, transact, and aws_config.
export const syncStateMachine = new SyncStateMachine();
