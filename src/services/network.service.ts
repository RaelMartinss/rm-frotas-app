type NetworkListener = (isOnline: boolean) => void;

class NetworkService {
  private _isOnline = true;
  private listeners: Set<NetworkListener> = new Set();
  private checkInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.startPeriodicCheck();
  }

  get isOnline(): boolean {
    return this._isOnline;
  }

  setOnline(online: boolean) {
    if (this._isOnline !== online) {
      this._isOnline = online;
      this.notifyListeners();
    }
  }

  subscribe(listener: NetworkListener): () => void {
    this.listeners.add(listener);
    listener(this._isOnline);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach((listener) => {
      try {
        listener(this._isOnline);
      } catch {}
    });
  }

  /**
   * Verifica se a conexão com a API da RM Frotas está ativa realizando healthcheck leve
   */
  async checkConnection(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch('https://api.rmfrotas.com.br/v1/health', {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const online = response.ok;
      this.setOnline(online);
      return online;
    } catch {
      this.setOnline(false);
      return false;
    }
  }

  private startPeriodicCheck() {
    // Checagem inicial
    this.checkConnection();

    // Verificação periódica em segundo plano a cada 15 segundos
    this.checkInterval = setInterval(() => {
      this.checkConnection();
    }, 15000);
  }
}

export const networkService = new NetworkService();
