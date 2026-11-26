import { storage } from './storage.service';
import { networkService } from './network.service';
import { biometricService } from './biometric.service';
import { AuthResponse, LoginCredentials, User } from '../types/auth';
import {
  DriverPortalSummary,
  DriverCurrentTrip,
  DriverFuelDTO,
  DriverHistoryItem,
  DriverFuelHistoryItem,
  QueuedOfflineFuel,
  LocationPingDTO,
  ReportIncidentDTO,
  ReportIncidentResult,
  TripChecklistDTO,
} from '../types/driver';

export const API_BASE_URL = 'https://api.rmfrotas.com.br/v1';

const CACHE_KEYS = {
  CURRENT_TRIP: 'rm_driver_current_trip',
  HISTORY: 'rm_driver_history',
  FUEL_HISTORY: 'rm_driver_fuel_history',
  PENDING_FUEL_QUEUE: 'rm_pending_fuel_queue',
  PENDING_SOS_QUEUE: 'rm_pending_sos_queue',
};

interface QueuedOfflineSos {
  id: string;
  protocol: string;
  dto: ReportIncidentDTO;
  timestamp: string;
}

export type RefreshResult =
  | { status: 'ok'; data: AuthResponse }
  | { status: 'revoked' }
  | { status: 'network_error' }
  | { status: 'no_token' };

class ApiService {
  private refreshPromise: Promise<RefreshResult> | null = null;
  private onUnauthorizedCallback: (() => void) | null = null;

  setOnUnauthorized(callback: (() => void) | null): void {
    this.onUnauthorizedCallback = callback;
  }

  async hasRefreshToken(): Promise<boolean> {
    const token = await storage.getItem('rm_refresh_token');
    return Boolean(token);
  }

  private async purgeSessionStorage(clearAccount = false): Promise<void> {
    await Promise.all([
      storage.removeItem('rm_token'),
      storage.removeItem('rm_user'),
      storage.removeItem('rm_driver_photo'),
      storage.removeItem(CACHE_KEYS.CURRENT_TRIP),
      storage.removeItem(CACHE_KEYS.HISTORY),
      storage.removeItem(CACHE_KEYS.FUEL_HISTORY),
      ...(clearAccount
        ? [
            storage.removeItem('rm_refresh_token'),
            storage.removeItem('rm_last_user'),
            storage.removeItem('rm_biometrics_enabled'),
          ]
        : []),
    ]).catch(() => {});
  }

