type NetworkListener = (online: boolean) => void;

// Wraps window.network.* to provide a subscribable online/offline status.
class NetworkManager {
  private listeners: Set<NetworkListener> = new Set();

  constructor() {
    window.network.onStatusChange((online) => {
      this.listeners.forEach(l => l(online));
    });
  }

  isOnline(): boolean {
    return window.network.isOnline();
  }

  // Registers a listener; returns an unsubscribe function.
  subscribe(listener: NetworkListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

// singleton — import this instead of window.network.* in components
export const networkManager = new NetworkManager();
