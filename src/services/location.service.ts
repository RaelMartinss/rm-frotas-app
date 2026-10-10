import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { api } from './api.service';
import { storage } from './storage.service';
import { LocationPingDTO } from '../types/driver';

export const LOCATION_TASK_NAME = 'RM_LOCATION_BACKGROUND_TASK';
const STORAGE_ACTIVE_TRIP_KEY = 'rm_active_tracking_trip_id';
const STORAGE_OFFLINE_QUEUE_KEY = 'rm_location_offline_queue';
const STORAGE_LAST_PING_KEY = 'rm_last_sent_ping';

/**
 * Calcula a distância em metros entre duas coordenadas via fórmula de Haversine
 */
export function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Raio médio da Terra em metros
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Filtro inteligente anti-drift e throttling de pings
 */
function shouldSendLocation(
  loc: Location.LocationObject,
  lastPing: { lat: number; lng: number; time: number; heading: number | null } | null
): boolean {
  // Filtro 1: Descarta leituras com acurácia ruim (> 35 metros)
  if (loc.coords.accuracy !== null && loc.coords.accuracy !== undefined && loc.coords.accuracy > 35) {
    return false;
  }

  if (!lastPing) return true;

  const now = loc.timestamp || Date.now();
  const elapsed = now - lastPing.time;
  const distance = calculateHaversineDistance(
    lastPing.lat,
    lastPing.lng,
    loc.coords.latitude,
    loc.coords.longitude
  );

  const speedKmH =
    loc.coords.speed !== null && loc.coords.speed !== undefined
      ? Math.max(0, loc.coords.speed * 3.6)
      : 0;

  // Filtro 2: Anti-drift quando o veículo estiver parado (< 15m e < 2 km/h)
  if (distance < 15 && speedKmH < 2.0) {
    // Envia heartbeat de parada apenas a cada 3 minutos
    return elapsed >= 180000;
  }

  // Filtro 3: Em movimento - intervalo mínimo de 15 segundos ou 20 metros
  if (elapsed < 15000 && distance < 20) {
    // Antecipa se houver curva acentuada (mudança de direção >= 25° e deslocamento >= 8m)
    if (loc.coords.heading !== null && loc.coords.heading !== undefined && lastPing.heading !== null) {
      const headingDiff = Math.abs(loc.coords.heading - lastPing.heading);
      const normalizedDiff = headingDiff > 180 ? 360 - headingDiff : headingDiff;
      if (normalizedDiff >= 25 && distance >= 8) {
        return true;
      }
    }
    return false;
  }

  return true;
}

