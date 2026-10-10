import { Linking, Platform, Alert } from 'react-native';

export interface NavigationTarget {
  name: string;
  address: string;
  city?: string;
  state?: string;
  latitude?: number;
  longitude?: number;
}

class NavigationService {
  /**
   * Formata a query de destino para busca ótima no mapa
   */
  private formatDestinationQuery(target: NavigationTarget | string): string {
    if (typeof target === 'string') {
      return target;
    }

    if (target.latitude && target.longitude) {
      return `${target.latitude},${target.longitude}`;
    }

    const parts = [target.address, target.city, target.state, 'Brasil'].filter(Boolean);
    return parts.join(', ');
  }

  /**
   * Abre a rota de navegação diretamente no Google Maps
   */
  async openGoogleMaps(target: NavigationTarget | string): Promise<boolean> {
    const query = this.formatDestinationQuery(target);
    const encoded = encodeURIComponent(query);

    // URL universal do Google Maps Navigation
    const webUrl = `https://www.google.com/maps/dir/?api=1&destination=${encoded}`;
    const nativeUri =
      Platform.OS === 'android'
        ? `google.navigation:q=${encoded}`
        : `comgooglemaps://?daddr=${encoded}&directionsmode=driving`;

    try {
      const canOpenNative = await Linking.canOpenURL(nativeUri);
      if (canOpenNative) {
        await Linking.openURL(nativeUri);
        return true;
      }
    } catch {
      // Ignora falha de scheme nativo e tenta webUrl
    }

    try {
      await Linking.openURL(webUrl);
      return true;
    } catch {
      Alert.alert('Erro', 'Não foi possível iniciar o Google Maps neste aparelho.');
      return false;
    }
  }

  /**
   * Abre a rota de navegação diretamente no Waze
   */
  async openWaze(target: NavigationTarget | string): Promise<boolean> {
    const query = this.formatDestinationQuery(target);
    const encoded = encodeURIComponent(query);

    const wazeNativeUri = `waze://?q=${encoded}&navigate=yes`;
    const wazeWebUrl = `https://waze.com/ul?q=${encoded}&navigate=yes`;

    try {
      const canOpenNative = await Linking.canOpenURL(wazeNativeUri);
      if (canOpenNative) {
        await Linking.openURL(wazeNativeUri);
        return true;
      }
    } catch {
      // Fallback para link web do Waze ou loja
    }

    try {
      await Linking.openURL(wazeWebUrl);
      return true;
    } catch {
      Alert.alert('Erro', 'O Waze não está instalado ou não pôde ser aberto.');
      return false;
    }
  }

  /**
   * Diálogo interativo para escolha entre Google Maps e Waze
   */
  showNavigationOptions(target: NavigationTarget | string, customTitle?: string) {
    const label =
      typeof target === 'string'
        ? target
        : target.name || `${target.city || ''} (${target.state || ''})` || target.address;

    Alert.alert(
      customTitle || '🧭 Iniciar Navegação GPS',
      `Destino: ${label}\n\nEscolha seu aplicativo de GPS preferido:`,
      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Google Maps',
          onPress: () => this.openGoogleMaps(target),
        },
        {
          text: 'Waze',
          onPress: () => this.openWaze(target),
        },
      ]
    );
  }
}

export const navigationService = new NavigationService();
