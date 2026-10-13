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
  Image,
  Modal,
  Platform,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { biometricService } from '../services/biometric.service';
import { api } from '../services/api.service';
import { storage } from '../services/storage.service';
import { networkService } from '../services/network.service';
import { locationService } from '../services/location.service';
import { appUpdateService, UpdateInfo, UpdateDownloadState } from '../services/app-update.service';
import { navigationService } from '../services/navigation.service';
import { notificationService } from '../services/notification.service';
import { NotificationCenterModal } from './NotificationCenterModal';
import { User } from '../types/auth';
import { DriverPortalSummary, DriverCurrentTrip } from '../types/driver';

interface HomeScreenProps {
  user: User;
  onLogout: () => void;
  onNavigateToFuel: () => void;
  onNavigateToTrip: () => void;
  onNavigateToHistory: () => void;
  onNavigateToProfile: () => void;
  onNavigateToSOS?: () => void;
  onNavigateToChecklist?: () => void;
  onNavigateToRoute?: () => void;
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
  onNavigateToSOS,
  onNavigateToChecklist,
  onNavigateToRoute,
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
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [docsModalOpen, setDocsModalOpen] = useState(false);
  const [completeModalOpen, setCompleteModalOpen] = useState(false);
  const [finalKm, setFinalKm] = useState('');
  const [isOnline, setIsOnline] = useState(networkService.isOnline);
  const [offlineQueueCount, setOfflineQueueCount] = useState(0);
  const [syncingQueue, setSyncingQueue] = useState(false);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [driverPhoto, setDriverPhoto] = useState<string | null>(user.photoUrl || null);
  const [downloadState, setDownloadState] = useState<UpdateDownloadState>({
    isDownloading: false,
    progress: 0,
    error: null,
    completed: false,
  });

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const data = await api.getCurrentTrip();
      setSummary(data);
      if (data?.driver?.photoUrl) {
        setDriverPhoto(data.driver.photoUrl);
        await storage.setItem('rm_driver_photo', data.driver.photoUrl);
      }
    } catch {
      // Mantém estado anterior em caso de erro silencioso
    } finally {
      api.getOfflineQueueCount().then(setOfflineQueueCount).catch(() => {});
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const handleSyncQueue = useCallback(async () => {
    if (syncingQueue) return;
    setSyncingQueue(true);
    try {
      const result = await api.syncOfflineQueue();
      const remaining = await api.getOfflineQueueCount();
      setOfflineQueueCount(remaining);
      if (result.synced > 0) {
        Alert.alert(
          'Sincronização Concluída',
          `${result.synced} lançamento(s) offline foram sincronizados com sucesso!`
        );
        loadData(true);
      }
    } catch {
    } finally {
      setSyncingQueue(false);
    }
  }, [syncingQueue, loadData]);

  useEffect(() => {
    biometricService.isAvailable().then(setBiometricAvailable);
    storage.getItem('rm_driver_photo').then((cached) => {
      if (cached) setDriverPhoto(cached);
    });
    loadData();

    // Inscreve no status da rede em tempo real
    const unsubNet = networkService.subscribe((online) => {
      setIsOnline(online);
      if (online) {
        api.getOfflineQueueCount().then((count) => {
          setOfflineQueueCount(count);
          if (count > 0) {
            handleSyncQueue();
          }
        }).catch(() => {});
      }
    });

    // Inscreve na central de notificações
    const unsubNotifs = notificationService.subscribe((list) => {
      setUnreadNotifs(list.filter((n) => !n.read).length);
    });

    // Inscreve no progresso do instalador de atualizações
    const unsubUpdate = appUpdateService.subscribe((st) => {
      setDownloadState(st);
    });

    // Verificação proativa de nova versão no GitHub Releases
    const timer = setTimeout(() => {
      appUpdateService.checkForUpdates().then((info) => {
        if (info.hasUpdate) {
          setUpdateInfo(info);
        }
      });
    }, 2500);

    return () => {
      clearTimeout(timer);
      unsubNet();
      unsubNotifs();
      unsubUpdate();
    };
  }, [loadData, handleSyncQueue]);

  const activeTrip = propActiveTrip || summary?.trip;
  const isTripInProgress = activeTrip?.status === 'IN_PROGRESS';
  const pendingReceipts = summary?.pendingReceiptsCount ?? 0;

  const [gpsActive, setGpsActive] = useState(false);
  const [currentSpeed, setCurrentSpeed] = useState<number | null>(null);

  // Ativa automaticamente o rastreamento GPS em segundo plano durante viagens EM ROTA
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    if (activeTrip?.id && isTripInProgress) {
      locationService.startTracking(activeTrip.id).then((started) => {
        setGpsActive(started);
      }).catch(() => {});

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
    if (!rawDate) return '--/--/----';
    try {
      const parts = rawDate.split('T')[0].split('-');
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      const d = new Date(rawDate);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('pt-BR');
      }
      return '--/--/----';
    } catch {
      return '--/--/----';
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
      const currentKmVal = activeTrip?.vehicle?.currentKm;
      setFinalKm(currentKmVal != null ? String(currentKmVal) : '');
      setCompleteModalOpen(true);
    } else {
      onNavigateToTrip();
    }
  };

  const handleConfirmCompleteTrip = async () => {
    if (!activeTrip?.id) return;

    const parsedKm = parseInt(finalKm.replace(/\D/g, ''), 10);
    if (isNaN(parsedKm) || parsedKm <= 0) {
      Alert.alert('Odômetro Obrigatório', 'Informe a quilometragem final no odômetro do veículo para concluir.');
      return;
    }

    const initialKm = activeTrip?.vehicle?.currentKm;
    if (initialKm != null && parsedKm < initialKm) {
      Alert.alert(
        'Odômetro Menor que o Inicial',
        `A quilometragem final (${parsedKm.toLocaleString('pt-BR')} km) não pode ser menor que o odômetro anterior do veículo (${Number(initialKm).toLocaleString('pt-BR')} km).`
      );
      return;
    }

    setCompleting(true);
    try {
      await locationService.stopTracking().catch(() => {});
      const res = await api.completeTrip(activeTrip.id, parsedKm);
      setCompleteModalOpen(false);
      Alert.alert('Viagem Concluída', res.message || 'O veículo foi liberado com sucesso!');
      if (onTripCompleted) onTripCompleted();
      loadData(true);
    } catch (err: any) {
      Alert.alert('Erro ao Finalizar', err.message || 'Não foi possível concluir a viagem.');
    } finally {
      setCompleting(false);
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
          {/* Avatar com foto do condutor ou iniciais */}
          {driverPhoto ? (
            <Image
              source={{ uri: driverPhoto }}
              style={styles.avatarPhoto}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>{driverInitials}</Text>
            </View>
          )}
          <View style={styles.driverInfoCol}>
            <Text style={styles.driverName} numberOfLines={1}>
              {user.name || 'Rael Martins'}
            </Text>
            <Text style={styles.driverSubtitle}>Motorista Operacional</Text>
          </View>
        </TouchableOpacity>

        {/* Ações da Direita */}
        <View style={styles.headerRightActions}>
          {offlineQueueCount > 0 && (
            <TouchableOpacity
              style={styles.headerQueueBadge}
              onPress={handleSyncQueue}
              disabled={syncingQueue}
              activeOpacity={0.7}
            >
              <Ionicons
                name="sync-outline"
                size={13}
                color="#FBBF24"
              />
              <Text style={styles.headerQueueBadgeText}>{offlineQueueCount}</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.headerIconButton}
            onPress={() => setNotificationsOpen(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="notifications-outline" size={20} color={colors.textSecondary} />
            {unreadNotifs > 0 && <View style={styles.notifBadge} />}
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
        {/* BANNER MODO OFFLINE */}
        {!isOnline && (
          <View style={styles.offlineBanner}>
            <View style={styles.offlineBannerLeft}>
              <View style={styles.offlineIconBox}>
                <Ionicons name="cloud-offline-outline" size={18} color="#F59E0B" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.offlineTitle}>Modo Offline Ativado</Text>
                <Text style={styles.offlineSubtitle}>
                  Sem conexão de internet. Abastecimentos salvos serão transmitidos ao reconectar.
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.offlineRetryBtn}
              onPress={() => networkService.checkConnection()}
              activeOpacity={0.7}
            >
              <Ionicons name="refresh-outline" size={13} color="#FBBF24" />
              <Text style={styles.offlineRetryText}>Testar</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* BANNER DE FILA OFFLINE PENDENTE */}
        {offlineQueueCount > 0 && (
          <View style={styles.queueBanner}>
            <View style={styles.queueBannerLeft}>
              <View style={styles.queueIconBox}>
                <Ionicons name="sync-circle-outline" size={20} color="#38BDF8" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.queueTitle}>
                  {offlineQueueCount === 1
                    ? '1 abastecimento pendente na fila'
                    : `${offlineQueueCount} abastecimentos pendentes na fila`}
                </Text>
                <Text style={styles.queueSubtitle}>
                  {isOnline
                    ? 'Conexão ativa. Toque para sincronizar com o servidor.'
                    : 'Aguardando sinal de rede para sincronizar automaticamente.'}
                </Text>
              </View>
            </View>
            {isOnline && (
              <TouchableOpacity
                style={styles.queueSyncBtn}
                onPress={handleSyncQueue}
                disabled={syncingQueue}
                activeOpacity={0.8}
              >
                {syncingQueue ? (
                  <ActivityIndicator size="small" color="#080B0C" />
                ) : (
                  <>
                    <Ionicons name="cloud-upload-outline" size={13} color="#080B0C" />
                    <Text style={styles.queueSyncText}>Sincronizar</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}

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
            {downloadState.isDownloading ? (
              <View style={styles.updateProgressContainer}>
                <View style={styles.updateProgressHeader}>
                  <Text style={styles.updateProgressTitle}>Baixando atualização...</Text>
                  <Text style={styles.updateProgressPercent}>{downloadState.progress}%</Text>
                </View>
                <View style={styles.updateProgressBarTrack}>
                  <View style={[styles.updateProgressBarFill, { width: `${downloadState.progress}%` }]} />
                </View>
                <Text style={styles.updateProgressHint}>O instalador nativo abrirá automaticamente ao concluir.</Text>
              </View>
            ) : (
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
            )}
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
              onPress={onNavigateToHistory}
              activeOpacity={0.8}
            >
              <Text style={styles.attachButtonText}>Anexar</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* CARD PRINCIPAL DA VIAGEM OU ESTADO VAZIO */}
        {activeTrip ? (
          <View style={styles.tripCard}>
            <View style={styles.tripHeaderRow}>
              <View style={styles.tripBadge}>
                <View style={styles.badgeDot} />
                <Text style={styles.badgeText}>
                  {isTripInProgress ? 'EM ROTA' : 'PROGRAMADA'}
                </Text>
              </View>

              <View
                style={
                  !isOnline
                    ? styles.gpsBadgeOffline
                    : gpsActive
                    ? styles.gpsBadge
                    : styles.gpsBadgeInactive
                }
              >
                <View
                  style={
                    !isOnline
                      ? styles.gpsDotOffline
                      : gpsActive
                      ? styles.gpsDot
                      : styles.gpsDotInactive
                  }
                />
                <Text
                  style={
                    !isOnline
                      ? styles.gpsTextOffline
                      : gpsActive
                      ? styles.gpsText
                      : styles.gpsTextInactive
                  }
                >
                  {!isOnline
                    ? 'MODO OFFLINE'
                    : gpsActive
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
                {activeTrip.originCity
                  ? `${activeTrip.originCity} (${activeTrip.originState || ''})`.trim()
                  : activeTrip.origin || activeTrip.originAddress || 'Origem'}
              </Text>
              <Ionicons name="arrow-forward" size={18} color={colors.primary} />
              <Text style={styles.routeCity}>
                {activeTrip.destinationCity
                  ? `${activeTrip.destinationCity} (${activeTrip.destinationState || ''})`.trim()
                  : activeTrip.destination || activeTrip.destinationAddress || 'Destino'}
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
                    {formatTripDateTime(activeTrip.scheduledDate || activeTrip.startedAt || activeTrip.createdAt)}
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
                      activeTrip.estimatedArrivalDate || activeTrip.scheduledDate,
                      activeTrip.estimatedArrivalDate ? 0 : 6
                    )}
                  </Text>
                </View>
              </View>
            </View>

            {/* Botão de Navegação Externa (Waze / Maps) */}
            <TouchableOpacity
              style={styles.gpsNavButton}
              onPress={() => {
                if (onNavigateToRoute) {
                  onNavigateToRoute();
                } else {
                  const dest = activeTrip.destinationCity
                    ? `${activeTrip.destinationCity} (${activeTrip.destinationState || ''})`
                    : activeTrip.destination || activeTrip.destinationAddress || '';
                  if (dest) navigationService.showNavigationOptions(dest);
                }
              }}
              activeOpacity={0.8}
            >
              <View style={styles.gpsNavLeft}>
                <View style={styles.gpsNavIconWrap}>
                  <MaterialCommunityIcons name="navigation-variant" size={16} color="#05C8F7" />
                </View>
                <Text style={styles.gpsNavText}>Navegar no Waze / Google Maps</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#64748B" />
            </TouchableOpacity>

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
        ) : (
          <View style={styles.emptyTripCard}>
            <View style={styles.emptyTripHeader}>
              <View style={styles.emptyTripIconWrap}>
                <MaterialCommunityIcons name="calendar-clock" size={26} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.emptyTripTitle}>Nenhuma viagem escalada</Text>
                <Text style={styles.emptyTripSubtitle}>
                  Aguardando despacho pela central de operações
                </Text>
              </View>
            </View>
            <Text style={styles.emptyTripText}>
              Assim que a operação programar um trajeto para você, o itinerário, veículo e paradas aparecerão aqui automaticamente.
            </Text>
          </View>
        )}

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

          {/* 2. Itinerário & GPS */}
          <TouchableOpacity
            style={styles.interCard}
            onPress={() => {
              if (onNavigateToRoute) onNavigateToRoute();
              else if (activeTrip) {
                const dest = activeTrip.destinationCity
                  ? `${activeTrip.destinationCity} (${activeTrip.destinationState || ''})`
                  : activeTrip.destination || '';
                if (dest) navigationService.showNavigationOptions(dest);
              }
            }}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name="map-marker-path" size={26} color="#FFFFFF" />
            <Text style={styles.interCardTitle}>Itinerário</Text>
          </TouchableOpacity>

          {/* 3. SOS Alerta */}
          <TouchableOpacity
            style={styles.interCard}
            onPress={() => {
              if (onNavigateToSOS) onNavigateToSOS();
              else handleSOS();
            }}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name="shield-alert-outline" size={26} color="#FFFFFF" />
            <Text style={styles.interCardTitle}>SOS Alerta</Text>
          </TouchableOpacity>

          {/* 3. Checklist */}
          <TouchableOpacity
            style={styles.interCard}
            onPress={() => {
              if (onNavigateToChecklist) onNavigateToChecklist();
              else onNavigateToTrip();
            }}
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
            onPress={() => setDocsModalOpen(true)}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name="file-document-outline" size={26} color="#FFFFFF" />
            <Text style={styles.interCardTitle}>Documentos</Text>
          </TouchableOpacity>
        </ScrollView>
      </ScrollView>

      {/* MODAL CENTRAL DE NOTIFICAÇÕES */}
      <NotificationCenterModal
        visible={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        onNavigateToScreen={(screen) => {
          if (screen === 'fuel') onNavigateToFuel();
          else if (screen === 'trip') onNavigateToTrip();
          else if (screen === 'profile') onNavigateToProfile();
          else if (screen === 'route' && onNavigateToRoute) onNavigateToRoute();
          else if (screen === 'sos' && onNavigateToSOS) onNavigateToSOS();
        }}
      />

      {/* MODAL DE DOWNLOAD DA ATUALIZAÇÃO NATIVA */}
      <Modal
        visible={downloadState.isDownloading}
        transparent
        animationType="fade"
      >
        <View style={styles.downloadModalBackdrop}>
          <View style={styles.downloadModalCard}>
            <View style={styles.downloadModalIconBox}>
              <Ionicons name="cloud-download" size={32} color="#FF7A00" />
            </View>
            <Text style={styles.downloadModalTitle}>Baixando Atualização...</Text>
            <Text style={styles.downloadModalSubtitle}>
              Atualizando o RM Frotas para a versão v{updateInfo?.latestVersion || ''}
            </Text>

            <View style={styles.downloadProgressRow}>
              <Text style={styles.downloadProgressLabel}>Progresso do download</Text>
              <Text style={styles.downloadProgressValue}>{downloadState.progress}%</Text>
            </View>

            <View style={styles.downloadProgressBarTrack}>
              <View style={[styles.downloadProgressBarFill, { width: `${downloadState.progress}%` }]} />
            </View>

            <Text style={styles.downloadModalHint}>
              O instalador nativo abrirá automaticamente na tela ao concluir o download.
            </Text>
          </View>
        </View>
      </Modal>

      {/* MODAL DOCUMENTOS DE VIAGEM (CRLV & CNH) */}
      <Modal
        visible={docsModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDocsModalOpen(false)}
      >
        <View style={styles.docsModalBackdrop}>
          <View style={styles.docsModalCard}>
            {/* Topo do Modal */}
            <View style={styles.docsModalHeader}>
              <View style={styles.docsModalHeaderLeft}>
                <View style={styles.docsModalIconBadge}>
                  <MaterialCommunityIcons name="file-document-outline" size={20} color="#FF7A00" />
                </View>
                <View>
                  <Text style={styles.docsModalTitle}>Documentação de Viagem</Text>
                  <Text style={styles.docsModalSubtitle}>CRLV do veículo e CNH do condutor</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setDocsModalOpen(false)}
                style={styles.docsModalCloseBtn}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={20} color="#8E9DA8" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={styles.docsModalScroll}>
              {/* CARD 1: VEÍCULO ATUAL (CRLV) */}
              {/* CARD 1: VEÍCULO ATUAL (CRLV) */}
              <View style={styles.docSectionCard}>
                <View style={styles.docSectionTop}>
                  <View style={styles.docSectionTitleRow}>
                    <MaterialCommunityIcons name="truck-outline" size={16} color="#FF7A00" />
                    <Text style={styles.docSectionTitle}>VEÍCULO DESIGNADO</Text>
                  </View>
                  {(activeTrip?.vehicle || summary?.trip?.vehicle) && (
                    <View style={styles.plateBadge}>
                      <Text style={styles.plateBadgeText}>
                        {activeTrip?.vehicle?.plate || summary?.trip?.vehicle?.plate}
                      </Text>
                    </View>
                  )}
                </View>

                {(activeTrip?.vehicle || summary?.trip?.vehicle) ? (
                  <>
                    <Text style={styles.docVehicleName}>
                      {activeTrip?.vehicle?.brand || summary?.trip?.vehicle?.brand || ''} {activeTrip?.vehicle?.model || summary?.trip?.vehicle?.model || ''} {activeTrip?.vehicle?.year || summary?.trip?.vehicle?.year ? `(${activeTrip?.vehicle?.year || summary?.trip?.vehicle?.year})` : ''}
                    </Text>

                    <View style={styles.docDetailsDivider} />

                    <View style={styles.docDetailsGrid}>
                      <View style={styles.docDetailRow}>
                        <Text style={styles.docDetailLabel}>RENAVAM:</Text>
                        <Text style={styles.docDetailValueMono}>
                          {activeTrip?.vehicle?.renavam || summary?.trip?.vehicle?.renavam || '--'}
                        </Text>
                      </View>

                      <View style={styles.docDetailRow}>
                        <Text style={styles.docDetailLabel}>Vencimento CRLV:</Text>
                        <Text style={styles.docDetailValue}>
                          {activeTrip?.vehicle?.crlvExpiration || summary?.trip?.vehicle?.crlvExpiration || '--'}
                        </Text>
                      </View>

                      <View style={styles.docDetailRow}>
                        <Text style={styles.docDetailLabel}>Situação do Veículo:</Text>
                        <View style={styles.docStatusPill}>
                          <View style={styles.docStatusDotGreen} />
                          <Text style={styles.docStatusTextGreen}>
                            {activeTrip?.vehicle?.status === 'AVAILABLE' ? 'Disponível' : activeTrip?.vehicle?.status || 'Em dia'}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </>
                ) : (
                  <View style={{ paddingVertical: 10 }}>
                    <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 18 }}>
                      Nenhum veículo vinculado no momento. O veículo será associado assim que uma viagem for escalada pela operação.
                    </Text>
                  </View>
                )}
              </View>

              {/* CARD 2: MOTORISTA (CNH DIGITAL) */}
              <View style={styles.docSectionCard}>
                <View style={styles.docSectionTop}>
                  <View style={styles.docSectionTitleRow}>
                    <MaterialCommunityIcons name="card-account-details-outline" size={16} color="#FF7A00" />
                    <Text style={styles.docSectionTitle}>HABILITAÇÃO DO CONDUTOR</Text>
                  </View>
                  <View style={isCnhExpired ? styles.cnhBadgeRed : isCnhExpiringSoon ? styles.cnhBadgeOrange : styles.cnhBadgeGreen}>
                    <View style={isCnhExpired ? styles.docStatusDotRed : isCnhExpiringSoon ? styles.docStatusDotOrange : styles.docStatusDotGreen} />
                    <Text style={isCnhExpired ? styles.cnhBadgeTextRed : isCnhExpiringSoon ? styles.cnhBadgeTextOrange : styles.cnhBadgeTextGreen}>
                      {isCnhExpired ? 'VENCIDA' : isCnhExpiringSoon ? 'VENCENDO' : 'REGULAR'}
                    </Text>
                  </View>
                </View>

                <Text style={styles.docDriverName}>
                  {summary?.driver?.name || user.name || 'Motorista'}
                </Text>

                <View style={styles.docDetailsDivider} />

                <View style={styles.docDetailsGrid}>
                  <View style={styles.docDetailRow}>
                    <Text style={styles.docDetailLabel}>Número CNH:</Text>
                    <Text style={styles.docDetailValueMono}>
                      {summary?.driver?.cnhNumber ? `****${summary.driver.cnhNumber.slice(-4)}` : '----'} (Cat. {summary?.driver?.cnhCategory || 'B'})
                    </Text>
                  </View>

                  <View style={styles.docDetailRow}>
                    <Text style={styles.docDetailLabel}>Validade da CNH:</Text>
                    <Text style={styles.docDetailValue}>
                      {formatCnhDate(summary?.driver?.cnhExpirationDateIso || summary?.driver?.cnhExpirationDate) || '04/12/2026'}
                    </Text>
                  </View>

                  <View style={styles.docDetailRow}>
                    <Text style={styles.docDetailLabel}>Exame Toxicológico:</Text>
                    <Text style={styles.docDetailValueGreen}>Apto / Em dia</Text>
                  </View>
                </View>

                {shouldShowCnhAlert && (
                  <View style={styles.docWarningBox}>
                    <Ionicons name="warning-outline" size={14} color={isCnhExpired ? '#EF4444' : '#F59E0B'} />
                    <Text style={[styles.docWarningText, { color: isCnhExpired ? '#EF4444' : '#F59E0B' }]}>
                      {isCnhExpired
                        ? 'CNH vencida: início de novas viagens bloqueado.'
                        : `Sua CNH vence em ${daysUntilCnhExpires} dia(s). Renove com antecedência.`}
                    </Text>
                  </View>
                )}
              </View>
            </ScrollView>

            <TouchableOpacity
              style={styles.docsModalCloseFullBtn}
              onPress={() => setDocsModalOpen(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.docsModalCloseFullText}>Fechar Documentação</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL: FINALIZAR VIAGEM (KM FINAL) */}
      <Modal
        visible={completeModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCompleteModalOpen(false)}
      >
        <View style={styles.completeModalBackdrop}>
          <View style={styles.completeModalCard}>
            {/* Cabeçalho */}
            <View style={styles.completeModalHeader}>
              <View style={styles.completeModalHeaderLeft}>
                <View style={styles.completeIconBadge}>
                  <Ionicons name="checkmark-done" size={20} color={colors.primary} />
                </View>
                <View>
                  <Text style={styles.completeModalTitle}>Finalizar Viagem</Text>
                  <Text style={styles.completeModalSubtitle}>Liberação do veículo e odômetro</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setCompleteModalOpen(false)}
                style={styles.completeModalCloseBtn}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Resumo da Rota & Veículo */}
            <View style={styles.completeRouteCard}>
              <View style={styles.completeRouteRow}>
                <Ionicons name="location-sharp" size={14} color={colors.primary} />
                <Text style={styles.completeRouteText}>
                  {activeTrip?.originCity
                    ? `${activeTrip.originCity} (${activeTrip.originState || ''})`.trim()
                    : activeTrip?.origin || activeTrip?.originAddress || 'Origem'}
                  {' → '}
                  {activeTrip?.destinationCity
                    ? `${activeTrip.destinationCity} (${activeTrip.destinationState || ''})`.trim()
                    : activeTrip?.destination || activeTrip?.destinationAddress || 'Destino'}
                </Text>
              </View>
              {activeTrip?.vehicle && (
                <View style={styles.completeVehicleRow}>
                  <View style={styles.completePlateBadge}>
                    <Text style={styles.completePlateText}>
                      {activeTrip.vehicle.plate}
                    </Text>
                  </View>
                  <Text style={styles.completeVehicleModel}>
                    {`${activeTrip.vehicle.brand || ''} ${activeTrip.vehicle.model || ''}`.trim()}
                  </Text>
                </View>
              )}
            </View>

            {/* Odômetro Anterior */}
            <View style={styles.previousKmCard}>
              <View style={styles.previousKmLeft}>
                <Ionicons name="speedometer-outline" size={16} color={colors.textMuted} />
                <Text style={styles.previousKmLabel}>Odômetro anterior:</Text>
              </View>
              <Text style={styles.previousKmValue}>
                {activeTrip?.vehicle?.currentKm != null
                  ? `${Number(activeTrip.vehicle.currentKm).toLocaleString('pt-BR')} km`
                  : '-- km'}
              </Text>
            </View>

            {/* Input KM Final */}
            <View style={styles.completeKmSection}>
              <Text style={styles.completeKmLabel}>KM FINAL DO ODÔMETRO</Text>
              <View style={styles.completeKmInputContainer}>
                <TextInput
                  style={styles.completeKmInput}
                  value={finalKm}
                  onChangeText={setFinalKm}
                  keyboardType="numeric"
                  placeholder="ex: 148580"
                  placeholderTextColor={colors.textDim}
                />
                <Text style={styles.completeKmSuffix}>KM</Text>
              </View>
              {(() => {
                const parsed = parseInt(finalKm.replace(/\D/g, ''), 10);
                const prev = activeTrip?.vehicle?.currentKm ?? 0;
                if (!isNaN(parsed) && prev > 0 && parsed < prev) {
                  return (
                    <Text style={styles.completeKmWarning}>
                      ⚠️ Odômetro informado é menor que o anterior ({Number(prev).toLocaleString('pt-BR')} km).
                    </Text>
                  );
                }
                if (!isNaN(parsed) && parsed > prev) {
                  const diff = parsed - prev;
                  return (
                    <Text style={styles.completeKmSuccess}>
                      ✓ Distância calculada nesta viagem: +{diff.toLocaleString('pt-BR')} km
                    </Text>
                  );
                }
                return null;
              })()}
            </View>

            {/* Botões de Ação */}
            <View style={styles.completeActionRow}>
              <TouchableOpacity
                style={styles.completeCancelBtn}
                onPress={() => setCompleteModalOpen(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.completeCancelText}>Voltar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.completeConfirmBtn, completing && { opacity: 0.6 }]}
                onPress={handleConfirmCompleteTrip}
                disabled={completing}
                activeOpacity={0.85}
              >
                {completing ? (
                  <ActivityIndicator size="small" color="#080B0C" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={17} color="#080B0C" style={{ marginRight: 6 }} />
                    <Text style={styles.completeConfirmText}>Concluir Chegada</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  avatarPhoto: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
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
  headerQueueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 12,
  },
  headerQueueBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FBBF24',
  },
  offlineBanner: {
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
  offlineBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  offlineIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  offlineTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FBBF24',
  },
  offlineSubtitle: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 1,
  },
  offlineRetryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  offlineRetryText: {
    color: '#FBBF24',
    fontSize: 11,
    fontWeight: '800',
  },
  queueBanner: {
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.35)',
    borderRadius: 18,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  queueBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  queueIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  queueTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#38BDF8',
  },
  queueSubtitle: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 1,
  },
  queueSyncBtn: {
    backgroundColor: '#38BDF8',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  queueSyncText: {
    color: '#080B0C',
    fontSize: 11,
    fontWeight: '900',
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
  emptyTripCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    gap: 12,
  },
  emptyTripHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  emptyTripIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 107, 0, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 0, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTripTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  emptyTripSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  emptyTripText: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
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
  gpsBadgeOffline: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
  },
  gpsDotOffline: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#F59E0B',
    marginRight: 5,
  },
  gpsTextOffline: {
    color: '#F59E0B',
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
  gpsNavButton: {
    backgroundColor: '#0F1822',
    borderWidth: 1,
    borderColor: '#1E2F40',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  gpsNavLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  gpsNavIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(5, 200, 247, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gpsNavText: {
    color: '#05C8F7',
    fontSize: 12,
    fontWeight: '800',
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
  updateProgressContainer: {
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
    gap: 6,
  },
  updateProgressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  updateProgressTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#E7EBEE',
  },
  updateProgressPercent: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FF7A00',
    fontVariant: ['tabular-nums'],
  },
  updateProgressBarTrack: {
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  updateProgressBarFill: {
    height: '100%',
    backgroundColor: '#FF7A00',
    borderRadius: 3,
  },
  updateProgressHint: {
    fontSize: 10,
    color: '#94A3B8',
    fontStyle: 'italic',
  },
  downloadModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(8, 11, 12, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  downloadModalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#11161A',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 122, 0, 0.3)',
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 12,
  },
  downloadModalIconBox: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 122, 0, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 122, 0, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  downloadModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#E7EBEE',
    marginBottom: 6,
    textAlign: 'center',
  },
  downloadModalSubtitle: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 18,
  },
  downloadProgressRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  downloadProgressLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#CAD2D9',
  },
  downloadProgressValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FF7A00',
    fontVariant: ['tabular-nums'],
  },
  downloadProgressBarTrack: {
    width: '100%',
    height: 8,
    backgroundColor: '#1E262B',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 12,
  },
  downloadProgressBarFill: {
    height: '100%',
    backgroundColor: '#FF7A00',
    borderRadius: 4,
  },
  downloadModalHint: {
    fontSize: 11,
    color: '#8E9DA8',
    textAlign: 'center',
    lineHeight: 16,
  },
  /* MODAL DOCUMENTOS */
  docsModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(8, 11, 12, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  docsModalCard: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '85%',
    backgroundColor: '#0F1215',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#222A2F',
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 20,
  },
  docsModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1A2126',
  },
  docsModalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  docsModalIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 122, 0, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 122, 0, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  docsModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#E7EBEE',
  },
  docsModalSubtitle: {
    fontSize: 11,
    color: '#8E9DA8',
    marginTop: 1,
  },
  docsModalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#161B1E',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#222A2F',
  },
  docsModalScroll: {
    marginBottom: 16,
  },
  docSectionCard: {
    backgroundColor: '#080B0C',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#222A2F',
    padding: 14,
    marginBottom: 12,
  },
  docSectionTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  docSectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  docSectionTitle: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#8E9DA8',
    letterSpacing: 0.5,
  },
  plateBadge: {
    backgroundColor: '#161B1E',
    borderWidth: 1,
    borderColor: '#FF7A00',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  plateBadgeText: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 11,
    fontWeight: '900',
    color: '#FF7A00',
    letterSpacing: 1,
  },
  docVehicleName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#E7EBEE',
    marginBottom: 4,
  },
  docDriverName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#E7EBEE',
    marginBottom: 4,
  },
  docDetailsDivider: {
    height: 1,
    backgroundColor: '#161B1E',
    marginVertical: 10,
  },
  docDetailsGrid: {
    gap: 7,
  },
  docDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  docDetailLabel: {
    fontSize: 11.5,
    color: '#8E9DA8',
  },
  docDetailValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#CAD2D9',
  },
  docDetailValueMono: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 12,
    fontWeight: '700',
    color: '#CAD2D9',
  },
  docDetailValueGreen: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#34D399',
  },
  docStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  docStatusDotGreen: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#34D399',
  },
  docStatusDotOrange: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#F59E0B',
  },
  docStatusDotRed: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#EF4444',
  },
  docStatusTextGreen: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#34D399',
  },
  cnhBadgeGreen: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(52, 211, 153, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.3)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2.5,
  },
  cnhBadgeTextGreen: {
    fontSize: 10,
    fontWeight: '900',
    color: '#34D399',
    letterSpacing: 0.5,
  },
  cnhBadgeOrange: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2.5,
  },
  cnhBadgeTextOrange: {
    fontSize: 10,
    fontWeight: '900',
    color: '#F59E0B',
    letterSpacing: 0.5,
  },
  cnhBadgeRed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2.5,
  },
  cnhBadgeTextRed: {
    fontSize: 10,
    fontWeight: '900',
    color: '#EF4444',
    letterSpacing: 0.5,
  },
  docWarningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#1A2126',
  },
  docWarningText: {
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
    lineHeight: 15,
  },
  docsModalCloseFullBtn: {
    backgroundColor: '#1E262B',
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docsModalCloseFullText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#CAD2D9',
  },
  /* MODAL FINALIZAR VIAGEM */
  completeModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(8, 11, 12, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  completeModalCard: {
    backgroundColor: '#0F1215',
    borderWidth: 1,
    borderColor: '#222A2F',
    borderRadius: 24,
    width: '100%',
    maxWidth: 400,
    padding: 20,
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 10,
  },
  completeModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  completeModalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  completeIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 107, 0, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 0, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  completeModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#E7EBEE',
  },
  completeModalSubtitle: {
    fontSize: 11,
    color: '#8E9DA8',
    marginTop: 2,
  },
  completeModalCloseBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#161B1E',
  },
  completeRouteCard: {
    backgroundColor: '#161B1E',
    borderWidth: 1,
    borderColor: '#222A2F',
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  completeRouteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  completeRouteText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#E7EBEE',
  },
  completeVehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  completePlateBadge: {
    backgroundColor: 'rgba(255, 107, 0, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 0, 0.25)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  completePlateText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  completeVehicleModel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#8E9DA8',
  },
  previousKmCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#11161A',
    borderWidth: 1,
    borderColor: '#1D2429',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  previousKmLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  previousKmLabel: {
    fontSize: 11,
    color: '#8E9DA8',
    fontWeight: '600',
  },
  previousKmValue: {
    fontSize: 12,
    fontWeight: '800',
    color: '#E7EBEE',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  completeKmSection: {
    gap: 6,
  },
  completeKmLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#8E9DA8',
    letterSpacing: 0.8,
  },
  completeKmInputContainer: {
    position: 'relative',
    justifyContent: 'center',
  },
  completeKmInput: {
    backgroundColor: '#080B0C',
    borderWidth: 1,
    borderColor: '#222A2F',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '800',
    color: '#E7EBEE',
  },
  completeKmSuffix: {
    position: 'absolute',
    right: 14,
    fontSize: 12,
    fontWeight: '800',
    color: '#8E9DA8',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  completeKmWarning: {
    fontSize: 11,
    color: '#F59E0B',
    fontWeight: '600',
    marginTop: 2,
  },
  completeKmSuccess: {
    fontSize: 11,
    color: '#34D399',
    fontWeight: '700',
    marginTop: 2,
  },
  completeActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  completeCancelBtn: {
    flex: 1,
    backgroundColor: '#1E262B',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completeCancelText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#CAD2D9',
  },
  completeConfirmBtn: {
    flex: 1.5,
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  completeConfirmText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#080B0C',
    letterSpacing: 0.3,
  },
});

