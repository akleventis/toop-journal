type NetworkCallback = (online: boolean) => void;

class NetworkManager {
  private online: boolean;
  private subscribers: Set<NetworkCallback> = new Set();

  constructor() {
    this.online = navigator.onLine;
    window.addEventListener('online', () => this.setOnline(true));
    window.addEventListener('offline', () => this.setOnline(false));
  }

  private setOnline(val: boolean) {
    if (this.online === val) return;
    this.online = val;
    this.subscribers.forEach(cb => cb(val));
  }

  isOnline(): boolean { return this.online; }

  subscribe(cb: NetworkCallback): () => void {
    this.subscribers.add(cb);
    return () => this.subscribers.delete(cb);
  }
}

export const networkManager = new NetworkManager();
