import * as LocalAuthentication from 'expo-local-authentication';
import { storage } from './storage.service';

export type BiometricType = 'fingerprint' | 'facial' | 'iris' | 'generic' | 'none';

class BiometricService {
  private readonly BIOMETRIC_KEY = 'rm_biometrics_enabled';

  /**
   * Verifica se o dispositivo possui hardware de biometria e se há biometrias cadastradas.
   */
  async isAvailable(): Promise<boolean> {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      if (!hasHardware) return false;
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      return isEnrolled;
    } catch {
      return false;
    }
  }

  /**
   * Retorna o tipo de biometria predominante no dispositivo.
   */
  async getBiometryType(): Promise<BiometricType> {
    try {
      const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
      if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
        return 'facial';
      }
      if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
        return 'fingerprint';
      }
      if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
        return 'iris';
      }
      if (types.length > 0) {
        return 'generic';
      }
      return 'none';
    } catch {
      return 'none';
    }
  }

  /**
   * Verifica se o usuário ativou a biometria para login rápido.
   */
  async isEnabled(): Promise<boolean> {
    const val = await storage.getItem(this.BIOMETRIC_KEY);
    return val === 'true';
  }

  /**
   * Verifica se o usuário já definiu explicitamente sua preferência de biometria (ativada ou desativada).
   */
  async hasExplicitPreference(): Promise<boolean> {
    const val = await storage.getItem(this.BIOMETRIC_KEY);
    return val !== null;
  }

  /**
   * Salva a preferência de biometria do usuário.
   */
  async setEnabled(enabled: boolean): Promise<void> {
    await storage.setItem(this.BIOMETRIC_KEY, enabled ? 'true' : 'false');
  }

  /**
   * Executa a autenticação biométrica nativa estrita (impressão digital / FaceID real, sem fallback para PIN do celular).
   */
  async authenticate(promptMessage = 'Confirme sua biometria para acessar o RM Frotas'): Promise<boolean> {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage,
        cancelLabel: 'Cancelar',
        disableDeviceFallback: true,
      });

      return result.success;
    } catch (err) {
      console.warn('[BiometricService] Falha na autenticação biométrica:', err);
      return false;
    }
  }
}

export const biometricService = new BiometricService();
