import { storage } from './storage.service';
import { AuthResponse, LoginCredentials, User } from '../types/auth';

export const API_BASE_URL = 'https://rm-frotas.duckdns.org/v1';

class ApiService {
  private async getAuthHeader(): Promise<HeadersInit> {
    const token = await storage.getItem('rm_token');
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

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
      // Se a renovação silenciosa precisar do usuário anterior já cacheado:
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
}

export const api = new ApiService();
