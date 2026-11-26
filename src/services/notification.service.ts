import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { storage } from './storage.service';
import { api } from './api.service';
import { DriverPortalSummary } from '../types/driver';

export type NotificationActionScreen = 'fuel' | 'trip' | 'profile' | 'route' | 'sos' | 'history';

export interface DriverNotificationItem {
  id: string;
  title: string;
  body: string;
  type: 'NEW_TRIP' | 'TRIP_STARTED' | 'TRIP_COMPLETED' | 'PENDING_RECEIPT' | 'ALERT' | 'CNH' | 'INFO';
  timestamp: string;
  read: boolean;
  actionScreen?: NotificationActionScreen;
  dedupeKey?: string;
}

interface NotificationPrefs {
  travels: boolean;
  fuel: boolean;
  alerts: boolean;
}

const STORAGE_KEY = 'rm_driver_notifications';
const NOTIFIED_KEYS_STORAGE = 'rm_driver_notified_keys';
const REGISTERED_PUSH_KEY = 'rm_registered_push_token';
const ANDROID_CHANNEL_ID = 'rm_frotas_channel';

try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowAlert: true,
    }),
  });
} catch {
  // Ignora em ambiente web ou caso módulo nativo não esteja presente no dev client antigo
}

class NotificationService {
  private listeners: Array<(items: DriverNotificationItem[]) => void> = [];
  private pushInitializedForUser: string | null = null;
  private remoteSub: Notifications.EventSubscription | null = null;

  private async getUserPrefs(userId?: string | null): Promise<NotificationPrefs> {
    if (!userId) return { travels: true, fuel: true, alerts: true };
    try {
      const raw = await storage.getItem(`rm_notif_prefs_${userId}`);
      if (!raw) return { travels: true, fuel: true, alerts: true };
      const parsed = JSON.parse(raw);
      return {
        travels: typeof parsed.travels === 'boolean' ? parsed.travels : true,
        fuel: typeof parsed.fuel === 'boolean' ? parsed.fuel : true,
        alerts: typeof parsed.alerts === 'boolean' ? parsed.alerts : true,
      };
    } catch {
      return { travels: true, fuel: true, alerts: true };
    }
  }

  private isAllowedByPrefs(type: DriverNotificationItem['type'], prefs: NotificationPrefs): boolean {
    if (type === 'NEW_TRIP' || type === 'TRIP_STARTED' || type === 'TRIP_COMPLETED') {
      return prefs.travels;
    }
    if (type === 'PENDING_RECEIPT') {
      return prefs.fuel;
    }
    return prefs.alerts;
  }

  /**
   * Inicializa canal Android, permissões, listener de Push remoto e registra token na API
   */
  async initializeForUser(userId: string): Promise<void> {
    if (!userId || Platform.OS === 'web') return;
    if (this.pushInitializedForUser === userId) return;
    this.pushInitializedForUser = userId;

    try {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
          name: 'Operação RM Frotas',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF7A00',
          sound: 'default',
        });
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      // Escuta pushes remotos vindos da central RM Frotas e persiste no sininho
      if (!this.remoteSub) {
        this.remoteSub = Notifications.addNotificationReceivedListener((event) => {
          const data = (event.request.content.data || {}) as Record<string, any>;
          // Evita duplicar notificações locais disparadas pelo próprio serviço
          if (data?.source === 'rm_local') return;

          const title = event.request.content.title || data?.title || 'Aviso da Central';
          const body = event.request.content.body || data?.body || '';
          if (!body && !title) return;

          const actionScreen = (data?.actionScreen || data?.screen) as NotificationActionScreen | undefined;
          const rawType = String(data?.type || 'INFO').toUpperCase();
          const validTypes: DriverNotificationItem['type'][] = [
            'NEW_TRIP',
            'TRIP_STARTED',
            'TRIP_COMPLETED',
            'PENDING_RECEIPT',
            'ALERT',
            'CNH',
            'INFO',
          ];
          const type = validTypes.includes(rawType as any)
            ? (rawType as DriverNotificationItem['type'])
            : 'INFO';

          this.addNotification({
            title,
            body,
            type,
            actionScreen,
          }).catch(() => {});
        });
      }

      if (finalStatus !== 'granted') return;