/**
 * Registra a tarefa de background no nível raiz (obrigatório para TaskManager do Expo)
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

      const rawLastPing = await storage.getItem(STORAGE_LAST_PING_KEY);
      let lastPing: { lat: number; lng: number; time: number; heading: number | null } | null = rawLastPing
        ? JSON.parse(rawLastPing)
        : null;

      const validPings: LocationPingDTO[] = [];

      for (const loc of locations) {
        if (shouldSendLocation(loc, lastPing)) {
          const speedKmH =
            loc.coords.speed !== null && loc.coords.speed !== undefined
              ? Math.round(Math.max(0, loc.coords.speed * 3.6))
              : undefined;

          const heading =
            loc.coords.heading !== null && loc.coords.heading !== undefined
              ? Math.round(loc.coords.heading)
              : undefined;

          const ping: LocationPingDTO = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            accuracy: loc.coords.accuracy ? Math.round(loc.coords.accuracy) : undefined,
            speed: speedKmH,
            heading,
            recordedAt: new Date(loc.timestamp).toISOString(),
          };

          validPings.push(ping);
          lastPing = {
            lat: loc.coords.latitude,
            lng: loc.coords.longitude,
            time: loc.timestamp || Date.now(),
            heading: heading ?? null,
          };
        }
      }

      if (validPings.length > 0) {
        await storage.setItem(STORAGE_LAST_PING_KEY, JSON.stringify(lastPing));
        try {
          // Descarrega pings acumulados offline juntamente com os novos pings
          const rawQueue = await storage.getItem(STORAGE_OFFLINE_QUEUE_KEY);
          const queue: { tripId: string; ping: LocationPingDTO }[] = rawQueue ? JSON.parse(rawQueue) : [];
          const tripPings = queue.filter((q) => q.tripId === activeTripId).map((q) => q.ping);
          const allPings = [...tripPings, ...validPings];

          await api.sendLocationPings(activeTripId, allPings);

          // Remove da fila os pings transmitidos
          const remaining = queue.filter((q) => q.tripId !== activeTripId);
          await storage.setItem(STORAGE_OFFLINE_QUEUE_KEY, JSON.stringify(remaining));
        } catch {
          // Se falhar o envio por falta de sinal na rodovia, enfileira localmente
          await locationService.enqueuePings(activeTripId, validPings);
        }
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
  private lastPingMemory: { lat: number; lng: number; time: number; heading: number | null } | null = null;
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
   * Obtém a localização atual instantânea do dispositivo
   */
  async getCurrentPosition(): Promise<Location.LocationObject | null> {
    try {
      const { foreground } = await this.requestPermissions();
      if (!foreground) return null;
      return await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    } catch {
      return null;
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

    if (this.activeTripId === tripId && (await this.isTracking())) {
      return true;
    }

    this.activeTripId = tripId;
    await storage.setItem(STORAGE_ACTIVE_TRIP_KEY, tripId);

    const { foreground, background } = await this.requestPermissions();
    if (!foreground) {
      console.warn('[LocationService] Permissão de localização em primeiro plano negada.');
      return false;
    }

    // 1. Inicia rastreamento em segundo plano via TaskManager (com Foreground Service do Android)
    if (background) {
      try {
        const hasStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
        if (!hasStarted) {
          await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 15000, // Coleta a cada 15 segundos
            distanceInterval: 20, // Ou a cada 20 metros percorridos
            deferredUpdatesInterval: 30000,
            foregroundService: {
              notificationTitle: 'RM Frotas em Rota',
              notificationBody: 'Rastreamento de telemetria ativo para sua viagem.',
              notificationColor: '#FF7A00',
            },
            pausesUpdatesAutomatically: false,
            showsBackgroundLocationIndicator: true,
          });
        }
      } catch (err: any) {
        console.warn('[LocationService] Não foi possível iniciar updates de background:', err?.message);
      }
    }

    // 2. Inicia rastreamento em primeiro plano para garantir dados imediatos e atualizar a UI
    if (!this.foregroundSubscription && foreground) {
      try {
        this.foregroundSubscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 15000,
            distanceInterval: 20,
          },
          async (loc) => {
            this.notifyListeners(loc);

            if (!shouldSendLocation(loc, this.lastPingMemory)) {
              return;
            }

            const speedKmH =
              loc.coords.speed !== null && loc.coords.speed !== undefined
                ? Math.round(Math.max(0, loc.coords.speed * 3.6))
                : undefined;

            const heading =
              loc.coords.heading !== null && loc.coords.heading !== undefined
                ? Math.round(loc.coords.heading)
                : undefined;

            const ping: LocationPingDTO = {
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
              accuracy: loc.coords.accuracy ? Math.round(loc.coords.accuracy) : undefined,
              speed: speedKmH,
              heading,
              recordedAt: new Date(loc.timestamp).toISOString(),
            };

            this.lastPingMemory = {
              lat: loc.coords.latitude,
              lng: loc.coords.longitude,
              time: loc.timestamp || Date.now(),
              heading: heading ?? null,
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
    this.lastPingMemory = null;
    await storage.removeItem(STORAGE_ACTIVE_TRIP_KEY);
    await storage.removeItem(STORAGE_LAST_PING_KEY);

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

    // Tenta descarregar a fila offline uma última vez
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

      // Limita a fila a no máximo 500 pings mais recentes
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
