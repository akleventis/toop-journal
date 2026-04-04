type NetworkListener = (online: boolean) => void;

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

  subscribe(listener: NetworkListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const networkManager = new NetworkManager();
