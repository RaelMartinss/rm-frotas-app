import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Alert,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { biometricService } from '../services/biometric.service';
import { api } from '../services/api.service';
import { locationService } from '../services/location.service';
import { appUpdateService, UpdateInfo } from '../services/app-update.service';
import { User } from '../types/auth';
import { DriverPortalSummary, DriverCurrentTrip } from '../types/driver';

interface HomeScreenProps {
  user: User;
  onLogout: () => void;
  onNavigateToFuel: () => void;
  onNavigateToTrip: () => void;
  onNavigateToHistory: () => void;
  onNavigateToProfile: () => void;
  activeTrip?: any;
  onTripCompleted?: () => void;
}

export function HomeScreen({
  user,
  onLogout,
  onNavigateToFuel,
  onNavigateToTrip,
  onNavigateToHistory,
  onNavigateToProfile,
  activeTrip: propActiveTrip,
  onTripCompleted,
}: HomeScreenProps) {
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState<DriverPortalSummary | null>(null);
  const [completing, setCompleting] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateDismissed, setUpdateDismissed] = useState(false);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const data = await api.getCurrentTrip();
      setSummary(data);
    } catch {
      // Mantém estado anterior em caso de erro silencioso
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    biometricService.isAvailable().then(setBiometricAvailable);
    loadData();

    // Verificação proativa de nova versão no GitHub Releases
    const timer = setTimeout(() => {
      appUpdateService.checkForUpdates().then((info) => {
        if (info.hasUpdate) {
          setUpdateInfo(info);
        }
      });
    }, 2500);

    return () => clearTimeout(timer);
  }, [loadData]);

  const activeTrip = propActiveTrip || summary?.trip;
  const isTripInProgress = activeTrip?.status === 'IN_PROGRESS';
  const pendingReceipts = summary?.pendingReceiptsCount ?? 1;

  const [gpsActive, setGpsActive] = useState(false);
  const [currentSpeed, setCurrentSpeed] = useState<number | null>(null);

  // Ativa automaticamente o rastreamento GPS em segundo plano durante viagens EM ROTA
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    if (activeTrip?.id && isTripInProgress) {
      locationService.startTracking(activeTrip.id).then((started) => {
        setGpsActive(started);
      });

      unsubscribe = locationService.onLocationUpdate((loc) => {
        setGpsActive(true);
        if (loc.coords.speed !== null && loc.coords.speed !== undefined) {
          const kmh = Math.round(Math.max(0, loc.coords.speed * 3.6));
          setCurrentSpeed(kmh);
        }
      });
    } else {
      locationService.stopTracking();
      setGpsActive(false);
      setCurrentSpeed(null);
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [activeTrip?.id, isTripInProgress]);

  const isCnhExpired = summary?.driver?.isCnhExpired ?? false;
  const daysUntilCnhExpires = summary?.driver?.daysUntilCnhExpires;
  const isCnhExpiringSoon =
    daysUntilCnhExpires !== undefined ? daysUntilCnhExpires <= 30 && daysUntilCnhExpires >= 0 : false;
  const shouldShowCnhAlert = isCnhExpired || isCnhExpiringSoon;

  const formatCnhDate = (rawDate?: string) => {
    if (!rawDate) return '18/11/2028';
    try {
      const parts = rawDate.split('T')[0].split('-');
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      const d = new Date(rawDate);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('pt-BR');
      }
      return '18/11/2028';
    } catch {
      return '18/11/2028';
    }
  };

  const formatTripDateTime = (dateStr?: string | null, fallbackHours = 0) => {
    if (!dateStr) return '--:--';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;

      if (fallbackHours > 0) {
        d.setHours(d.getHours() + fallbackHours);
      }

      const now = new Date();
      const isToday =
        d.getDate() === now.getDate() &&
        d.getMonth() === now.getMonth() &&
        d.getFullYear() === now.getFullYear();

      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');

      if (isToday) {
        return `Hoje • ${hours}:${minutes}`;
      }
      return `${day}/${month} • ${hours}:${minutes}`;
    } catch {
      return dateStr;
    }
  };

  const handleTripAction = () => {
    if (isTripInProgress) {
      Alert.alert(
        'Concluir Viagem',
        `Deseja finalizar a viagem para ${activeTrip?.destinationCity || 'Curitiba'}? O veículo será liberado para a frota.`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Sim, Concluir',
            onPress: async () => {
              if (!activeTrip?.id) return;
              setCompleting(true);
              try {
                await locationService.stopTracking();
                await api.completeTrip(activeTrip.id);
                Alert.alert('Viagem Concluída', 'O veículo foi liberado com sucesso!');
                if (onTripCompleted) onTripCompleted();
                loadData(true);
              } catch (err: any) {
                Alert.alert('Erro', err.message || 'Não foi possível concluir a viagem.');
              } finally {
                setCompleting(false);
              }
            },
          },
        ]
      );
    } else {
      onNavigateToTrip();
    }
  };

  const handleSOS = () => {
    Alert.alert(
      '🚨 SOS Alerta Operacional',
      'Deseja enviar um chamado de socorro prioritário para a central da RM Frotas?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Enviar SOS',
          style: 'destructive',
          onPress: () => Alert.alert('Alerta Enviado', 'A central de monitoramento recebeu sua localização.'),
        },
      ]
    );
  };

  const driverInitials = user.name
    ? user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .substring(0, 2)
        .toUpperCase()
    : 'RM';

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      {/* CABEÇALHO DO PERFIL & AÇÕES DO TOPO */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.profileHeaderTouch}
          onPress={onNavigateToProfile}
          activeOpacity={0.8}
        >
          {/* Avatar com fundo laranja translúcido */}
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>{driverInitials}</Text>
          </View>
          <View style={styles.driverInfoCol}>
            <Text style={styles.driverName} numberOfLines={1}>
              {user.name || 'Rael Martins'}
            </Text>
            <Text style={styles.driverSubtitle}>Motorista Operacional</Text>
          </View>
        </TouchableOpacity>

        {/* Ações da Direita */}
        <View style={styles.headerRightActions}>
          <TouchableOpacity
            style={styles.headerIconButton}
            onPress={onNavigateToProfile}
            activeOpacity={0.7}
          >
            <Ionicons name="notifications-outline" size={20} color={colors.textSecondary} />
            <View style={styles.notifBadge} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.headerIconButton}
            onPress={onLogout}
            activeOpacity={0.7}
          >
            <Ionicons name="log-out-outline" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadData(true)}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* BANNER PROATIVO DE NOVA VERSÃO DISPONÍVEL */}
        {updateInfo && !updateDismissed && (
          <View style={styles.updateBanner}>
            <View style={styles.updateBannerTop}>
              <View style={styles.updateIconBox}>
                <Ionicons name="cloud-download-outline" size={20} color="#FF7A00" />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.updateBadgeRow}>
                  <Text style={styles.updateBadgeText}>ATUALIZAÇÃO DISPONÍVEL</Text>
                  <Text style={styles.updateVersionTag}>v{updateInfo.latestVersion}</Text>
                </View>
                <Text style={styles.updateDesc}>
                  Uma nova versão do RM Frotas foi publicada com melhorias e correções.
                </Text>
              </View>
            </View>
            <View style={styles.updateActionRow}>
              <TouchableOpacity
                style={styles.updateDismissButton}
                onPress={() => setUpdateDismissed(true)}
                activeOpacity={0.7}
              >
                <Text style={styles.updateDismissText}>Depois</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.updateInstallButton}
                onPress={() => appUpdateService.downloadAndInstall(updateInfo.downloadUrl)}
                activeOpacity={0.8}
              >
                <Ionicons name="download-outline" size={15} color="#080B0C" />
                <Text style={styles.updateInstallText}>Instalar Atualização</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* BANNER PROATIVO DE CNH (Apenas exibido se estiver vencendo ou vencida) */}
        {shouldShowCnhAlert && (
          <View
            style={[
              styles.cnhBanner,
              isCnhExpired ? styles.cnhBannerExpired : styles.cnhBannerWarning,
            ]}
          >
            <View style={styles.cnhBannerLeft}>
              <View
                style={[
                  styles.cnhIconBox,
                  isCnhExpired ? styles.cnhIconBoxExpired : styles.cnhIconBoxWarning,
                ]}
              >
                <Ionicons
                  name={isCnhExpired ? 'alert-circle' : 'warning'}
                  size={18}
                  color={isCnhExpired ? '#EF4444' : '#F59E0B'}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.cnhTitle,
                    isCnhExpired ? styles.cnhTitleExpired : styles.cnhTitleWarning,
                  ]}
                >
                  {isCnhExpired
                    ? 'CNH Vencida • Regularização Necessária'
                    : `CNH Vencendo em ${daysUntilCnhExpires} dia${daysUntilCnhExpires === 1 ? '' : 's'}`}
                </Text>
                <Text style={styles.cnhDesc}>
                  {isCnhExpired
                    ? 'Sua CNH está vencida. Regularize para poder operar viagens.'
                    : `Validade até ${formatCnhDate(
                        summary?.driver?.cnhExpirationDateIso || summary?.driver?.cnhExpirationDate
                      )}. Agende a renovação.`}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* ALERTA PROATIVO DE PENDÊNCIA DE COMPROVANTE */}
        {pendingReceipts > 0 && (
          <View style={styles.receiptAlert}>
            <View style={styles.receiptAlertLeft}>
              <View style={styles.receiptIconBox}>
                <MaterialCommunityIcons name="gas-station" size={18} color="#FBBF24" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.receiptTitle}>
                  {pendingReceipts === 1
                    ? '1 cupom fiscal pendente'
                    : `${pendingReceipts} cupons fiscais pendentes`}
                </Text>
                <Text style={styles.receiptDesc}>Tire a foto para regularizar seu abastecimento.</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.attachButton}
              onPress={onNavigateToFuel}
              activeOpacity={0.8}
            >
              <Text style={styles.attachButtonText}>Anexar</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* CARD PRINCIPAL DA VIAGEM EM DESTAQUE */}
        <View style={styles.tripCard}>
          <View style={styles.tripHeaderRow}>
            <View style={styles.tripBadge}>
              <View style={styles.badgeDot} />
              <Text style={styles.badgeText}>
                {isTripInProgress ? 'EM ROTA' : 'PROGRAMADA'}
              </Text>
            </View>

            <View style={gpsActive ? styles.gpsBadge : styles.gpsBadgeInactive}>
              <View style={gpsActive ? styles.gpsDot : styles.gpsDotInactive} />
              <Text style={gpsActive ? styles.gpsText : styles.gpsTextInactive}>
                {gpsActive
                  ? currentSpeed !== null && currentSpeed > 0
                    ? `${currentSpeed} km/h • GPS ATIVO`
                    : 'GPS ATIVO'
                  : 'GPS PAUSADO'}
              </Text>
            </View>
          </View>

          {/* Rota Origem → Destino */}
          <View style={styles.routeRow}>
            <Text style={styles.routeCity}>
              {activeTrip?.originCity
                ? `${activeTrip.originCity} (${activeTrip.originState || 'SP'})`
                : activeTrip?.origin || 'São Paulo (SP)'}
            </Text>
            <Ionicons name="arrow-forward" size={18} color={colors.primary} />
            <Text style={styles.routeCity}>
              {activeTrip?.destinationCity
                ? `${activeTrip.destinationCity} (${activeTrip.destinationState || 'PR'})`
                : activeTrip?.destination || 'Curitiba (PR)'}
            </Text>
          </View>

          {/* Horários Dinâmicos da Viagem */}
          <View style={styles.tripTimingGrid}>
            <View style={styles.timingItem}>
              <View style={styles.timingIconBox}>
                <Ionicons name="calendar-outline" size={14} color={colors.primary} />
              </View>
              <View>
                <Text style={styles.timingLabel}>
                  {isTripInProgress ? 'Saída / Início' : 'Saída prevista'}
                </Text>
                <Text style={styles.timingValue}>
                  {formatTripDateTime(activeTrip?.scheduledDate || activeTrip?.startedAt || activeTrip?.createdAt)}
                </Text>
              </View>
            </View>

            <View style={styles.timingItem}>
              <View style={styles.timingIconBox}>
                <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
              </View>
              <View>
                <Text style={styles.timingLabel}>Previsão Chegada</Text>
                <Text style={styles.timingValue}>
                  {formatTripDateTime(
                    activeTrip?.estimatedArrivalDate || activeTrip?.scheduledDate,
                    activeTrip?.estimatedArrivalDate ? 0 : 6
                  )}
                </Text>
              </View>
            </View>
          </View>

          {/* Botão de Iniciar/Concluir Viagem */}
          <TouchableOpacity
            style={[styles.startTripButton, completing && { opacity: 0.7 }]}
            onPress={handleTripAction}
            disabled={completing}
            activeOpacity={0.85}
          >
            <View style={styles.startTripButtonInner}>
              <View style={styles.playIconBadge}>
                {completing ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Ionicons
                    name={isTripInProgress ? 'checkmark' : 'play'}
                    size={14}
                    color={colors.primary}
                  />
                )}
              </View>
              <Text style={styles.startTripButtonText}>
                {completing
                  ? 'Concluindo...'
                  : isTripInProgress
                  ? 'Concluir Viagem'
                  : 'Iniciar Viagem'}
              </Text>
            </View>
            <Ionicons name="arrow-forward" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* SEÇÃO AÇÕES RÁPIDAS (GRID 2x2) */}
        {/* SEÇÃO AÇÕES RÁPIDAS (ESTILO BANCO INTER) */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>AÇÕES RÁPIDAS</Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickScroll}
        >
          {/* 1. Abastecer */}
          <TouchableOpacity
            style={styles.interCard}
            onPress={onNavigateToFuel}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name="gas-station-outline" size={26} color="#FFFFFF" />
            <Text style={styles.interCardTitle}>Abastecer</Text>
          </TouchableOpacity>

          {/* 2. SOS Alerta */}
          <TouchableOpacity
            style={styles.interCard}
            onPress={handleSOS}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name="shield-alert-outline" size={26} color="#FFFFFF" />
            <Text style={styles.interCardTitle}>SOS Alerta</Text>
          </TouchableOpacity>

          {/* 3. Checklist */}
          <TouchableOpacity
            style={styles.interCard}
            onPress={onNavigateToTrip}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name="clipboard-check-outline" size={26} color="#FFFFFF" />
            <Text style={styles.interCardTitle}>Checklist</Text>
          </TouchableOpacity>

          {/* 4. Histórico */}
          <TouchableOpacity
            style={styles.interCard}
            onPress={onNavigateToHistory}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name="clock-outline" size={26} color="#FFFFFF" />
            <Text style={styles.interCardTitle}>Histórico</Text>
          </TouchableOpacity>

          {/* 5. Documentos */}
          <TouchableOpacity
            style={styles.interCard}
            onPress={() => {
              Alert.alert(
                'Documentos do Veículo',
                `Veículo: ${activeTrip?.vehicle?.brand || 'Volvo'} ${activeTrip?.vehicle?.model || 'FH540'}\nPlaca: ${activeTrip?.vehicle?.plate || 'BRA2E19'}\nCRLV Validade: ${activeTrip?.vehicle?.crlvExpiration || '15/10/2026'}\nCNH: ${summary?.driver?.cnhNumber || 'Regularizada'}`
              );
            }}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name="file-document-outline" size={26} color="#FFFFFF" />
            <Text style={styles.interCardTitle}>Documentos</Text>
          </TouchableOpacity>
        </ScrollView>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  profileHeaderTouch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1.5,
    borderColor: colors.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.primary,
    fontWeight: '900',
    fontSize: 16,
  },
  driverInfoCol: {
    flex: 1,
  },
  driverName: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  driverSubtitle: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.primary,
    marginTop: 1,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIconButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  notifBadge: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.primary,
    position: 'absolute',
    top: 6,
    right: 6,
  },
  container: {
    padding: 20,
    gap: 16,
    paddingBottom: 30,
  },
  cnhBanner: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 12,
  },
  cnhBannerWarning: {
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderColor: 'rgba(245, 158, 11, 0.35)',
  },
  cnhBannerExpired: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderColor: 'rgba(239, 68, 68, 0.35)',
  },
  cnhBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cnhIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cnhIconBoxWarning: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
  },
  cnhIconBoxExpired: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  cnhTitle: {
    fontSize: 12,
    fontWeight: '800',
  },
  cnhTitleWarning: {
    color: '#FBBF24',
  },
  cnhTitleExpired: {
    color: '#F87171',
  },
  cnhDesc: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 1,
  },
  receiptAlert: {
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
    borderRadius: 18,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  receiptAlertLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  receiptIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  receiptTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FBBF24',
  },
  receiptDesc: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 1,
  },
  attachButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  attachButtonText: {
    color: '#080B0C',
    fontSize: 11,
    fontWeight: '900',
  },
  tripCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    gap: 14,
  },
  tripHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tripBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryMuted,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
    marginRight: 6,
  },
  badgeText: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  gpsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  gpsDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#34D399',
    marginRight: 5,
  },
  gpsText: {
    color: '#34D399',
    fontSize: 9,
    fontWeight: '800',
  },
  gpsBadgeInactive: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(148, 163, 184, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.25)',
  },
  gpsDotInactive: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#94A3B8',
    marginRight: 5,
  },
  gpsTextInactive: {
    color: '#94A3B8',
    fontSize: 9,
    fontWeight: '800',
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  routeCity: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  tripTimingGrid: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 4,
  },
  timingItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    borderRadius: 14,
  },
  timingIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timingLabel: {
    fontSize: 9,
    color: colors.textDim,
    fontWeight: '600',
  },
  timingValue: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: 1,
  },
  startTripButton: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  startTripButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  playIconBadge: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: 'rgba(255, 107, 0, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 0, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  startTripButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    marginBottom: -4,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textSecondary,
    letterSpacing: 0.8,
  },
  quickScroll: {
    marginHorizontal: -20,
    paddingHorizontal: 20,
    gap: 10,
    paddingVertical: 4,
  },
  interCard: {
    width: 94,
    height: 94,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 13,
    justifyContent: 'space-between',
  },
  interCardTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 15,
  },
  updateBanner: {
    backgroundColor: '#12171B',
    borderWidth: 1,
    borderColor: 'rgba(255, 122, 0, 0.35)',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    gap: 12,
  },
  updateBannerTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  updateIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 122, 0, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 122, 0, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  updateBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  updateBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FF7A00',
    letterSpacing: 0.5,
  },
  updateVersionTag: {
    fontSize: 10,
    fontWeight: '700',
    color: '#CBD5E1',
    backgroundColor: '#1F2937',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  updateDesc: {
    fontSize: 12,
    color: '#94A3B8',
    lineHeight: 16,
  },
  updateActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 10,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  updateDismissButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  updateDismissText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
  },
  updateInstallButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FF7A00',
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  updateInstallText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#080B0C',
  },
});

