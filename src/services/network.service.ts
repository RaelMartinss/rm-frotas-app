import { AppState, AppStateStatus } from 'react-native';

type NetworkListener = (isOnline: boolean) => void;

class NetworkService {
  private _isOnline = true;
  private listeners: Set<NetworkListener> = new Set();
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private lastActivityAt = 0;
  private checkingPromise: Promise<boolean> | null = null;
  private currentAppState: AppStateStatus = AppState.currentState || 'active';

  constructor() {
    this.setupAppStateLifecycle();
    this.startPeriodicCheck();
  }

  get isOnline(): boolean {
    return this._isOnline;
  }

  /**
   * Registra atividade HTTP real bem-sucedida para evitar healthchecks redundantes e economizar bateria/4G
   */
  markActivity() {
    this.lastActivityAt = Date.now();
    this.setOnline(true);
  }

  setOnline(online: boolean) {
    if (online) {
      this.lastActivityAt = Date.now();
    }
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

  private setupAppStateLifecycle() {
    AppState.addEventListener('change', (nextState: AppStateStatus) => {
      const wasInactive = this.currentAppState !== 'active';
      this.currentAppState = nextState;

      if (nextState === 'active') {
        this.startPeriodicCheck(false);
        // Ao voltar para o app, só checa se estiver offline ou sem tráfego recente (> 45s)
        if (wasInactive && (!this._isOnline || Date.now() - this.lastActivityAt > 45000)) {
          this.checkConnection();
        }
      } else {
        // Pausa polling quando o app está minimizado/tela desligada para poupar rádio 4G e bateria
        this.stopPeriodicCheck();
      }
    });
  }

  /**
   * Verifica se a conexão com a API da RM Frotas está ativa realizando healthcheck leve (single-flight)
   */
  async checkConnection(): Promise<boolean> {
    if (this.checkingPromise) {
      return this.checkingPromise;
    }

    this.checkingPromise = (async () => {
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
      } finally {
        this.checkingPromise = null;
      }
    })();

    return this.checkingPromise;
  }

  private stopPeriodicCheck() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  private startPeriodicCheck(runImmediate = true) {
    if (runImmediate) {
      this.checkConnection();
    }

    if (this.checkInterval) return;

    this.checkInterval = setInterval(() => {
      if (this.currentAppState !== 'active') return;

      // Se está online e houve comunicação recente (< 55s), pula o ping de healthcheck
      if (this._isOnline && Date.now() - this.lastActivityAt < 55000) {
        return;
      }

      this.checkConnection();
    }, 20000);
  }
}

export const networkService = new NetworkService();