  private async getAuthHeader(customHeaders?: Record<string, string>): Promise<HeadersInit> {
    const token = await storage.getItem('rm_token');
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(customHeaders || {}),
    };
  }

  /**
   * Helper genérico para chamadas autenticadas com timeout e renovação single-flight de token
   */
  private async authenticatedFetch(
    endpoint: string,
    options: RequestInit = {},
    timeoutMs = 18000
  ): Promise<Response> {
    const url = `${API_BASE_URL}${endpoint}`;
    const headers = await this.getAuthHeader(options.headers as Record<string, string>);

    const fetchWithTimeout = async (reqHeaders: HeadersInit): Promise<Response> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await fetch(url, {
          ...options,
          headers: reqHeaders,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
    };

    try {
      let response = await fetchWithTimeout(headers);
      networkService.setOnline(true);

      // Se retornar 401 Unauthorized, aguarda renovação única (mutex) e repete a requisição
      if (response.status === 401) {
        const refreshRes = await this.refreshDetailed();
        if (refreshRes.status === 'ok') {
          const retryHeaders = await this.getAuthHeader(options.headers as Record<string, string>);
          response = await fetchWithTimeout(retryHeaders);
          if (response.status === 401) {
            await this.purgeSessionStorage(true);
            this.onUnauthorizedCallback?.();
          }
        } else if (refreshRes.status === 'no_token') {
          await this.purgeSessionStorage(false);
          this.onUnauthorizedCallback?.();
        }
      }

      return response;
    } catch (err) {
      networkService.setOnline(false);
      throw err;
    }
  }

  // ==========================================
  // AUTENTICAÇÃO
  // ==========================================

  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...credentials,
          deviceInfo: { platform: 'mobile' },
        }),
      });
    } catch {
      throw new Error('Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.');
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Credenciais inválidas. Verifique seu e-mail e senha.');
    }

    const data: AuthResponse = await response.json();

    // Restrição estrita: aplicativo móvel permitido exclusivamente para contas DRIVER
    if (data.user?.role !== 'DRIVER') {
      if (data.refreshToken) {
        fetch(`${API_BASE_URL}/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(data.accessToken ? { Authorization: `Bearer ${data.accessToken}` } : {}),
          },
          body: JSON.stringify({ refreshToken: data.refreshToken }),
        }).catch(() => {});
      }
      throw new Error(
        'Este aplicativo é exclusivo para motoristas. Gestores e administradores devem acessar o Portal Web.'
      );
    }

    // Se trocou de motorista no mesmo aparelho, limpa caches operacionais do condutor anterior
    const prevUser = await this.getLastUser();
    if (prevUser && prevUser.id !== data.user.id) {
      await this.purgeSessionStorage(false);
    }

    await storage.setItem('rm_token', data.accessToken);
    await storage.setItem('rm_refresh_token', data.refreshToken);
    await storage.setItem('rm_user', JSON.stringify(data.user));
    await storage.setItem('rm_last_user', JSON.stringify(data.user));
    return data;
  }

  async refreshDetailed(timeoutMs = 12000): Promise<RefreshResult> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = (async (): Promise<RefreshResult> => {
      const refreshToken = await storage.getItem('rm_refresh_token');
      if (!refreshToken) return { status: 'no_token' };

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
          signal: controller.signal,
        }).finally(() => clearTimeout(timer));

        networkService.setOnline(true);

        if (response.status === 401 || response.status === 403) {
          // Sessão revogada, expirada ou usuário inativado no servidor: limpa tokens imediatamente
          await storage.removeItem('rm_refresh_token').catch(() => {});
          await this.purgeSessionStorage(false);
          this.onUnauthorizedCallback?.();
          return { status: 'revoked' };
        }

        if (!response.ok) {
          return { status: 'network_error' };
        }

        const data: AuthResponse = await response.json();

        if (data.user && data.user.role !== 'DRIVER') {
          await this.purgeSessionStorage(true);
          this.onUnauthorizedCallback?.();
          return { status: 'revoked' };
        }

        await storage.setItem('rm_token', data.accessToken);
        if (data.refreshToken) {
          await storage.setItem('rm_refresh_token', data.refreshToken);
        }
        if (data.user) {
          await storage.setItem('rm_user', JSON.stringify(data.user));
          await storage.setItem('rm_last_user', JSON.stringify(data.user));
        }
        return { status: 'ok', data };
      } catch {
        return { status: 'network_error' };
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  async refresh(): Promise<AuthResponse | null> {
    const result = await this.refreshDetailed();
    return result.status === 'ok' ? result.data : null;
  }

  async loginWithBiometrics(): Promise<User | null> {
    const bioEnabled = await biometricService.isEnabled();
    if (!bioEnabled) return null;

    const refreshToken = await storage.getItem('rm_refresh_token');
    const lastUserStr = await storage.getItem('rm_last_user');
    if (!refreshToken || !lastUserStr) return null;

    const refreshRes = await this.refreshDetailed();
    if (refreshRes.status === 'ok' && refreshRes.data.user) {
      return refreshRes.data.user;
    }

    // Se o servidor rejeitou/revogou a sessão (401/403) ou não há token válido, NUNCA permite bypass local
    if (refreshRes.status === 'revoked' || refreshRes.status === 'no_token') {
      return null;
    }

    // Apenas em falha genuína de conectividade (offline na estrada) e com refresh_token íntegro no SecureStore
    const intactRefresh = await storage.getItem('rm_refresh_token');
    if (!intactRefresh) return null;

    try {
      const user: User = JSON.parse(lastUserStr);
      if (user?.role !== 'DRIVER' || user?.mustChangePassword) {
        return null;
      }
      await storage.setItem('rm_user', JSON.stringify(user));
      return user;
    } catch {
      return null;
    }
  }

  async logout(clearAll = false): Promise<void> {
    if (clearAll) {
      const [refreshToken, accessToken] = await Promise.all([
        storage.getItem('rm_refresh_token'),
        storage.getItem('rm_token'),
      ]);

      if (refreshToken) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        await fetch(`${API_BASE_URL}/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify({ refreshToken }),
          signal: controller.signal,
        })
          .catch(() => {})
          .finally(() => clearTimeout(timer));
      }

      await this.purgeSessionStorage(true);
      return;
    }

    await this.purgeSessionStorage(false);
  }

  async getLastUser(): Promise<User | null> {
    const userStr = await storage.getItem('rm_last_user');
    if (!userStr) return null;
    try {
      return JSON.parse(userStr);
    } catch {
      return null;
    }
  }

  async getStoredUser(): Promise<User | null> {
    const userStr = await storage.getItem('rm_user');
    if (!userStr) return null;
    try {
      return JSON.parse(userStr);
    } catch {
      return null;
    }
  }

  // ==========================================
  // PORTAL DO MOTORISTA (SINCRONIZAÇÃO DA API)
  // ==========================================

  /**
   * Obtém os dados completos da viagem ativa, motorista, pendências e contagens.
   * Suporta cache offline com fallback automático caso esteja sem conexão.
   */
  async getCurrentTrip(): Promise<DriverPortalSummary> {
    try {
      const res = await this.authenticatedFetch('/driver-portal/current-trip');
      if (res.ok) {
        const data: DriverPortalSummary = await res.json();
        await storage.setItem(CACHE_KEYS.CURRENT_TRIP, JSON.stringify(data));
        return data;
      }
    } catch (err) {
      // Ignora erro de rede e recorre ao cache abaixo
    }

    // Fallback Offline: carregar do cache local
    const cached = await storage.getItem(CACHE_KEYS.CURRENT_TRIP);
    if (cached) {
      try {
        return JSON.parse(cached) as DriverPortalSummary;
      } catch {}
    }

    throw new Error('Não foi possível carregar os dados da viagem atual.');
  }

  /**
   * Inicia a viagem com 1 toque no celular
   */
  async startTrip(
    tripId: string,
    initialKm?: number
  ): Promise<{ message: string; tripId: string; status: string; startedAt?: string }> {
    const res = await this.authenticatedFetch('/driver-portal/start-trip', {
      method: 'POST',
      body: JSON.stringify({
        tripId,
        ...(initialKm !== undefined && !isNaN(initialKm) ? { initialKm } : {}),
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Falha ao iniciar viagem.');
    }

    const data = await res.json();
    await Promise.all([
      storage.removeItem(CACHE_KEYS.CURRENT_TRIP),
      storage.removeItem(CACHE_KEYS.HISTORY),
    ]).catch(() => {});
    return data;
  }

  /**
   * Conclui a viagem informando o odômetro final
   */
  async completeTrip(
    tripId: string,
    currentKm?: number
  ): Promise<{ message: string; tripId: string; status: string; completedAt: string }> {
    const res = await this.authenticatedFetch('/driver-portal/complete-trip', {
      method: 'POST',
      body: JSON.stringify({ tripId, currentKm }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Falha ao concluir viagem.');
    }

    const data = await res.json();
    await Promise.all([
      storage.removeItem(CACHE_KEYS.CURRENT_TRIP),
      storage.removeItem(CACHE_KEYS.HISTORY),
    ]).catch(() => {});
    return data;
  }

  /**
   * Salva o checklist pré-viagem veicular
   */
  async saveChecklist(
    tripId: string,
    checklist: TripChecklistDTO | any
  ): Promise<{ message: string; tripId: string; checklist?: any; offline?: boolean }> {
    try {
      const res = await this.authenticatedFetch('/driver-portal/checklist', {
        method: 'POST',
        body: JSON.stringify({ tripId, checklist }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Falha ao salvar checklist.');
      }

      return res.json();
    } catch (err: any) {
      const isNetworkErr =
        !networkService.isOnline ||
        err?.message?.includes('Network') ||
        err?.message?.includes('Failed to fetch') ||
        err?.message?.includes('Abort');

      if (!isNetworkErr) {
        throw err;
      }

      // Salva no storage local apenas em caso de oscilação de sinal
      try {
        await storage.setItem(`rm_checklist_${tripId}`, JSON.stringify(checklist));
      } catch {}

      return {
        message: 'Checklist salvo no dispositivo.',
        tripId,
        checklist,
        offline: true,
      };
    }
  }

  /**
   * Envia coordenadas ou lote de pings de GPS para a viagem ativa
   */
  async sendLocationPings(
    tripId: string,
    pings: LocationPingDTO[]
  ): Promise<{ message: string; savedCount?: number }> {
    if (!pings || pings.length === 0) return { message: 'Nenhum ping para enviar' };

    const payload = { pings };

    const res = await this.authenticatedFetch(`/driver-portal/trips/${tripId}/location`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const error = new Error(err.message || 'Falha ao registrar localização.');
      (error as any).status = res.status;
      throw error;
    }

    return res.json();
  }

  /**
   * Registra abastecimento na API com suporte a Idempotência e enfileiramento offline
   */
  async registerFuel(
    dto: DriverFuelDTO,
    idempotencyKey?: string
  ): Promise<{ message: string; id: string; totalCost: number; isOffline?: boolean }> {
    const key = idempotencyKey || `fuel_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // Se estiver sem conexão confirmada, enfileira diretamente sem esperar timeout
    if (!networkService.isOnline) {
      await this.queueOfflineFuel(dto, key);
      return {
        message: 'Abastecimento gravado localmente (Modo Offline). Será sincronizado automaticamente assim que houver conexão.',
        id: `offline_${Date.now()}`,
        totalCost: Number((dto.liters * dto.pricePerLiter).toFixed(2)),
        isOffline: true,
      };
    }

    try {
      const { vehiclePlate, vehicleModel, ...payloadForApi } = dto;
      const res = await this.authenticatedFetch('/driver-portal/fuel-record', {
        method: 'POST',
        headers: { 'Idempotency-Key': key },
        body: JSON.stringify(payloadForApi),
      });

      if (res.ok) {
        const data = await res.json();
        return {
          ...data,
          isOffline: false,
        };
      }

      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Erro ao registrar abastecimento.');
    } catch (error: any) {
      // Se for erro de rede/offline ou timeout, enfileira para sincronização posterior
      const isNetworkErr =
        !networkService.isOnline ||
        error?.message?.includes('Network') ||
        error?.message?.includes('Failed to fetch') ||
        error?.message?.includes('Abort') ||
        error?.message?.includes('timeout') ||
        !error?.message;

      if (isNetworkErr) {
        await this.queueOfflineFuel(dto, key);
        return {
          message: 'Sem sinal de internet no momento. Abastecimento gravado na fila offline e será sincronizado ao reconectar.',
          id: `offline_${Date.now()}`,
          totalCost: Number((dto.liters * dto.pricePerLiter).toFixed(2)),
          isOffline: true,
        };
      }
      throw error;
    }
  }

  /**
   * Envia ou atualiza a foto do cupom fiscal do abastecimento
   */
  async updateFuelReceipt(
    id: string,
    receiptUrl: string,
    notes?: string,
    gasStation?: string
  ): Promise<{ message: string; id: string; receiptUrl: string }> {
    // Se for um item da fila offline ou se estiver sem rede
    if (id.startsWith('offline_') || id.startsWith('fuel_')) {
      await this.updateOfflineReceiptInQueue(id, receiptUrl, notes, gasStation);
      return {
        message: 'Comprovante salvo na fila offline!',
        id,
        receiptUrl,
      };
    }

    try {
      const res = await this.authenticatedFetch(`/driver-portal/fuel-records/${id}/receipt`, {
        method: 'PATCH',
        body: JSON.stringify({ receiptUrl, notes, gasStation }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Falha ao anexar comprovante.');
      }

      return res.json();
    } catch (err: any) {
      if (!networkService.isOnline) {
        await this.updateOfflineReceiptInQueue(id, receiptUrl, notes, gasStation);
        return {
          message: 'Sem sinal. Comprovante salvo localmente e será enviado quando houver rede.',
          id,
          receiptUrl,
        };
      }
      throw err;
    }
  }

  /**
   * Atualiza recibo diretamente na fila de abastecimento offline
   */
  async updateOfflineReceiptInQueue(
    idOrKey: string,
    receiptUrl: string,
    notes?: string,
    gasStation?: string
  ): Promise<void> {
    try {
      const queueStr = await storage.getItem(CACHE_KEYS.PENDING_FUEL_QUEUE);
      if (!queueStr) return;
      const queue: QueuedOfflineFuel[] = JSON.parse(queueStr);
      const idx = queue.findIndex(
        (i) => (i.idempotencyKey || i.id) === idOrKey || i.id === idOrKey
      );
      if (idx !== -1) {
        queue[idx].dto.receiptUrl = receiptUrl;
        if (notes !== undefined) queue[idx].dto.notes = notes;
        if (gasStation !== undefined) queue[idx].dto.gasStation = gasStation;
        await storage.setItem(CACHE_KEYS.PENDING_FUEL_QUEUE, JSON.stringify(queue));
      }
    } catch {}
  }

  /**
   * Obtém histórico de viagens com fallback em cache local
   */
  async getHistory(): Promise<DriverHistoryItem[]> {
    try {
      const res = await this.authenticatedFetch('/driver-portal/history');
      if (res.ok) {
        const data: DriverHistoryItem[] = await res.json();
        await storage.setItem(CACHE_KEYS.HISTORY, JSON.stringify(data));
        return data;
      }
    } catch {}

    const cached = await storage.getItem(CACHE_KEYS.HISTORY);
    if (cached) {
      try {
        return JSON.parse(cached) as DriverHistoryItem[];
      } catch {}
    }

    return [];
  }

  /**
   * Obtém histórico de abastecimentos com filtro opcional por pendência
   */
  async getFuelHistory(pendingReceiptOnly = false): Promise<DriverFuelHistoryItem[]> {
    const query = pendingReceiptOnly ? '?pendingReceiptOnly=true' : '';
    try {
      const res = await this.authenticatedFetch(`/driver-portal/fuel-history${query}`);
      if (res.ok) {
        const data: DriverFuelHistoryItem[] = await res.json();
        if (!pendingReceiptOnly) {
          await storage.setItem(CACHE_KEYS.FUEL_HISTORY, JSON.stringify(data));
        }
        return data;
      }
    } catch {}

    const cached = await storage.getItem(CACHE_KEYS.FUEL_HISTORY);
    if (cached) {
      try {
        const list = JSON.parse(cached) as DriverFuelHistoryItem[];
        return pendingReceiptOnly ? list.filter((item) => item.isPendingReceipt) : list;
      } catch {}
    }

    return [];
  }

  /**
   * Enfileiramento offline de abastecimento
   */
  private async queueOfflineFuel(dto: DriverFuelDTO, idempotencyKey: string): Promise<void> {
    try {
      const queueStr = await storage.getItem(CACHE_KEYS.PENDING_FUEL_QUEUE);
      const queue: QueuedOfflineFuel[] = queueStr ? JSON.parse(queueStr) : [];
      queue.push({
        id: idempotencyKey,
        dto,
        idempotencyKey,
        timestamp: new Date().toISOString(),
        status: 'PENDING',
        error: null,
      });
      await storage.setItem(CACHE_KEYS.PENDING_FUEL_QUEUE, JSON.stringify(queue));
    } catch {}
  }

  /**
   * Obtém a lista completa de itens de abastecimento na fila offline
   */
  async getOfflineFuelQueue(): Promise<QueuedOfflineFuel[]> {
    try {
      const queueStr = await storage.getItem(CACHE_KEYS.PENDING_FUEL_QUEUE);
      if (!queueStr) return [];
      const queue = JSON.parse(queueStr);
      return Array.isArray(queue) ? queue : [];
    } catch {
      return [];
    }
  }

  /**
   * Retorna a quantidade total de itens na fila offline (abastecimentos + SOS) aguardando sincronização
   */
  async getOfflineQueueCount(): Promise<number> {
    try {
      const [fuelQueue, sosQueue] = await Promise.all([
        this.getOfflineFuelQueue(),
        this.getOfflineSosQueue(),
      ]);
      return fuelQueue.length + sosQueue.length;
    } catch {
      return 0;
    }
  }

  /**
   * Obtém a lista de chamados SOS pendentes na fila offline
   */
  async getOfflineSosQueue(): Promise<QueuedOfflineSos[]> {
    try {
      const raw = await storage.getItem(CACHE_KEYS.PENDING_SOS_QUEUE);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private async enqueueOfflineSos(dto: ReportIncidentDTO, protocol: string): Promise<void> {
    try {
      const queue = await this.getOfflineSosQueue();
      queue.push({
        id: `sos_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        protocol,
        dto,
        timestamp: new Date().toISOString(),
      });
      await storage.setItem(CACHE_KEYS.PENDING_SOS_QUEUE, JSON.stringify(queue));
    } catch {}
  }

  /**
   * Tenta reenviar manualmente um item específico da fila offline
   */
  async retryOfflineFuel(idempotencyKey: string): Promise<{ success: boolean; message?: string }> {
    try {
      const queueStr = await storage.getItem(CACHE_KEYS.PENDING_FUEL_QUEUE);
      if (!queueStr) return { success: false, message: 'Fila vazia.' };

      const queue: QueuedOfflineFuel[] = JSON.parse(queueStr);
      const itemIndex = queue.findIndex((i) => (i.idempotencyKey || i.id) === idempotencyKey);
      if (itemIndex === -1) return { success: false, message: 'Item não encontrado na fila.' };

      // Atualiza status para sincronizando
      queue[itemIndex].status = 'SYNCING';
      await storage.setItem(CACHE_KEYS.PENDING_FUEL_QUEUE, JSON.stringify(queue));

      const item = queue[itemIndex];
      const { vehiclePlate, vehicleModel, ...payloadForApi } = item.dto;
      const res = await this.authenticatedFetch('/driver-portal/fuel-record', {
        method: 'POST',
        headers: { 'Idempotency-Key': item.idempotencyKey },
        body: JSON.stringify(payloadForApi),
      });

      if (res.ok) {
        // Removido com sucesso
        const remaining = queue.filter((i) => (i.idempotencyKey || i.id) !== idempotencyKey);
        await storage.setItem(CACHE_KEYS.PENDING_FUEL_QUEUE, JSON.stringify(remaining));
        return { success: true };
      } else {
        const err = await res.json().catch(() => ({}));
        queue[itemIndex].status = 'DEAD';
        queue[itemIndex].error = err.message || 'Falha na validação do servidor.';
        await storage.setItem(CACHE_KEYS.PENDING_FUEL_QUEUE, JSON.stringify(queue));
        return { success: false, message: queue[itemIndex].error || undefined };
      }
    } catch (err: any) {
      try {
        const queueStr = await storage.getItem(CACHE_KEYS.PENDING_FUEL_QUEUE);
        if (queueStr) {
          const queue: QueuedOfflineFuel[] = JSON.parse(queueStr);
          const idx = queue.findIndex((i) => (i.idempotencyKey || i.id) === idempotencyKey);
          if (idx !== -1) {
            queue[idx].status = 'DEAD';
            queue[idx].error = err?.message || 'Sem conexão de internet.';
            await storage.setItem(CACHE_KEYS.PENDING_FUEL_QUEUE, JSON.stringify(queue));
          }
        }
      } catch {}
      return { success: false, message: err?.message || 'Sem conexão com o servidor.' };
    }
  }

  /**
   * Descarta e remove definitivamente um item com falha da fila offline
   */
  async discardOfflineFuel(idempotencyKey: string): Promise<void> {
    try {
      const queueStr = await storage.getItem(CACHE_KEYS.PENDING_FUEL_QUEUE);
      if (!queueStr) return;
      const queue: QueuedOfflineFuel[] = JSON.parse(queueStr);
      const remaining = queue.filter((i) => (i.idempotencyKey || i.id) !== idempotencyKey);
      await storage.setItem(CACHE_KEYS.PENDING_FUEL_QUEUE, JSON.stringify(remaining));
    } catch {}
  }

  /**
   * Sincroniza pendências salvas offline (abastecimentos + alertas SOS) com o servidor
   */
  async syncOfflineQueue(): Promise<{ synced: number; failed: number }> {
    try {
      const [fuelQueue, sosQueue] = await Promise.all([
        this.getOfflineFuelQueue(),
        this.getOfflineSosQueue(),
      ]);
      if (fuelQueue.length === 0 && sosQueue.length === 0) return { synced: 0, failed: 0 };

      let synced = 0;
      let failed = 0;
      const remainingFuel: QueuedOfflineFuel[] = [];
      const remainingSos: QueuedOfflineSos[] = [];

      for (const item of fuelQueue) {
        try {
          const { vehiclePlate, vehicleModel, ...payloadForApi } = item.dto;
          const res = await this.authenticatedFetch(
            '/driver-portal/fuel-record',
            {
              method: 'POST',
              headers: { 'Idempotency-Key': item.idempotencyKey },
              body: JSON.stringify(payloadForApi),
            },
            30000
          );

          if (res.ok) {
            synced++;
          } else {
            const err = await res.json().catch(() => ({}));
            item.status = 'DEAD';
            item.error = err.message || 'Falha ao sincronizar registro.';
            remainingFuel.push(item);
            failed++;
          }
        } catch {
          remainingFuel.push(item);
          failed++;
        }
      }

      for (const sosItem of sosQueue) {
        try {
          const res = await this.authenticatedFetch(
            '/driver-portal/incident',
            {
              method: 'POST',
              body: JSON.stringify(sosItem.dto),
            },
            30000
          );

          if (res.ok) {
            synced++;
          } else if (res.status >= 400 && res.status < 500) {
            // Erro definitivo de validação: descarta para não travar fila infinita
            failed++;
          } else {
            remainingSos.push(sosItem);
            failed++;
          }
        } catch {
          remainingSos.push(sosItem);
          failed++;
        }
      }

      await Promise.all([
        storage.setItem(CACHE_KEYS.PENDING_FUEL_QUEUE, JSON.stringify(remainingFuel)),
        storage.setItem(CACHE_KEYS.PENDING_SOS_QUEUE, JSON.stringify(remainingSos)),
      ]);
      return { synced, failed };
    } catch {
      return { synced: 0, failed: 0 };
    }
  }

  /**
   * Reporta um incidente operacional / SOS de socorro imediato com fila offline real
   */
  async reportIncident(dto: ReportIncidentDTO): Promise<ReportIncidentResult> {
    if (!networkService.isOnline) {
      const offlineProtocol = `#OFF-${Math.floor(100000 + Math.random() * 900000)}`;
      await this.enqueueOfflineSos(dto, offlineProtocol);
      return {
        message: 'Alerta gravado na fila offline do dispositivo. Será transmitido automaticamente à central assim que houver sinal.',
        incidentId: 'offline-' + Date.now(),
        protocol: offlineProtocol,
        category: dto.category,
        description: dto.description || 'Alerta emitido em modo offline',
        recordedAt: new Date().toISOString(),
        latitude: dto.latitude,
        longitude: dto.longitude,
        locationAddress: dto.locationAddress,
      };
    }

    try {
      const res = await this.authenticatedFetch(
        '/driver-portal/incident',
        {
          method: 'POST',
          body: JSON.stringify(dto),
        },
        30000
      );

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Erro ao emitir alerta de SOS no servidor.');
      }

      return res.json();
    } catch (err: any) {
      // Se for falha de conexão na estrada, persiste na fila offline real
      const isNetworkError =
        !networkService.isOnline ||
        err.name === 'AbortError' ||
        err.message?.includes('Network') ||
        err.message?.includes('Failed to fetch') ||
        err.message?.includes('Abort');

      if (isNetworkError) {
        const offlineProtocol = `#OFF-${Math.floor(100000 + Math.random() * 900000)}`;
        await this.enqueueOfflineSos(dto, offlineProtocol);
        return {
          message: 'Alerta gravado na fila offline do dispositivo. Será transmitido automaticamente à central assim que houver sinal.',
          incidentId: 'offline-' + Date.now(),
          protocol: offlineProtocol,
          category: dto.category,
          description: dto.description || 'Alerta emitido em modo offline',
          recordedAt: new Date().toISOString(),
          latitude: dto.latitude,
          longitude: dto.longitude,
          locationAddress: dto.locationAddress,
        };
      }

      throw err;
    }
  }

  /**
   * Altera a senha temporária no primeiro acesso e rotaciona os tokens JWT
   */
  async changeInitialPassword(
    newPassword: string,
    currentPassword?: string
  ): Promise<{ message: string }> {
    const res = await this.authenticatedFetch('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({
        ...(currentPassword ? { currentPassword } : {}),
        newPassword,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Falha ao redefinir a senha temporária.');
    }

    const data = await res.json();
    if (data.accessToken) {
      await storage.setItem('rm_token', data.accessToken);
    }
    if (data.refreshToken) {
      await storage.setItem('rm_refresh_token', data.refreshToken);
    }

    try {
      const user = await this.getStoredUser();
      if (user) {
        user.mustChangePassword = false;
        await storage.setItem('rm_user', JSON.stringify(user));
        await storage.setItem('rm_last_user', JSON.stringify(user));
      }
    } catch {}

    return { message: data.message || 'Senha definida com sucesso!' };
  }

  /**
   * Altera a senha do usuário autenticado, revogando outras sessões e rotacionando o token atual
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<{ message: string }> {
    const res = await this.authenticatedFetch('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = Array.isArray(err.message) ? err.message[0] : err.message;
      throw new Error(msg || 'Falha ao alterar senha.');
    }

    const data = await res.json();
    if (data.accessToken) {
      await storage.setItem('rm_token', data.accessToken);
    }
    if (data.refreshToken) {
      await storage.setItem('rm_refresh_token', data.refreshToken);
    }

    try {
      const user = await this.getStoredUser();
      if (user) {
        user.mustChangePassword = false;
        await storage.setItem('rm_user', JSON.stringify(user));
        await storage.setItem('rm_last_user', JSON.stringify(user));
      }
    } catch {}
    return { message: data.message || 'Senha alterada com sucesso!' };
  }

  /**
   * Atualiza as informações do perfil (nome)
   */
  async updateProfile(name: string): Promise<{ id: string; name: string; email: string }> {
    const res = await this.authenticatedFetch('/me', {
      method: 'PUT',
      body: JSON.stringify({ name }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Falha ao atualizar dados do perfil.');
    }

    const data = await res.json();

    // Atualiza dados no storage local
    try {
      const user = await this.getStoredUser();
      if (user) {
        user.name = data.name;
        await storage.setItem('rm_user', JSON.stringify(user));
        await storage.setItem('rm_last_user', JSON.stringify(user));
      }
    } catch {}

    return data;
  }

  /**
   * Atualiza a foto do perfil do motorista
   */
  async updateProfilePhoto(photoUrl: string | null): Promise<{ success: boolean; photoUrl: string | null; message: string }> {
    const res = await this.authenticatedFetch('/driver-portal/profile/photo', {
      method: 'PATCH',
      body: JSON.stringify({ photoUrl }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Falha ao atualizar foto de perfil.');
    }

    const result = await res.json();

    // Atualiza cache do resumo do motorista com a nova foto
    try {
      const cachedSummaryStr = await storage.getItem(CACHE_KEYS.CURRENT_TRIP);
      if (cachedSummaryStr) {
        const summary = JSON.parse(cachedSummaryStr);
        if (summary.driver) {
          summary.driver.photoUrl = photoUrl;
          await storage.setItem(CACHE_KEYS.CURRENT_TRIP, JSON.stringify(summary));
        }
      }
    } catch {}

    return result;
  }

  /**
   * Sincroniza telemetria de versão e aparelho com o servidor (com throttle)
   */
  async syncDevice(params: {
    deviceId: string;
    buildNumber: number;
    appVersion: string;
    platform: 'ANDROID' | 'IOS' | 'WEB';
    deviceModel?: string;
    osVersion?: string;
  }): Promise<{ success: boolean; throttled?: boolean; message?: string }> {
    try {
      const res = await this.authenticatedFetch('/driver-portal/device/sync', {
        method: 'POST',
        body: JSON.stringify(params),
      });

      if (!res.ok) {
        return { success: false };
      }

      return res.json();
    } catch {
      return { success: false };
    }
  }
}

export const api = new ApiService();
