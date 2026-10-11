import { Platform } from 'react-native';
import { storage } from './storage.service';
import { api } from './api.service';
import { CURRENT_APP_VERSION } from './app-update.service';

// Build number incremental numérico obrigatório para comparação matemática
export const CURRENT_BUILD_NUMBER = 21;

const DEVICE_ID_KEY = 'rm_device_uuid';
const LAST_SYNC_KEY = 'rm_device_last_sync_ts';

class DeviceService {
  /**
   * Obtém ou cria um UUID único e persistente para este aparelho físico
   */
  async getOrCreateDeviceId(): Promise<string> {
    try {
      const existing = await storage.getItem(DEVICE_ID_KEY);
      if (existing) {
        return existing;
      }

      // Gera UUID v4 padrão
      const newId = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 10);
      await storage.setItem(DEVICE_ID_KEY, newId);
      return newId;
    } catch {
      return 'dev_fallback_' + Date.now();
    }
  }

  /**
   * Extrai o modelo do dispositivo de forma leve sem requerer libs binárias pesadas
   */
  getDeviceModel(): string {
    if (Platform.OS === 'android') {
      const constants = Platform.constants as any;
      const brand = constants?.Brand || constants?.Manufacturer || '';
      const model = constants?.Model || '';
      return `${brand} ${model}`.trim() || 'Android Device';
    }
    if (Platform.OS === 'ios') {
      return 'Apple iPhone/iPad';
    }
    return 'Web Browser';
  }

  /**
   * Extrai a versão do sistema operacional
   */
  getOsVersion(): string {
    if (Platform.OS === 'android') {
      const release = (Platform.constants as any)?.Release || '';
      return `Android ${release || Platform.Version}`;
    }
    if (Platform.OS === 'ios') {
      return `iOS ${Platform.Version}`;
    }
    return `Web ${Platform.Version}`;
  }

  /**
   * Sincroniza a versão do app e aparelho com o backend (com throttle local de 5 min)
   */
  async syncDeviceTelemetry(force = false): Promise<void> {
    try {
      const now = Date.now();
      const lastSyncStr = await storage.getItem(LAST_SYNC_KEY);
      const lastSync = lastSyncStr ? parseInt(lastSyncStr, 10) : 0;
      const fiveMinutesMs = 5 * 60 * 1000;

      // Throttle local: só envia se passou mais de 5 min ou se for forçado
      if (!force && now - lastSync < fiveMinutesMs) {
        return;
      }

      const deviceId = await this.getOrCreateDeviceId();
      const platform = Platform.OS === 'android' ? 'ANDROID' : Platform.OS === 'ios' ? 'IOS' : 'WEB';
      const deviceModel = this.getDeviceModel();
      const osVersion = this.getOsVersion();

      const result = await api.syncDevice({
        deviceId,
        buildNumber: CURRENT_BUILD_NUMBER,
        appVersion: CURRENT_APP_VERSION,
        platform,
        deviceModel,
        osVersion,
      });

      if (result.success) {
        await storage.setItem(LAST_SYNC_KEY, now.toString());
      }
    } catch (err) {
      // Falha silenciosa para não interromper a navegação do motorista
      console.warn('[DeviceService] Telemetry sync skipped:', err);
    }
  }
}

export const deviceService = new DeviceService();
