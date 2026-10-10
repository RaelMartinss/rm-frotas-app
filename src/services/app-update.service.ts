import { Linking } from 'react-native';

export const CURRENT_APP_VERSION = '1.0.0';
export const GITHUB_REPO = 'RaelMartinss/rm-frotas-app';

export interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  html_url: string;
  assets: Array<{
    name: string;
    browser_download_url: string;
    size: number;
  }>;
}

export interface UpdateInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  downloadUrl: string;
  releaseNotes: string;
}

class AppUpdateService {
  /**
   * Consulta a API do GitHub Releases para verificar se há versão mais recente
   */
  async checkForUpdates(): Promise<UpdateInfo> {
    try {
      const releasesUrl = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest?_t=${Date.now()}`;
      const response = await fetch(releasesUrl, {
        method: 'GET',
        headers: {
          Accept: 'application/vnd.github.v3+json',
        },
      });

      if (!response.ok) {
        return {
          hasUpdate: false,
          currentVersion: CURRENT_APP_VERSION,
          latestVersion: CURRENT_APP_VERSION,
          downloadUrl: '',
          releaseNotes: '',
        };
      }

      const release: GitHubRelease = await response.json();
      if (!release || !release.tag_name) {
        return {
          hasUpdate: false,
          currentVersion: CURRENT_APP_VERSION,
          latestVersion: CURRENT_APP_VERSION,
          downloadUrl: '',
          releaseNotes: '',
        };
      }

      const latestTag = release.tag_name.replace(/^v/i, '').trim();
      const apkAsset = release.assets?.find((a) => a.name.endsWith('.apk'));
      const downloadUrl = apkAsset?.browser_download_url || release.html_url || '';

      const hasUpdate = this.isNewerVersion(latestTag, CURRENT_APP_VERSION);

      return {
        hasUpdate,
        currentVersion: CURRENT_APP_VERSION,
        latestVersion: latestTag,
        downloadUrl,
        releaseNotes: release.body || 'Melhorias de desempenho e novas funcionalidades.',
      };
    } catch (err) {
      console.warn('[AppUpdateService] Falha ao verificar atualizações:', err);
      return {
        hasUpdate: false,
        currentVersion: CURRENT_APP_VERSION,
        latestVersion: CURRENT_APP_VERSION,
        downloadUrl: '',
        releaseNotes: '',
      };
    }
  }

  /**
   * Inicia o download e instalação do APK no Android via browser nativo / gerenciador de downloads
   */
  async downloadAndInstall(downloadUrl: string): Promise<void> {
    const targetUrl = downloadUrl || `https://github.com/${GITHUB_REPO}/releases/latest`;
    const supported = await Linking.canOpenURL(targetUrl);
    if (supported) {
      await Linking.openURL(targetUrl);
    } else {
      throw new Error('Não foi possível abrir o link de download no navegador.');
    }
  }

  /**
   * Compara duas versões em formato SemVer (ex: 1.0.1 > 1.0.0)
   */
  private isNewerVersion(remote: string, current: string): boolean {
    try {
      const rParts = remote.split('.').map((p) => parseInt(p, 10) || 0);
      const cParts = current.split('.').map((p) => parseInt(p, 10) || 0);

      for (let i = 0; i < Math.max(rParts.length, cParts.length); i++) {
        const r = rParts[i] || 0;
        const c = cParts[i] || 0;
        if (r > c) return true;
        if (r < c) return false;
      }
    } catch {
      return false;
    }
    return false;
  }
}

export const appUpdateService = new AppUpdateService();