      // Tenta obter token FCM nativo primeiro; se não houver google-services.json, tenta Expo Push Token
      let pushToken: string | null = null;
      try {
        const deviceToken = await Notifications.getDevicePushTokenAsync();
        if (deviceToken?.data && typeof deviceToken.data === 'string') {
          pushToken = deviceToken.data;
        }
      } catch {}

      if (!pushToken) {
        try {
          const expoToken = await Notifications.getExpoPushTokenAsync();
          if (expoToken?.data) {
            pushToken = expoToken.data;
          }
        } catch {}
      }

      if (pushToken) {
        const lastRegistered = await storage.getItem(REGISTERED_PUSH_KEY);
        if (lastRegistered !== `${userId}:${pushToken}`) {
          const ok = await api.registerPushToken(pushToken);
          if (ok) {
            await storage.setItem(REGISTERED_PUSH_KEY, `${userId}:${pushToken}`);
          }
        }
      }
    } catch {
      // Silencioso caso rode em emulador sem Google Play Services
    }
  }

  private async fireLocalOsBanner(title: string, body: string, actionScreen?: NotificationActionScreen) {
    if (Platform.OS === 'web') return;
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          sound: 'default',
          data: {
            source: 'rm_local',
            ...(actionScreen ? { actionScreen } : {}),
          },
          ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : {}),
        } as any,
        trigger: null,
      });
    } catch {}
  }

  private async hasNotifiedKey(key: string): Promise<boolean> {
    try {
      const raw = await storage.getItem(NOTIFIED_KEYS_STORAGE);
      if (!raw) return false;
      const list: string[] = JSON.parse(raw);
      return Array.isArray(list) && list.includes(key);
    } catch {
      return false;
    }
  }

  private async markNotifiedKey(key: string): Promise<void> {
    try {
      const raw = await storage.getItem(NOTIFIED_KEYS_STORAGE);
      const list: string[] = raw ? JSON.parse(raw) : [];
      const safeList = Array.isArray(list) ? list.filter((k) => k !== key) : [];
      safeList.unshift(key);
      await storage.setItem(NOTIFIED_KEYS_STORAGE, JSON.stringify(safeList.slice(0, 120)));
    } catch {}
  }

  /**
   * Obtém a lista atual de notificações persistidas
   */
  async getNotifications(): Promise<DriverNotificationItem[]> {
    try {
      const data = await storage.getItem(STORAGE_KEY);
      if (!data) return [];
      const parsed = JSON.parse(data);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((n) => n?.id !== 'notif_welcome' && n?.id !== 'notif_cnh_check');
    } catch {
      return [];
    }
  }

  /**
   * Adiciona uma nova notificação operacional (respeitando preferências e deduplicação)
   */
  async addNotification(
    item: Omit<DriverNotificationItem, 'id' | 'timestamp' | 'read'>,
    options?: { userId?: string; notifyOs?: boolean }
  ): Promise<DriverNotificationItem | null> {
    const prefs = await this.getUserPrefs(options?.userId);
    if (!this.isAllowedByPrefs(item.type, prefs)) {
      return null;
    }

    if (item.dedupeKey && (await this.hasNotifiedKey(item.dedupeKey))) {
      return null;
    }

    const list = await this.getNotifications();
    const newNotif: DriverNotificationItem = {
      ...item,
      id: `notif_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      read: false,
    };

    const updated = [newNotif, ...list.slice(0, 49)];
    await storage.setItem(STORAGE_KEY, JSON.stringify(updated));
    if (item.dedupeKey) {
      await this.markNotifiedKey(item.dedupeKey);
    }
    this.notifyListeners(updated);

    if (options?.notifyOs) {
      await this.fireLocalOsBanner(item.title, item.body, item.actionScreen);
    }

    return newNotif;
  }

  /**
   * Avalia o resumo operacional do motorista (viagem escalada, comprovantes pendentes e CNH)
   * e alimenta a Central de Avisos com deduplicação inteligente.
   */
  async syncOperationalAlerts(userId: string, summary: DriverPortalSummary | null): Promise<void> {
    if (!userId || !summary) return;

    const todayKey = new Date().toISOString().slice(0, 10);

    // 1. Nova viagem escalada ou em rota
    if (summary.trip?.id) {
      const trip = summary.trip;
      const origin = trip.originCity || trip.originAddress || 'Origem';
      const dest = trip.destinationCity || trip.destinationAddress || 'Destino';
      const plate = trip.vehicle?.plate || 'Frota';

      if (trip.status === 'PLANNED' || trip.status === 'SCHEDULED') {
        await this.addNotification(
          {
            title: 'Nova Viagem Escalada',
            body: `Rota ${origin} ➔ ${dest} programada no veículo ${plate}. Confira o checklist para iniciar.`,
            type: 'NEW_TRIP',
            actionScreen: 'trip',
            dedupeKey: `trip_scheduled_${trip.id}`,
          },
          { userId, notifyOs: true }
        );
      } else if (trip.status === 'IN_PROGRESS') {
        await this.addNotification(
          {
            title: 'Viagem em Rota Ativa',
            body: `Trajeto ${origin} ➔ ${dest} (${plate}) em andamento. Toque para abrir o itinerário.`,
            type: 'TRIP_STARTED',
            actionScreen: 'route',
            dedupeKey: `trip_active_${trip.id}`,
          },
          { userId, notifyOs: false }
        );
      }
    }

    // 2. Comprovantes fiscais de abastecimento pendentes
    const pendingReceipts = summary.pendingReceiptsCount ?? 0;
    if (pendingReceipts > 0) {
      await this.addNotification(
        {
          title: 'Comprovante Fiscal Pendente',
          body:
            pendingReceipts === 1
              ? 'Há 1 abastecimento aguardando a foto do cupom fiscal. Toque para anexar.'
              : `Há ${pendingReceipts} abastecimentos aguardando foto do cupom fiscal. Toque para regularizar.`,
          type: 'PENDING_RECEIPT',
          actionScreen: 'history',
          dedupeKey: `pending_receipts_${todayKey}_${pendingReceipts}`,
        },
        { userId, notifyOs: false }
      );
    }

    // 3. CNH vencida ou próxima do vencimento (<= 30 dias)
    if (summary.driver) {
      const drv = summary.driver;
      if (drv.isCnhExpired) {
        await this.addNotification(
          {
            title: 'CNH Vencida • Saída Bloqueada',
            body: 'Sua habilitação consta vencida no sistema. Procure o gestor da frota para regularização.',
            type: 'CNH',
            actionScreen: 'profile',
            dedupeKey: `cnh_expired_${drv.id}_${todayKey}`,
          },
          { userId, notifyOs: true }
        );
      } else if (
        drv.daysUntilCnhExpires !== undefined &&
        drv.daysUntilCnhExpires >= 0 &&
        drv.daysUntilCnhExpires <= 30
      ) {
        const bucket = drv.daysUntilCnhExpires <= 7 ? `d${drv.daysUntilCnhExpires}` : `w${Math.ceil(drv.daysUntilCnhExpires / 7)}`;
        await this.addNotification(
          {
            title: `CNH Vence em ${drv.daysUntilCnhExpires} dia(s)`,
            body: `Validade registrada: ${drv.cnhExpirationDate}. Providencie a renovação para evitar bloqueio de escala.`,
            type: 'CNH',
            actionScreen: 'profile',
            dedupeKey: `cnh_soon_${drv.id}_${bucket}`,
          },
          { userId, notifyOs: drv.daysUntilCnhExpires <= 7 }
        );
      }
    }
  }

  async markAsRead(id: string): Promise<void> {
    const list = await this.getNotifications();
    const updated = list.map((n) => (n.id === id ? { ...n, read: true } : n));
    await storage.setItem(STORAGE_KEY, JSON.stringify(updated));
    this.notifyListeners(updated);
  }

  async markAllAsRead(): Promise<void> {
    const list = await this.getNotifications();
    const updated = list.map((n) => ({ ...n, read: true }));
    await storage.setItem(STORAGE_KEY, JSON.stringify(updated));
    this.notifyListeners(updated);
  }

  async clearAll(): Promise<void> {
    await storage.setItem(STORAGE_KEY, JSON.stringify([]));
    this.notifyListeners([]);
  }

  resetSessionState(): void {
    this.pushInitializedForUser = null;
    this.notifyListeners([]);
  }

  async getUnreadCount(): Promise<number> {
    const list = await this.getNotifications();
    return list.filter((n) => !n.read).length;
  }

  subscribe(listener: (items: DriverNotificationItem[]) => void): () => void {
    this.listeners.push(listener);
    this.getNotifications().then(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notifyListeners(items: DriverNotificationItem[]) {
    this.listeners.forEach((l) => l(items));
  }
}

export const notificationService = new NotificationService();
