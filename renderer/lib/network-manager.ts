type NetworkListener = (online: boolean) => void;

/**
 * Wraps window.network.* to provide a subscribable online/offline status.
 * Use this instead of window.network.* directly in components.
 */
class NetworkManager {
  private listeners: Set<NetworkListener> = new Set();

  constructor() {
    window.network.onStatusChange((online) => {
      this.listeners.forEach(l => l(online));
    });
  }

  /**
   * @returns {boolean} Current online status.
   */
  isOnline(): boolean {
    return window.network.isOnline();
  }

  /**
   * Registers a listener for online/offline changes.
   *
   * @param {NetworkListener} listener
   * @returns {() => void} Unsubscribe function.
   */
  subscribe(listener: NetworkListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

// singleton — import this instead of window.network.* in components
export const networkManager = new NetworkManager();
