import { storage } from './storage.service';

export interface DriverNotificationItem {
  id: string;
  title: string;
  body: string;
  type: 'NEW_TRIP' | 'TRIP_STARTED' | 'TRIP_COMPLETED' | 'PENDING_RECEIPT' | 'ALERT' | 'CNH' | 'INFO';
  timestamp: string;
  read: boolean;
  actionScreen?: 'fuel' | 'trip' | 'profile' | 'route' | 'sos';
}

const STORAGE_KEY = 'rm_driver_notifications';

class NotificationService {
  private listeners: Array<(items: DriverNotificationItem[]) => void> = [];

  /**
   * Obtém a lista atual de notificações persistidas
   */
  async getNotifications(): Promise<DriverNotificationItem[]> {
    try {
      const data = await storage.getItem(STORAGE_KEY);
      if (!data) return this.getDefaultNotifications();
      return JSON.parse(data);
    } catch {
      return this.getDefaultNotifications();
    }
  }

  /**
   * Notificações iniciais amigáveis caso não haja histórico salvo
   */
  private getDefaultNotifications(): DriverNotificationItem[] {
    return [
      {
        id: 'notif_welcome',
        title: 'Bem-vindo ao RM Frotas!',
        body: 'Seu cockpit operacional está conectado com a central de monitoramento em tempo real.',
        type: 'INFO',
        timestamp: new Date().toISOString(),
        read: false,
      },
      {
        id: 'notif_cnh_check',
        title: 'Documentos do Motorista',
        body: 'Mantenha sua CNH e exames toxicológicos sempre atualizados para liberação de viagens.',
        type: 'CNH',
        timestamp: new Date(Date.now() - 3600000).toISOString(),
        read: false,
        actionScreen: 'profile',
      },
    ];
  }

  /**
   * Adiciona uma nova notificação
   */
  async addNotification(
    item: Omit<DriverNotificationItem, 'id' | 'timestamp' | 'read'>
  ): Promise<DriverNotificationItem> {
    const list = await this.getNotifications();
    const newNotif: DriverNotificationItem = {
      ...item,
      id: `notif_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      read: false,
    };

    // Insere no topo da lista (máximo 50 notificações)
    const updated = [newNotif, ...list.slice(0, 49)];
    await storage.setItem(STORAGE_KEY, JSON.stringify(updated));
    this.notifyListeners(updated);
    return newNotif;
  }

  /**
   * Marca uma notificação específica como lida
   */
  async markAsRead(id: string): Promise<void> {
    const list = await this.getNotifications();
    const updated = list.map((n) => (n.id === id ? { ...n, read: true } : n));
    await storage.setItem(STORAGE_KEY, JSON.stringify(updated));
    this.notifyListeners(updated);
  }

  /**
   * Marca todas as notificações como lidas
   */
  async markAllAsRead(): Promise<void> {
    const list = await this.getNotifications();
    const updated = list.map((n) => ({ ...n, read: true }));
    await storage.setItem(STORAGE_KEY, JSON.stringify(updated));
    this.notifyListeners(updated);
  }

  /**
   * Limpa todo o histórico de notificações
   */
  async clearAll(): Promise<void> {
    await storage.setItem(STORAGE_KEY, JSON.stringify([]));
    this.notifyListeners([]);
  }

  /**
   * Retorna a quantidade de notificações não lidas
   */
  async getUnreadCount(): Promise<number> {
    const list = await this.getNotifications();
    return list.filter((n) => !n.read).length;
  }

  /**
   * Inscreve um listener para atualizações em tempo real
   */
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
