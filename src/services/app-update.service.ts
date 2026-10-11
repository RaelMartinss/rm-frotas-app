import { NativeModules, DeviceEventEmitter, Platform, Linking, Alert } from 'react-native';

export const CURRENT_APP_VERSION = '1.0.19';
export const GITHUB_REPO = 'RaelMartinss/rm-frotas-app';

const { AppInstaller } = NativeModules;

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

export interface UpdateDownloadState {
  isDownloading: boolean;
  progress: number;
  error: string | null;
  completed: boolean;
}

type StateListener = (state: UpdateDownloadState) => void;

class AppUpdateService {
  private downloadState: UpdateDownloadState = {
    isDownloading: false,
    progress: 0,
    error: null,
    completed: false,
  };

  private listeners: Set<StateListener> = new Set();
  private isSubscribed = false;

  constructor() {
    this.setupListeners();
  }

  private setupListeners() {
    if (this.isSubscribed || Platform.OS !== 'android') return;

    DeviceEventEmitter.addListener('app_update_progress', (data: { progress: number }) => {
      this.updateState({
        isDownloading: true,
        progress: data?.progress || 0,
        error: null,
        completed: false,
      });
    });

    DeviceEventEmitter.addListener('app_update_completed', () => {
      this.updateState({
        isDownloading: false,
        progress: 100,
        error: null,
        completed: true,
      });
    });

    DeviceEventEmitter.addListener('app_update_error', (data: { error: string }) => {
      this.updateState({
        isDownloading: false,
        progress: 0,
        error: data?.error || 'Falha ao baixar atualização.',
        completed: false,
      });
    });

    this.isSubscribed = true;
  }

  private updateState(partial: Partial<UpdateDownloadState>) {
    this.downloadState = { ...this.downloadState, ...partial };
    this.listeners.forEach((listener) => {
      try {
        listener(this.downloadState);
      } catch (err) {
        console.error('[AppUpdateService] Erro no listener:', err);
      }
    });
  }

  getDownloadState(): UpdateDownloadState {
    return this.downloadState;
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    listener(this.downloadState);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async canInstall(): Promise<boolean> {
    if (Platform.OS === 'android' && AppInstaller?.canInstall) {
      try {
        return await AppInstaller.canInstall();
      } catch {
        return true;
      }
    }
    return true;
  }

  async openInstallSettings(): Promise<void> {
    if (Platform.OS === 'android' && AppInstaller?.openInstallSettings) {
      try {
        await AppInstaller.openInstallSettings();
      } catch (err) {
        console.warn('[AppUpdateService] Falha ao abrir configurações:', err);
      }
    }
  }

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
          'User-Agent': 'RM-Frotas-App',
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
        releaseNotes: this.formatReleaseNotes(release.body),
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
   * Inicia o download e instalação direta do APK dentro do app sem abrir o navegador
   */
  async downloadAndInstall(downloadUrl: string): Promise<void> {
    const targetUrl = downloadUrl || '';
    if (!targetUrl) {
      Alert.alert('Erro', 'Link do instalador APK não encontrado na versão.');
      return;
    }

    if (Platform.OS === 'android' && AppInstaller?.downloadAndInstall) {
      try {
        const can = await this.canInstall();
        if (!can) {
          Alert.alert(
            'Permissão Necessária',
            'Para instalar atualizações automaticamente, você precisa autorizar a instalação de aplicativos desta fonte nas configurações do Android.',
            [
              { text: 'Cancelar', style: 'cancel' },
              {
                text: 'Abrir Configurações',
                onPress: () => this.openInstallSettings(),
              },
            ]
          );
          return;
        }

        this.updateState({
          isDownloading: true,
          progress: 0,
          error: null,
          completed: false,
        });

        await AppInstaller.downloadAndInstall(targetUrl);
      } catch (err: any) {
        this.updateState({
          isDownloading: false,
          progress: 0,
          error: err.message || 'Erro ao iniciar download nativo.',
          completed: false,
        });
        Alert.alert('Erro no Instalador', err.message || 'Falha ao iniciar download nativo.');
      }
    } else {
      // Fallback para ambiente de desenvolvimento ou navegador
      const supported = await Linking.canOpenURL(targetUrl);
      if (supported) {
        await Linking.openURL(targetUrl);
      } else {
        Alert.alert('Download', 'Acesse o portal para baixar a atualização mais recente.');
      }
    }
  }

  /**
   * Limpa o texto da nota de versão para exibição amigável ao usuário final (padrão de mercado)
   */
  private formatReleaseNotes(rawBody?: string): string {
    if (!rawBody || typeof rawBody !== 'string') {
      return '• Aprimoramentos de desempenho e novas funcionalidades\n• Correções gerais e maior estabilidade no aplicativo';
    }

    // Se o body contém URLs de changelog do GitHub (ex: **Full Changelog**: https://github.com/...)
    // removemos as URLs cruas e mantemos apenas itens descritivos ou retornamos o resumo padrão
    const cleanLines = rawBody
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => {
        if (!line) return false;
        if (line.includes('Full Changelog') || line.includes('github.com')) return false;
        if (line.startsWith('Merge branch') || line.startsWith('Merge pull request')) return false;
        return true;
      });

    if (cleanLines.length === 0) {
      return '• Melhorias de desempenho e interface\n• Correções de estabilidade e navegação operacional';
    }

    return cleanLines.join('\n');
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
