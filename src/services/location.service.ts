import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { api } from './api.service';
import { storage } from './storage.service';
import { LocationPingDTO } from '../types/driver';

export const LOCATION_TASK_NAME = 'RM_LOCATION_BACKGROUND_TASK';
const STORAGE_ACTIVE_TRIP_KEY = 'rm_active_tracking_trip_id';
const STORAGE_OFFLINE_QUEUE_KEY = 'rm_location_offline_queue';

/**
 * Registra a tarefa de background no nível raiz (necessário para o TaskManager do Expo)
 */
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.warn('[LocationService - Background] Erro no TaskManager:', error.message);
    return;
  }

  if (data) {
    const { locations } = data as { locations: Location.LocationObject[] };
    if (!locations || locations.length === 0) return;

    try {
      const activeTripId = await storage.getItem(STORAGE_ACTIVE_TRIP_KEY);
      if (!activeTripId) return;

      const pings: LocationPingDTO[] = locations.map((loc) => ({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        accuracy: loc.coords.accuracy ? Math.round(loc.coords.accuracy) : undefined,
        // Converte velocidade de m/s para km/h
        speed: loc.coords.speed !== null && loc.coords.speed !== undefined
          ? Math.round(Math.max(0, loc.coords.speed * 3.6))
          : undefined,
        heading: loc.coords.heading !== null && loc.coords.heading !== undefined
          ? Math.round(loc.coords.heading)
          : undefined,
        recordedAt: new Date(loc.timestamp).toISOString(),
      }));

      // Tenta enviar para a API
      try {
        await api.sendLocationPings(activeTripId, pings);
      } catch {
        // Em caso de falha de conexão ou offline, enfileira localmente
        await locationService.enqueuePings(activeTripId, pings);
      }
    } catch (e: any) {
      console.warn('[LocationService - Background] Falha ao processar pings:', e?.message);
    }
  }
});

class LocationService {
  private foregroundSubscription: Location.LocationSubscription | null = null;
  private queueFlushTimer: ReturnType<typeof setInterval> | null = null;
  private activeTripId: string | null = null;
  private onLocationChangeListeners: ((loc: Location.LocationObject) => void)[] = [];

  /**
   * Solicita permissões de localização (primeiro em primeiro plano, depois em segundo plano)
   */
  async requestPermissions(): Promise<{ foreground: boolean; background: boolean }> {
    try {
      const fg = await Location.getForegroundPermissionsAsync();
      let foreground = fg.granted;
      if (!foreground) {
        const reqFg = await Location.requestForegroundPermissionsAsync();
        foreground = reqFg.granted;
      }

      let background = false;
      if (foreground) {
        const bg = await Location.getBackgroundPermissionsAsync();
        background = bg.granted;
        if (!background) {
          const reqBg = await Location.requestBackgroundPermissionsAsync();
          background = reqBg.granted;
        }
      }

      return { foreground, background };
    } catch (e: any) {
      console.warn('[LocationService] Erro ao solicitar permissões:', e?.message);
      return { foreground: false, background: false };
    }
  }

  /**
   * Verifica se o rastreamento em segundo plano está atualmente ativo
   */
  async isTracking(): Promise<boolean> {
    try {
      const hasStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
      return hasStarted;
    } catch {
      return false;
    }
  }

