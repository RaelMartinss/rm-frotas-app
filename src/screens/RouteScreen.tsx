import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  StatusBar,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { navigationService, NavigationTarget } from '../services/navigation.service';

interface RouteScreenProps {
  onBack: () => void;
  activeTrip?: any;
}

interface Waypoint {
  id: string;
  type: 'ORIGIN' | 'FUEL_STOP' | 'REST_STOP' | 'DESTINATION';
  title: string;
  subtitle: string;
  address: string;
  city: string;
  state: string;
  isCompleted?: boolean;
}

export function RouteScreen({ onBack, activeTrip }: RouteScreenProps) {
  const originCity = activeTrip?.originCity || 'São Paulo';
  const originState = activeTrip?.originState || 'SP';
  const originAddress = activeTrip?.originAddress || 'Av. das Nações Unidas, 12901 - Brooklin';

  const destCity = activeTrip?.destinationCity || 'Curitiba';
  const destState = activeTrip?.destinationState || 'PR';
  const destAddress = activeTrip?.destinationAddress || 'Av. Juscelino Kubitschek de Oliveira, 2600 - CIC';

  // Paradas da rota
  const waypoints: Waypoint[] = [
    {
      id: 'wp-origin',
      type: 'ORIGIN',
      title: 'Ponto de Partida',
      subtitle: `${originCity} (${originState})`,
      address: originAddress,
      city: originCity,
      state: originState,
      isCompleted: activeTrip?.status === 'IN_PROGRESS',
    },
    {
      id: 'wp-fuel',
      type: 'FUEL_STOP',
      title: 'Posto Homologado RM (Parada Recomendada)',
      subtitle: 'Posto Graal Embaixador • BR-116 Km 299',
      address: 'Rodovia Régis Bittencourt, Km 299',
      city: 'Itapecerica da Serra',
      state: 'SP',
      isCompleted: false,
    },
    {
      id: 'wp-rest',
      type: 'REST_STOP',
      title: 'Ponto de Apoio & Descanso Lei do Motorista',
      subtitle: 'Restaurante & Estacionamento Seguro 24h',
      address: 'Rod. Régis Bittencourt, Km 430',
      city: 'Registro',
      state: 'SP',
      isCompleted: false,
    },
    {
      id: 'wp-dest',
      type: 'DESTINATION',
      title: 'Destino Final / Entrega',
      subtitle: `${destCity} (${destState})`,
      address: destAddress,
      city: destCity,
      state: destState,
      isCompleted: false,
    },
  ];

  const handleNavigateToDestination = (app: 'maps' | 'waze') => {
    const target: NavigationTarget = {
      name: `${destCity} (${destState})`,
      address: destAddress,
      city: destCity,
      state: destState,
    };

    if (app === 'maps') {
      navigationService.openGoogleMaps(target);
    } else {
      navigationService.openWaze(target);
    }
  };

  const handleNavigateToWaypoint = (wp: Waypoint) => {
    const target: NavigationTarget = {
      name: wp.title,
      address: wp.address,
      city: wp.city,
      state: wp.state,
    };

    navigationService.showNavigationOptions(target, `Navegar para ${wp.title}`);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#0B0E11" />

      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
        <View style={styles.headerTitles}>
          <Text style={styles.headerTitle}>Itinerário da Viagem</Text>
          <Text style={styles.headerSubtitle}>
            {originCity} → {destCity}
          </Text>
        </View>
        <View style={styles.routeHeaderBadge}>
          <MaterialCommunityIcons name="map-marker-distance" size={18} color={colors.primary} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* CARD PRINCIPAL COM BOTÕES DE NAVEGAÇÃO EXTERNA */}
        <View style={styles.navActionCard}>
          <Text style={styles.navActionTitle}>INICIAR NAVEGAÇÃO GPS</Text>
          <Text style={styles.navActionDesc}>
            Selecione seu aplicativo preferido para obter rotas com trânsito ao vivo e alertas de radares:
          </Text>

          <View style={styles.navButtonsRow}>
            {/* GOOGLE MAPS */}
            <TouchableOpacity
              style={styles.googleMapsBtn}
              onPress={() => handleNavigateToDestination('maps')}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="google-maps" size={22} color="#FFFFFF" />
              <Text style={styles.navBtnText}>Google Maps</Text>
            </TouchableOpacity>

            {/* WAZE */}
            <TouchableOpacity
              style={styles.wazeBtn}
              onPress={() => handleNavigateToDestination('waze')}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="waze" size={22} color="#000000" />
              <Text style={styles.wazeBtnText}>Waze</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* TIMELINE DE PARADAS E WAYPOINTS */}
        <Text style={styles.sectionTitle}>PONTOS DE PARADA & TRAJETÓRIA</Text>

        <View style={styles.timelineContainer}>
          {waypoints.map((wp, index) => {
            const isLast = index === waypoints.length - 1;
            const isOrigin = wp.type === 'ORIGIN';
            const isDest = wp.type === 'DESTINATION';
            const isFuel = wp.type === 'FUEL_STOP';

            const dotColor = isDest
              ? '#22C55E'
              : isOrigin
              ? colors.primary
              : isFuel
              ? '#FBBF24'
              : '#38BDF8';

            const iconName: keyof typeof MaterialCommunityIcons.glyphMap = isDest
              ? 'flag-checkered'
              : isOrigin
              ? 'truck-fast'
              : isFuel
              ? 'gas-station'
              : 'coffee';

            return (
              <View key={wp.id} style={styles.timelineItem}>
                {/* Linha vertical e Ponto do Ícone */}
                <View style={styles.timelineTrackCol}>
                  <View style={[styles.timelineDot, { borderColor: dotColor }]}>
                    <MaterialCommunityIcons name={iconName} size={14} color={dotColor} />
                  </View>
                  {!isLast && <View style={styles.timelineLine} />}
                </View>

                {/* Conteúdo do Card de Parada */}
                <View style={styles.timelineContentCard}>
                  <View style={styles.waypointHeader}>
                    <Text style={styles.waypointTitle}>{wp.title}</Text>
                    {!isOrigin && (
                      <TouchableOpacity
                        style={styles.navigateMiniBtn}
                        onPress={() => handleNavigateToWaypoint(wp)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="navigate" size={12} color={colors.primary} />
                        <Text style={styles.navigateMiniText}>GPS</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  <Text style={styles.waypointSubtitle}>{wp.subtitle}</Text>
                  <Text style={styles.waypointAddress} numberOfLines={2}>
                    {wp.address}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* DICAS DE SEGURANÇA NA VIA */}
        <View style={styles.safetyCard}>
          <MaterialCommunityIcons name="shield-check-outline" size={22} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.safetyTitle}>Dica de Segurança Operacional</Text>
            <Text style={styles.safetyDesc}>
              Mantenha pausas a cada 4 horas contínuas de volante conforme a Lei do Motorista (Lei nº 13.103).
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#080B0C',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1A2128',
    backgroundColor: '#0B0F13',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#161D24',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerTitles: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#7E8B9B',
    marginTop: 2,
  },
  routeHeaderBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  navActionCard: {
    backgroundColor: '#0E1318',
    borderWidth: 1.5,
    borderColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  navActionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 0.8,
  },
  navActionDesc: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 4,
    marginBottom: 14,
    lineHeight: 18,
  },
  navButtonsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  googleMapsBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  wazeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#05C8F7',
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
    shadowColor: '#05C8F7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  navBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  wazeBtnText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '800',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#8A99AD',
    letterSpacing: 0.8,
    marginBottom: 14,
  },
  timelineContainer: {
    marginBottom: 20,
  },
  timelineItem: {
    flexDirection: 'row',
    minHeight: 85,
  },
  timelineTrackCol: {
    width: 32,
    alignItems: 'center',
  },
  timelineDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#121922',
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: '#1E293B',
    marginVertical: 4,
  },
  timelineContentCard: {
    flex: 1,
    backgroundColor: '#0E1318',
    borderWidth: 1,
    borderColor: '#1C2631',
    borderRadius: 12,
    padding: 12,
    marginLeft: 10,
    marginBottom: 12,
  },
  waypointHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  waypointTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    flex: 1,
  },
  navigateMiniBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryMuted,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    gap: 4,
  },
  navigateMiniText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '800',
  },
  waypointSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
    fontWeight: '600',
  },
  waypointAddress: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 4,
  },
  safetyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111821',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 12,
    padding: 14,
    gap: 12,
  },
  safetyTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  safetyDesc: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
    lineHeight: 16,
  },
});
