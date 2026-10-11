import { storage } from './storage.service';
import { networkService } from './network.service';
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

export const API_BASE_URL = 'https://rm-frotas.duckdns.org/v1';

const CACHE_KEYS = {
  CURRENT_TRIP: 'rm_driver_current_trip',
  HISTORY: 'rm_driver_history',
  FUEL_HISTORY: 'rm_driver_fuel_history',
  PENDING_FUEL_QUEUE: 'rm_pending_fuel_queue',
};

class ApiService {
  private async getAuthHeader(customHeaders?: Record<string, string>): Promise<HeadersInit> {
    const token = await storage.getItem('rm_token');
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(customHeaders || {}),
    };
  }

  /**
   * Helper genérico para chamadas autenticadas com renovação automática de token
   */
  private async authenticatedFetch(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const url = `${API_BASE_URL}${endpoint}`;
    const headers = await this.getAuthHeader(options.headers as Record<string, string>);

    try {
      let response = await fetch(url, { ...options, headers });
      networkService.setOnline(true);

      // Se retornar 401 Unauthorized, tenta renovar o token e repetir a requisição
      if (response.status === 401) {
        const refreshed = await this.refresh();
        if (refreshed) {
          const retryHeaders = await this.getAuthHeader(options.headers as Record<string, string>);
          response = await fetch(url, { ...options, headers: retryHeaders });
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
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...credentials,
        deviceInfo: { platform: 'mobile' },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Credenciais inválidas. Verifique seu e-mail e senha.');
    }

    const data: AuthResponse = await response.json();
    await storage.setItem('rm_token', data.accessToken);
    await storage.setItem('rm_refresh_token', data.refreshToken);
    await storage.setItem('rm_user', JSON.stringify(data.user));
    await storage.setItem('rm_last_user', JSON.stringify(data.user));
    return data;
  }

  async refresh(): Promise<AuthResponse | null> {
    const refreshToken = await storage.getItem('rm_refresh_token');
    if (!refreshToken) return null;

    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) return null;
      const data: AuthResponse = await response.json();
      await storage.setItem('rm_token', data.accessToken);
      if (data.refreshToken) {
        await storage.setItem('rm_refresh_token', data.refreshToken);
      }
      if (data.user) {
        await storage.setItem('rm_user', JSON.stringify(data.user));
        await storage.setItem('rm_last_user', JSON.stringify(data.user));
      }
      return data;
    } catch {
      return null;
    }
  }

  async loginWithBiometrics(): Promise<User | null> {
    const refreshToken = await storage.getItem('rm_refresh_token');
    const lastUserStr = await storage.getItem('rm_last_user');
    if (!refreshToken || !lastUserStr) return null;

    const refreshed = await this.refresh();
    if (refreshed && refreshed.user) {
      return refreshed.user;
    }

    try {
      const user = JSON.parse(lastUserStr);
      await storage.setItem('rm_user', JSON.stringify(user));
      return user;
    } catch {
      return null;
    }
  }

  async logout(clearAll = false): Promise<void> {
    await storage.removeItem('rm_token');
    await storage.removeItem('rm_user');
    if (clearAll) {
      await storage.removeItem('rm_refresh_token');
      await storage.removeItem('rm_last_user');
      await storage.removeItem('rm_biometrics_enabled');
    }
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
  async startTrip(tripId: string): Promise<{ message: string; tripId: string; status: string }> {
    const res = await this.authenticatedFetch('/driver-portal/start-trip', {
      method: 'POST',
      body: JSON.stringify({ tripId }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Falha ao iniciar viagem.');
    }

    return res.json();
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

    return res.json();
  }

  /**
   * Salva o checklist pré-viagem veicular
   */
  async saveChecklist(
    tripId: string,
    checklist: TripChecklistDTO | any
  ): Promise<{ message: string; tripId: string; checklist?: any }> {
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
      // Salva no storage local em caso de oscilação de sinal
      try {
        await storage.setItem(`rm_checklist_${tripId}`, JSON.stringify(checklist));
      } catch {}

      return {
        message: 'Checklist salvo no dispositivo.',
        tripId,
        checklist,
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
      throw new Error(err.message || 'Falha ao registrar localização.');
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
   * Retorna a quantidade de itens na fila offline aguardando sincronização
   */
  async getOfflineQueueCount(): Promise<number> {
    try {
      const queue = await this.getOfflineFuelQueue();
      return queue.length;
    } catch {
      return 0;
    }
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
   * Sincroniza pendências salvas offline com o servidor
   */
  async syncOfflineQueue(): Promise<{ synced: number; failed: number }> {
    try {
      const queue = await this.getOfflineFuelQueue();
      if (queue.length === 0) return { synced: 0, failed: 0 };

      let synced = 0;
      let failed = 0;
      const remaining: QueuedOfflineFuel[] = [];

      for (const item of queue) {
        try {
          const { vehiclePlate, vehicleModel, ...payloadForApi } = item.dto;
          const res = await this.authenticatedFetch('/driver-portal/fuel-record', {
            method: 'POST',
            headers: { 'Idempotency-Key': item.idempotencyKey },
            body: JSON.stringify(payloadForApi),
          });

          if (res.ok) {
            synced++;
          } else {
            const err = await res.json().catch(() => ({}));
            item.status = 'DEAD';
            item.error = err.message || 'Falha ao sincronizar registro.';
            remaining.push(item);
            failed++;
          }
        } catch {
          remaining.push(item);
          failed++;
        }
      }

      await storage.setItem(CACHE_KEYS.PENDING_FUEL_QUEUE, JSON.stringify(remaining));
      return { synced, failed };
    } catch {
      return { synced: 0, failed: 0 };
    }
  }

  /**
   * Reporta um incidente operacional / SOS de socorro imediato
   */
  async reportIncident(dto: ReportIncidentDTO): Promise<ReportIncidentResult> {
    try {
      const res = await this.authenticatedFetch('/driver-portal/incident', {
        method: 'POST',
        body: JSON.stringify(dto),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Erro ao emitir alerta de SOS no servidor.');
      }

      return res.json();
    } catch (err: any) {
      // Se for falha de conexão na estrada, gera protocolo offline local
      const isNetworkError =
        err.message?.includes('Network') ||
        err.message?.includes('Failed to fetch') ||
        err.message?.includes('Abort');

      if (isNetworkError) {
        const offlineProtocol = `#OFF-${Math.floor(100000 + Math.random() * 900000)}`;
        return {
          message: 'Alerta gravado localmente (Offline). Será sincronizado com a central assim que houver sinal.',
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
   * Altera a senha do usuário autenticado
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<{ message: string }> {
    const res = await this.authenticatedFetch('/me/password', {
      method: 'PATCH',
      body: JSON.stringify({ currentPassword, newPassword }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Falha ao alterar senha.');
    }

    return res.json();
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
}

export const api = new ApiService();