  /**
   * Inicia o rastreamento GPS para a viagem ativa
   */
  async startTracking(tripId: string): Promise<boolean> {
    if (!tripId) return false;

    this.activeTripId = tripId;
    await storage.setItem(STORAGE_ACTIVE_TRIP_KEY, tripId);

    const { foreground, background } = await this.requestPermissions();
    if (!foreground) {
      console.warn('[LocationService] Permissão de localização em primeiro plano negada.');
      return false;
    }

    // 1. Inicia rastreamento em segundo plano via TaskManager (se permissão concedida)
    if (background) {
      try {
        const hasStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
        if (!hasStarted) {
          await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 15000, // Coleta a cada 15 segundos
            distanceInterval: 30, // Ou a cada 30 metros percorridos
            deferredUpdatesInterval: 30000,
            foregroundService: {
              notificationTitle: 'RM Frotas em Rota',
              notificationBody: 'Rastreamento de GPS ativo para sua viagem.',
              notificationColor: '#FF6B00',
            },
            pausesUpdatesAutomatically: false,
            showsBackgroundLocationIndicator: true,
          });
        }
      } catch (err: any) {
        console.warn('[LocationService] Não foi possível iniciar updates de background:', err?.message);
      }
    }

    // 2. Inicia rastreamento em primeiro plano para garantir dados imediatos
    if (!this.foregroundSubscription && foreground) {
      try {
        this.foregroundSubscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 15000,
            distanceInterval: 25,
          },
          async (loc) => {
            // Notifica listeners locais (ex: mapa ou UI)
            this.notifyListeners(loc);

            // Envia ping imediato
            const ping: LocationPingDTO = {
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
              accuracy: loc.coords.accuracy ? Math.round(loc.coords.accuracy) : undefined,
              speed: loc.coords.speed !== null && loc.coords.speed !== undefined
                ? Math.round(Math.max(0, loc.coords.speed * 3.6))
                : undefined,
              heading: loc.coords.heading !== null && loc.coords.heading !== undefined
                ? Math.round(loc.coords.heading)
                : undefined,
              recordedAt: new Date(loc.timestamp).toISOString(),
            };

            try {
              await api.sendLocationPings(tripId, [ping]);
            } catch {
              await this.enqueuePings(tripId, [ping]);
            }
          }
        );
      } catch (e: any) {
        console.warn('[LocationService] Erro ao iniciar watchPositionAsync:', e?.message);
      }
    }

    // 3. Inicia timer periódico para esvaziar a fila offline (a cada 30 segundos)
    if (!this.queueFlushTimer) {
      this.queueFlushTimer = setInterval(() => {
        this.flushOfflineQueue();
      }, 30000);
    }

    return true;
  }

  /**
   * Encerra o rastreamento GPS da viagem
   */
  async stopTracking(): Promise<void> {
    this.activeTripId = null;
    await storage.removeItem(STORAGE_ACTIVE_TRIP_KEY);

    // Para o watcher de primeiro plano
    if (this.foregroundSubscription) {
      this.foregroundSubscription.remove();
      this.foregroundSubscription = null;
    }

    // Para o timer de fila offline
    if (this.queueFlushTimer) {
      clearInterval(this.queueFlushTimer);
      this.queueFlushTimer = null;
    }

    // Para o serviço de background do TaskManager
    try {
      const hasStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
      if (hasStarted) {
        await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      }
    } catch (e: any) {
      console.warn('[LocationService] Erro ao parar task de background:', e?.message);
    }

    // Tenta esvaziar a fila offline uma última vez
    await this.flushOfflineQueue();
  }

  /**
   * Adiciona pings na fila offline local
   */
  async enqueuePings(tripId: string, pings: LocationPingDTO[]): Promise<void> {
    try {
      const raw = await storage.getItem(STORAGE_OFFLINE_QUEUE_KEY);
      const queue: { tripId: string; ping: LocationPingDTO }[] = raw ? JSON.parse(raw) : [];

      pings.forEach((p) => {
        queue.push({ tripId, ping: p });
      });

      // Limita a fila a no máximo 500 pings mais recentes para evitar uso excessivo de armazenamento
      const trimmed = queue.slice(-500);
      await storage.setItem(STORAGE_OFFLINE_QUEUE_KEY, JSON.stringify(trimmed));
    } catch (e: any) {
      console.warn('[LocationService] Erro ao enfileirar pings:', e?.message);
    }
  }

  /**
   * Tenta enviar todos os pings acumulados na fila offline para a API
   */
  async flushOfflineQueue(): Promise<void> {
    try {
      const raw = await storage.getItem(STORAGE_OFFLINE_QUEUE_KEY);
      if (!raw) return;

      const queue: { tripId: string; ping: LocationPingDTO }[] = JSON.parse(raw);
      if (queue.length === 0) return;

      // Agrupa pings por tripId
      const byTrip: Record<string, LocationPingDTO[]> = {};
      queue.forEach((item) => {
        if (!byTrip[item.tripId]) byTrip[item.tripId] = [];
        byTrip[item.tripId].push(item.ping);
      });

      const remainingQueue: { tripId: string; ping: LocationPingDTO }[] = [];

      for (const tripId of Object.keys(byTrip)) {
        const pings = byTrip[tripId];
        try {
          await api.sendLocationPings(tripId, pings);
        } catch {
          // Se falhar o envio para este tripId, mantém na fila
          pings.forEach((p) => remainingQueue.push({ tripId, ping: p }));
        }
      }

      await storage.setItem(STORAGE_OFFLINE_QUEUE_KEY, JSON.stringify(remainingQueue));
    } catch (e: any) {
      console.warn('[LocationService] Erro ao descarregar fila offline:', e?.message);
    }
  }

  /**
   * Inscreve um listener para atualizações de localização em tempo real
   */
  onLocationUpdate(listener: (loc: Location.LocationObject) => void): () => void {
    this.onLocationChangeListeners.push(listener);
    return () => {
      this.onLocationChangeListeners = this.onLocationChangeListeners.filter((l) => l !== listener);
    };
  }

  private notifyListeners(loc: Location.LocationObject) {
    this.onLocationChangeListeners.forEach((listener) => {
      try {
        listener(loc);
      } catch (e: any) {
        console.warn('[LocationService] Erro em listener:', e?.message);
      }
    });
  }
}

export const locationService = new LocationService();
