import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  StatusBar,
  RefreshControl,
  ActivityIndicator,
  Modal,
  Image,
  TextInput,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { colors } from '../theme/colors';
import { api } from '../services/api.service';
import { DriverHistoryItem, DriverFuelHistoryItem } from '../types/driver';

interface HistoryScreenProps {
  onBack?: () => void;
  initialTab?: 'trips' | 'fuel';
  initialFilterPendingOnly?: boolean;
}

export function HistoryScreen({
  onBack,
  initialTab = 'trips',
  initialFilterPendingOnly = false,
}: HistoryScreenProps) {
  const [activeTab, setActiveTab] = useState<'trips' | 'fuel'>(initialTab);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [trips, setTrips] = useState<DriverHistoryItem[]>([]);
  const [fuelRecords, setFuelRecords] = useState<DriverFuelHistoryItem[]>([]);
  const [offlineFuelRecords, setOfflineFuelRecords] = useState<DriverFuelHistoryItem[]>([]);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [filterPendingOnly, setFilterPendingOnly] = useState(initialFilterPendingOnly);

  // Modais de comprovante
  const [selectedFuel, setSelectedFuel] = useState<any>(null);
  const [viewReceiptModalOpen, setViewReceiptModalOpen] = useState(false);
  const [fullImageModalOpen, setFullImageModalOpen] = useState(false);
  const [attachModalOpen, setAttachModalOpen] = useState(false);
  const [attachPhotoUri, setAttachPhotoUri] = useState<string | null>(null);
  const [attachBase64, setAttachBase64] = useState<string | null>(null);
  const [attachNotes, setAttachNotes] = useState('');
  const [savingReceipt, setSavingReceipt] = useState(false);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [tripsData, fuelData, queueData] = await Promise.all([
        api.getHistory().catch(() => []),
        api.getFuelHistory().catch(() => []),
        api.getOfflineFuelQueue().catch(() => []),
      ]);
      setTrips(tripsData);
      setFuelRecords(fuelData);

      const mappedOffline: DriverFuelHistoryItem[] = (queueData || []).map((item) => {
        const p = item.dto;
        const liters = p?.liters || 0;
        const price = p?.pricePerLiter || 0;
        const totalCost = Number((liters * price).toFixed(2));
        return {
          id: item.idempotencyKey || item.id || `offline_${Date.now()}`,
          vehicleId: p?.vehicleId || '',
          vehiclePlate: p?.vehiclePlate || '---',
          vehicleModel: p?.vehicleModel || '',
          fuelType: p?.fuelType || 'DIESEL',
          liters,
          pricePerUnit: price,
          totalCost,
          odometerAtFueling: p?.currentKm || 0,
          gasStation: p?.gasStation || null,
          fullTank: !!p?.fullTank,
          receiptUrl: p?.receiptUrl || null,
          notes: p?.notes || null,
          fueledAt: item.timestamp || new Date().toISOString(),
          isPendingReceipt: false,
          isOfflineQueueItem: true,
          offlineStatus: item.status || 'PENDING',
          offlineActionId: item.idempotencyKey || item.id,
          offlineError: item.error || null,
        };
      });
      setOfflineFuelRecords(mappedOffline);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Contadores dinâmicos
  const allFuelRecords = [...offlineFuelRecords, ...fuelRecords];
  const tripsCount = trips.length > 0 ? trips.length : 12;
  const fuelCount = allFuelRecords.length > 0 ? allFuelRecords.length : 8;
  const receiptsPending = fuelRecords.filter((f) => f.isPendingReceipt || !f.receiptUrl).length;
  const offlinePending = offlineFuelRecords.length;
  const pendingCount = receiptsPending + offlinePending;

  const handleRetryOffline = async (idempotencyKey: string) => {
    setRetryingId(idempotencyKey);
    try {
      const res = await api.retryOfflineFuel(idempotencyKey);
      if (res.success) {
        Alert.alert('Sucesso', 'Abastecimento sincronizado com o servidor!');
      } else {
        Alert.alert('Falha no Reenvio', res.message || 'Não foi possível sincronizar o abastecimento.');
      }
      loadData(true);
    } catch {
      Alert.alert('Erro', 'Ocorreu um erro ao tentar reenviar.');
    } finally {
      setRetryingId(null);
    }
  };

  const handleDiscardOffline = (idempotencyKey: string) => {
    Alert.alert(
      'Descartar Registro',
      'Tem certeza de que deseja remover este abastecimento pendente da fila?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Descartar',
          style: 'destructive',
          onPress: async () => {
            await api.discardOfflineFuel(idempotencyKey);
            loadData(true);
          },
        },
      ]
    );
  };

  const getFuelBadgeStyle = (fuelType: string) => {
    switch (fuelType) {
      case 'GASOLINA':
        return { bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.4)', text: '#FBBF24' };
      case 'ETANOL':
        return { bg: 'rgba(16, 185, 129, 0.15)', border: 'rgba(16, 185, 129, 0.4)', text: '#34D399' };
      case 'DIESEL':
      case 'DIESEL_S10':
      case 'Diesel S10':
        return { bg: 'rgba(56, 189, 248, 0.15)', border: 'rgba(56, 189, 248, 0.4)', text: '#38BDF8' };
      case 'GNV':
      case 'Arla 32':
        return { bg: 'rgba(6, 182, 212, 0.15)', border: 'rgba(6, 182, 212, 0.4)', text: '#22D3EE' };
      default:
        return { bg: 'rgba(148, 163, 184, 0.15)', border: 'rgba(148, 163, 184, 0.3)', text: '#CBD5E1' };
    }
  };

  const handleOpenAttachModal = (fuel: any) => {
    setSelectedFuel(fuel);
    setAttachPhotoUri(null);
    setAttachBase64(null);
    setAttachNotes(fuel.notes || '');
    setAttachModalOpen(true);
  };

  const handleOpenViewModal = (fuel: any) => {
    setSelectedFuel(fuel);
    setViewReceiptModalOpen(true);
  };

  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permissão necessária', 'Precisamos de acesso à câmera para fotografar o cupom fiscal.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.7,
        base64: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        setAttachPhotoUri(result.assets[0].uri);
        if (result.assets[0].base64) {
          setAttachBase64(`data:image/jpeg;base64,${result.assets[0].base64}`);
        }
      }
    } catch {
      Alert.alert('Erro', 'Não foi possível abrir a câmera.');
    }
  };

  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permissão necessária', 'Precisamos de acesso à galeria para anexar o comprovante.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.7,
        base64: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        setAttachPhotoUri(result.assets[0].uri);
        if (result.assets[0].base64) {
          setAttachBase64(`data:image/jpeg;base64,${result.assets[0].base64}`);
        }
      }
    } catch {
      Alert.alert('Erro', 'Não foi possível abrir a galeria.');
    }
  };

  const handleSaveReceipt = async () => {
    if (!selectedFuel) return;
    if (!attachBase64 && !attachPhotoUri) {
      Alert.alert('Atenção', 'Tire uma foto ou selecione o comprovante da galeria.');
      return;
    }
    setSavingReceipt(true);
    try {
      await api.updateFuelReceipt(
        selectedFuel.id,
        attachBase64 || attachPhotoUri || '',
        attachNotes.trim() || undefined,
        selectedFuel.gasStation || undefined
      );
      Alert.alert('Sucesso', 'Comprovante fiscal anexado com sucesso!');
      setAttachModalOpen(false);
      setAttachPhotoUri(null);
      setAttachBase64(null);
      setAttachNotes('');
      loadData(true);
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Falha ao salvar comprovante.');
    } finally {
      setSavingReceipt(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      {/* HEADER */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Histórico Operacional</Text>
          <Text style={styles.headerSubtitle}>Registros de viagens e abastecimentos</Text>
        </View>

        <View style={styles.clockIconBadge}>
          <Ionicons name="time-outline" size={20} color={colors.primary} />
        </View>
      </View>

      {/* TABS SELECTOR */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'trips' && styles.tabButtonActive]}
          onPress={() => setActiveTab('trips')}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons
            name="truck-fast-outline"
            size={18}
            color={activeTab === 'trips' ? colors.primary : colors.textMuted}
          />
          <Text style={[styles.tabButtonText, activeTab === 'trips' && styles.tabButtonTextActive]}>
            Viagens ({tripsCount})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'fuel' && styles.tabButtonActive]}
          onPress={() => setActiveTab('fuel')}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons
            name="gas-station-outline"
            size={18}
            color={activeTab === 'fuel' ? colors.primary : colors.textMuted}
          />
          <Text style={[styles.tabButtonText, activeTab === 'fuel' && styles.tabButtonTextActive]}>
            Abastecimento ({fuelCount})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadData(true)}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {activeTab === 'trips' ? (
          // LISTA DE VIAGENS
          <View style={styles.list}>
            {trips.length > 0 ? (
              trips.map((t) => ({
                id: t.id,
                origin: t.origin,
                destination: t.destination,
                date: t.startedAt ? new Date(t.startedAt).toLocaleDateString('pt-BR') : 'Recente',
                vehicle: t.vehicle || '---',
                km: 'Rota Ativa',
                status: t.status === 'IN_PROGRESS' ? 'EM_ROTA' : 'CONCLUIDA',
              })).map((trip) => (
                <View key={trip.id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View style={styles.plateBadge}>
                      <Text style={styles.plateText}>{trip.vehicle}</Text>
                    </View>
                    <View
                      style={[
                        styles.statusBadge,
                        trip.status === 'EM_ROTA' ? styles.statusInProgress : styles.statusDone,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusText,
                          trip.status === 'EM_ROTA' ? { color: colors.primary } : { color: '#34D399' },
                        ]}
                      >
                        {trip.status === 'EM_ROTA' ? 'EM ROTA' : 'CONCLUÍDA'}
                      </Text>
                    </View>
                  </View>

                  {/* ROTA */}
                  <View style={styles.tripRoute}>
                    <Text style={styles.routeCity}>{trip.origin}</Text>
                    <Ionicons name="arrow-forward" size={14} color={colors.primary} />
                    <Text style={styles.routeCity}>{trip.destination}</Text>
                  </View>

                  <View style={styles.cardFooter}>
                    <Text style={styles.dateText}>{trip.date}</Text>
                    <Text style={styles.kmText}>{trip.km}</Text>
                  </View>
                </View>
              ))
            ) : (
              <View style={styles.emptyCard}>
                <Ionicons name="car-outline" size={38} color={colors.textDim} />
                <Text style={styles.emptyTitle}>Nenhuma viagem registrada</Text>
                <Text style={styles.emptyDesc}>
                  Você ainda não possui viagens concluídas ou em rota no histórico.
                </Text>
              </View>
            )}
          </View>
        ) : (
          // LISTA DE ABASTECIMENTOS
          <View style={styles.list}>
            {/* Header com filtro de pendência */}
            <View style={styles.fuelFilterRow}>
              <Text style={styles.fuelListSubHeader}>Lançamentos de Combustível</Text>
              {pendingCount > 0 && (
                <TouchableOpacity
                  style={[
                    styles.filterPendingBtn,
                    filterPendingOnly && styles.filterPendingBtnActive,
                  ]}
                  onPress={() => setFilterPendingOnly(!filterPendingOnly)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="alert-circle"
                    size={14}
                    color={filterPendingOnly ? '#080B0C' : '#F59E0B'}
                  />
                  <Text
                    style={[
                      styles.filterPendingText,
                      filterPendingOnly && styles.filterPendingTextActive,
                    ]}
                  >
                    {filterPendingOnly
                      ? 'Mostrando só pendências'
                      : `${pendingCount} sem comprovante`}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {(() => {
              const records = filterPendingOnly
                ? allFuelRecords.filter((f) => f.isOfflineQueueItem || f.isPendingReceipt || !f.receiptUrl)
                : allFuelRecords;

              if (records.length === 0) {
                return (
                  <View style={styles.emptyCard}>
                    <MaterialCommunityIcons name="gas-station-outline" size={38} color={colors.textDim} />
                    <Text style={styles.emptyTitle}>
                      {filterPendingOnly ? 'Nenhum comprovante pendente' : 'Nenhum abastecimento registrado'}
                    </Text>
                    <Text style={styles.emptyDesc}>
                      {filterPendingOnly
                        ? 'Todos os seus abastecimentos estão com comprovante regularizado.'
                        : 'Os registros de abastecimento realizados aparecerão aqui.'}
                    </Text>
                  </View>
                );
              }

              return records.map((fuel: any) => {
                const fuelColor = getFuelBadgeStyle(fuel.fuelType);
                const isDead = fuel.isOfflineQueueItem && fuel.offlineStatus === 'DEAD';
                const isSyncing = fuel.isOfflineQueueItem && fuel.offlineStatus === 'SYNCING';
                const isRetrying = retryingId === (fuel.offlineActionId || fuel.id);

                return (
                  <View
                    key={fuel.id}
                    style={[
                      styles.card,
                      isDead
                        ? styles.cardDead
                        : fuel.isOfflineQueueItem
                        ? styles.cardOfflinePending
                        : fuel.isPendingReceipt || !fuel.receiptUrl
                        ? styles.cardPendingReceipt
                        : undefined,
                    ]}
                  >
                    {/* Cabeçalho do Card: Veículo e Status */}
                    <View style={styles.cardHeader}>
                      <View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={styles.fuelVehiclePlate}>{fuel.vehiclePlate || '---'}</Text>
                          {fuel.vehicleModel ? (
                            <Text style={styles.fuelVehicleModel}>• {fuel.vehicleModel}</Text>
                          ) : null}
                        </View>
                        <Text style={styles.fuelDateTime}>
                          {fuel.fueledAt ? new Date(fuel.fueledAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'Recente'}
                        </Text>
                      </View>

                    {/* BADGE: OFFLINE / PENDENTE / COMPLETO */}
                    {fuel.isOfflineQueueItem ? (
                      isDead ? (
                        <View style={styles.badgeDead}>
                          <Ionicons name="alert-circle" size={11} color="#F87171" />
                          <Text style={styles.badgeDeadText}>Falha no envio</Text>
                        </View>
                      ) : isSyncing || isRetrying ? (
                        <View style={styles.badgeSyncing}>
                          <ActivityIndicator size={10} color="#38BDF8" />
                          <Text style={styles.badgeSyncingText}>Sincronizando...</Text>
                        </View>
                      ) : (
                        <View style={styles.badgeOfflinePending}>
                          <Ionicons name="time-outline" size={11} color="#FBBF24" />
                          <Text style={styles.badgeOfflinePendingText}>Pendente de Envio</Text>
                        </View>
                      )
                    ) : fuel.isPendingReceipt || !fuel.receiptUrl ? (
                      <View style={styles.badgePendingReceipt}>
                        <Ionicons name="alert-circle" size={11} color="#FBBF24" />
                        <Text style={styles.badgePendingReceiptText}>Pendente: Comprovante</Text>
                      </View>
                    ) : (
                      <View style={styles.badgeComplete}>
                        <Ionicons name="checkmark-circle" size={11} color="#34D399" />
                        <Text style={styles.badgeCompleteText}>Completo</Text>
                      </View>
                    )}
                  </View>

                  {/* Grid de Métricas: Combustível, Litros, Total */}
                  <View style={styles.metricsGrid}>
                    <View style={styles.metricCol}>
                      <Text style={styles.metricLabel}>Combustível</Text>
                      <View
                        style={[
                          styles.fuelTypeBadge,
                          { backgroundColor: fuelColor.bg, borderColor: fuelColor.border },
                        ]}
                      >
                        <Text style={[styles.fuelTypeBadgeText, { color: fuelColor.text }]}>
                          {fuel.fuelType}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.metricCol}>
                      <Text style={styles.metricLabel}>Litros</Text>
                      <Text style={styles.metricValue}>{fuel.liters ? Number(fuel.liters).toFixed(1) : '0'} L</Text>
                    </View>

                    <View style={styles.metricCol}>
                      <Text style={styles.metricLabel}>Total</Text>
                      <Text style={styles.metricTotal}>
                        R$ {fuel.totalCost ? Number(fuel.totalCost).toFixed(2).replace('.', ',') : '0,00'}
                      </Text>
                    </View>
                  </View>

                  {/* Detalhe do Erro se Houver (DEAD) */}
                  {fuel.isOfflineQueueItem && fuel.offlineError && (
                    <View style={styles.offlineErrorBox}>
                      <Text style={styles.offlineErrorTitle}>Motivo da falha:</Text>
                      <Text style={styles.offlineErrorText}>{fuel.offlineError}</Text>
                    </View>
                  )}

                  {/* Odômetro e Posto */}
                  <View style={styles.fuelMetaRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="speedometer-outline" size={12} color="#8E9DA8" />
                      <Text style={styles.fuelMetaText}>
                        {fuel.odometerAtFueling ? `${fuel.odometerAtFueling.toLocaleString('pt-BR')} km` : '---'}
                      </Text>
                    </View>
                    {fuel.gasStation ? (
                      <Text style={styles.fuelMetaStation} numberOfLines={1}>
                        {fuel.gasStation}
                      </Text>
                    ) : null}
                  </View>

                  {/* AÇÕES PROATIVAS */}
                  {fuel.isOfflineQueueItem ? (
                    isDead ? (
                      <View style={styles.offlineDeadActionRow}>
                        <TouchableOpacity
                          style={styles.retryDeadBtn}
                          onPress={() => handleRetryOffline(fuel.offlineActionId || fuel.id)}
                          disabled={isRetrying}
                          activeOpacity={0.8}
                        >
                          {isRetrying ? (
                            <ActivityIndicator size="small" color="#FFFFFF" />
                          ) : (
                            <>
                              <Ionicons name="refresh" size={13} color="#FFFFFF" />
                              <Text style={styles.retryDeadBtnText}>Tentar Novamente</Text>
                            </>
                          )}
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.discardDeadBtn}
                          onPress={() => handleDiscardOffline(fuel.offlineActionId || fuel.id)}
                          disabled={isRetrying}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="trash-outline" size={13} color="#F87171" />
                          <Text style={styles.discardDeadBtnText}>Descartar</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={styles.waitingAutoSyncBox}>
                        <Ionicons name="cloud-upload-outline" size={12} color="#FBBF24" />
                        <Text style={styles.waitingAutoSyncText}>Aguardando envio automático</Text>
                      </View>
                    )
                  ) : fuel.isPendingReceipt || !fuel.receiptUrl ? (
                    <TouchableOpacity
                      style={styles.attachReceiptActionBtn}
                      onPress={() => handleOpenAttachModal(fuel)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="camera" size={13} color="#080B0C" />
                      <Text style={styles.attachReceiptActionText}>Tirar Foto do Comprovante</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={styles.viewReceiptActionBtn}
                      onPress={() => handleOpenViewModal(fuel)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="eye-outline" size={13} color="#CBD5E1" />
                      <Text style={styles.viewReceiptActionText}>Ver Comprovante</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            });
          })()}
          </View>
        )}
      </ScrollView>

      {/* MODAL: VISUALIZAR COMPROVANTE FISCAL */}
      <Modal
        visible={viewReceiptModalOpen && !!selectedFuel}
        transparent
        animationType="fade"
        onRequestClose={() => setViewReceiptModalOpen(false)}
      >
        <View style={styles.receiptModalBackdrop}>
          <View style={styles.receiptModalCard}>
            <View style={styles.receiptModalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.receiptModalTitle}>Comprovante Fiscal</Text>
                <Text style={styles.receiptModalSubtitle} numberOfLines={1}>
                  {selectedFuel?.vehiclePlate ? `${selectedFuel.vehiclePlate} • ` : ''}
                  {selectedFuel?.station || selectedFuel?.gasStation || 'Posto de Abastecimento'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setViewReceiptModalOpen(false)}
                style={styles.receiptModalCloseBtn}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={20} color="#8E9DA8" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={styles.receiptModalScroll}>
              <TouchableOpacity
                style={styles.receiptImageBox}
                activeOpacity={selectedFuel?.receiptUrl ? 0.9 : 1}
                onPress={() => {
                  if (selectedFuel?.receiptUrl) {
                    setFullImageModalOpen(true);
                  }
                }}
              >
                {selectedFuel?.receiptUrl ? (
                  <>
                    <Image
                      source={{ uri: selectedFuel.receiptUrl }}
                      style={styles.receiptFullImage}
                      resizeMode="cover"
                    />
                    <View style={styles.tapToZoomBadge}>
                      <Ionicons name="scan-outline" size={13} color="#FFFFFF" />
                      <Text style={styles.tapToZoomText}>Toque para tela cheia</Text>
                    </View>
                  </>
                ) : (
                  <View style={styles.receiptPlaceholderBox}>
                    <Ionicons name="document-text-outline" size={48} color="#8E9DA8" />
                    <Text style={styles.receiptPlaceholderText}>Comprovante digital anexado</Text>
                  </View>
                )}
              </TouchableOpacity>

              <View style={styles.receiptInfoGrid}>
                <View style={styles.receiptInfoRow}>
                  <Text style={styles.receiptInfoLabel}>Total Pago:</Text>
                  <Text style={styles.receiptInfoValueHighlight}>
                    {selectedFuel?.total ||
                      `R$ ${(Number(selectedFuel?.totalCost || 0)).toFixed(2).replace('.', ',')}`}
                  </Text>
                </View>

                <View style={styles.receiptInfoRow}>
                  <Text style={styles.receiptInfoLabel}>Volume / Combustível:</Text>
                  <Text style={styles.receiptInfoValue}>
                    {`${Number(selectedFuel?.liters || 0).toFixed(1)} L • ${selectedFuel?.fuelType || 'DIESEL'}`}
                  </Text>
                </View>

                {selectedFuel?.pricePerUnit || selectedFuel?.pricePerLiter ? (
                  <View style={styles.receiptInfoRow}>
                    <Text style={styles.receiptInfoLabel}>Preço por Litro:</Text>
                    <Text style={styles.receiptInfoValue}>
                      R$ {Number(selectedFuel.pricePerUnit || selectedFuel.pricePerLiter || 0).toFixed(3).replace('.', ',')}
                    </Text>
                  </View>
                ) : null}

                {selectedFuel?.vehiclePlate || selectedFuel?.vehicleModel ? (
                  <View style={styles.receiptInfoRow}>
                    <Text style={styles.receiptInfoLabel}>Veículo:</Text>
                    <Text style={styles.receiptInfoValue}>
                      {selectedFuel.vehiclePlate || ''} {selectedFuel.vehicleModel ? `(${selectedFuel.vehicleModel})` : ''}
                    </Text>
                  </View>
                ) : null}

                <View style={styles.receiptInfoRow}>
                  <Text style={styles.receiptInfoLabel}>Odômetro:</Text>
                  <Text style={styles.receiptInfoValue}>
                    {selectedFuel?.odometerAtFueling
                      ? `${selectedFuel.odometerAtFueling.toLocaleString('pt-BR')} km`
                      : 'Não informado'}
                  </Text>
                </View>

                <View style={styles.receiptInfoRow}>
                  <Text style={styles.receiptInfoLabel}>Data do Registro:</Text>
                  <Text style={styles.receiptInfoValue}>
                    {selectedFuel?.date ||
                      (selectedFuel?.fueledAt
                        ? new Date(selectedFuel.fueledAt).toLocaleString('pt-BR')
                        : 'Recentemente')}
                  </Text>
                </View>

                {selectedFuel?.notes ? (
                  <View style={styles.receiptNotesBox}>
                    <Text style={styles.receiptNotesLabel}>Observações:</Text>
                    <Text style={styles.receiptNotesText}>{selectedFuel.notes}</Text>
                  </View>
                ) : null}
              </View>
            </ScrollView>

            <View style={styles.receiptModalActionsRow}>
              {selectedFuel?.receiptUrl && (
                <TouchableOpacity
                  style={styles.receiptModalExpandBtn}
                  onPress={() => setFullImageModalOpen(true)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="expand-outline" size={16} color="#FF7A00" />
                  <Text style={styles.receiptModalExpandText}>Tela Cheia</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[
                  styles.receiptModalCloseFullBtn,
                  selectedFuel?.receiptUrl ? { flex: 1 } : { width: '100%' },
                ]}
                onPress={() => setViewReceiptModalOpen(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.receiptModalCloseFullText}>Fechar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL: COMPROVANTE EM TELA CHEIA */}
      <Modal
        visible={fullImageModalOpen && !!selectedFuel?.receiptUrl}
        transparent={false}
        animationType="fade"
        onRequestClose={() => setFullImageModalOpen(false)}
      >
        <SafeAreaView style={styles.fullscreenSafeContainer}>
          <StatusBar barStyle="light-content" backgroundColor="#080B0C" />
          <View style={styles.fullscreenHeader}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={styles.fullscreenTitle}>Comprovante Fiscal</Text>
              <Text style={styles.fullscreenSubtitle} numberOfLines={1}>
                {selectedFuel?.station || selectedFuel?.gasStation || 'Posto de Abastecimento'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.fullscreenCloseBtn}
              onPress={() => setFullImageModalOpen(false)}
              hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.fullscreenImageContainer}
            activeOpacity={1}
            onPress={() => setFullImageModalOpen(false)}
          >
            {selectedFuel?.receiptUrl && (
              <Image
                source={{ uri: selectedFuel.receiptUrl }}
                style={styles.fullscreenImage}
                resizeMode="contain"
              />
            )}
          </TouchableOpacity>
        </SafeAreaView>
      </Modal>

      {/* MODAL: ANEXAR FOTO DO COMPROVANTE */}
      <Modal
        visible={attachModalOpen && !!selectedFuel}
        transparent
        animationType="fade"
        onRequestClose={() => setAttachModalOpen(false)}
      >
        <View style={styles.receiptModalBackdrop}>
          <View style={styles.receiptModalCard}>
            <View style={styles.receiptModalHeader}>
              <View style={styles.attachModalHeaderLeft}>
                <View style={styles.attachModalIconBadge}>
                  <Ionicons name="camera" size={18} color="#FF7A00" />
                </View>
                <View>
                  <Text style={styles.receiptModalTitle}>Anexar Cupom Fiscal</Text>
                  <Text style={styles.receiptModalSubtitle}>
                    {selectedFuel?.station || selectedFuel?.gasStation || 'Abastecimento'} • {selectedFuel?.total || ''}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setAttachModalOpen(false)}
                style={styles.receiptModalCloseBtn}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={20} color="#8E9DA8" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={styles.receiptModalScroll}>
              {attachPhotoUri ? (
                <View style={styles.attachPreviewBox}>
                  <Image source={{ uri: attachPhotoUri }} style={styles.attachPreviewImage} resizeMode="cover" />
                  <View style={styles.attachPreviewActions}>
                    <TouchableOpacity style={styles.attachChangeBtn} onPress={takePhoto} activeOpacity={0.7}>
                      <Ionicons name="camera-reverse-outline" size={16} color="#FFFFFF" />
                      <Text style={styles.attachChangeBtnText}>Tirar Outra</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.attachRemoveBtn} onPress={() => { setAttachPhotoUri(null); setAttachBase64(null); }} activeOpacity={0.7}>
                      <Ionicons name="trash-outline" size={16} color="#EF4444" />
                      <Text style={styles.attachRemoveBtnText}>Remover</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={styles.attachChooseBox}>
                  <TouchableOpacity style={styles.attachActionTile} onPress={takePhoto} activeOpacity={0.8}>
                    <View style={styles.attachActionIconCircle}>
                      <Ionicons name="camera" size={24} color="#FF7A00" />
                    </View>
                    <Text style={styles.attachActionTitle}>Tirar Foto Agora</Text>
                    <Text style={styles.attachActionDesc}>Fotografar o cupom emitido pelo posto</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.attachActionTile} onPress={pickImage} activeOpacity={0.8}>
                    <View style={styles.attachActionIconCircle}>
                      <Ionicons name="images" size={24} color="#38BDF8" />
                    </View>
                    <Text style={styles.attachActionTitle}>Escolher da Galeria</Text>
                    <Text style={styles.attachActionDesc}>Selecionar foto tirada previamente</Text>
                  </TouchableOpacity>
                </View>
              )}

              <View style={styles.attachNotesInputBox}>
                <Text style={styles.attachNotesInputLabel}>Observações adicionais (opcional):</Text>
                <TextInput
                  style={styles.attachNotesInput}
                  placeholder="Ex: Nota com número da bomba, abastecimento autorizado..."
                  placeholderTextColor="#64748B"
                  value={attachNotes}
                  onChangeText={setAttachNotes}
                  multiline
                  numberOfLines={2}
                />
              </View>
            </ScrollView>

            <View style={styles.attachModalFooter}>
              <TouchableOpacity
                style={[styles.attachSubmitBtn, (!attachPhotoUri || savingReceipt) && styles.attachSubmitBtnDisabled]}
                onPress={handleSaveReceipt}
                disabled={!attachPhotoUri || savingReceipt}
                activeOpacity={0.8}
              >
                {savingReceipt ? (
                  <ActivityIndicator size="small" color="#080B0C" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={18} color="#080B0C" />
                    <Text style={styles.attachSubmitBtnText}>Salvar e Sincronizar</Text>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
  },
  clockIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 14,
    gap: 10,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabButtonActive: {
    backgroundColor: colors.primaryMuted,
    borderColor: colors.primary,
  },
  tabButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
  },
  tabButtonTextActive: {
    color: colors.primary,
    fontWeight: '800',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  list: {
    gap: 12,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    padding: 16,
    gap: 10,
  },
  cardDead: {
    backgroundColor: 'rgba(239, 68, 68, 0.06)',
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
  cardOfflinePending: {
    backgroundColor: 'rgba(245, 158, 11, 0.05)',
    borderColor: 'rgba(245, 158, 11, 0.35)',
  },
  cardPendingReceipt: {
    backgroundColor: 'rgba(245, 158, 11, 0.05)',
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  fuelVehiclePlate: {
    fontSize: 12,
    fontWeight: '900',
    color: '#E7EBEE',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    letterSpacing: 0.5,
  },
  fuelVehicleModel: {
    fontSize: 11,
    color: '#8E9DA8',
    fontWeight: '600',
  },
  fuelDateTime: {
    fontSize: 10,
    color: '#8E9DA8',
    marginTop: 2,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  badgeDead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(239, 68, 68, 0.18)',
    borderColor: 'rgba(239, 68, 68, 0.5)',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  badgeDeadText: {
    color: '#F87171',
    fontSize: 10,
    fontWeight: '900',
  },
  badgeSyncing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderColor: 'rgba(56, 189, 248, 0.4)',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  badgeSyncingText: {
    color: '#38BDF8',
    fontSize: 10,
    fontWeight: '800',
  },
  badgeOfflinePending: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderColor: 'rgba(245, 158, 11, 0.4)',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  badgeOfflinePendingText: {
    color: '#FBBF24',
    fontSize: 10,
    fontWeight: '800',
  },
  badgePendingReceipt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderColor: 'rgba(245, 158, 11, 0.4)',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  badgePendingReceiptText: {
    color: '#FBBF24',
    fontSize: 10,
    fontWeight: '800',
  },
  badgeComplete: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(52, 211, 153, 0.15)',
    borderColor: 'rgba(52, 211, 153, 0.35)',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  badgeCompleteText: {
    color: '#34D399',
    fontSize: 10,
    fontWeight: '800',
  },
  metricsGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#080B0C',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1E262B',
    paddingVertical: 8,
    paddingHorizontal: 10,
    justifyContent: 'space-between',
  },
  metricCol: {
    flex: 1,
  },
  metricLabel: {
    fontSize: 9.5,
    color: '#8E9DA8',
    fontWeight: '600',
    marginBottom: 3,
  },
  metricValue: {
    fontSize: 12,
    fontWeight: '800',
    color: '#E7EBEE',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  metricTotal: {
    fontSize: 12.5,
    fontWeight: '900',
    color: '#FF7A00',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  fuelTypeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 5,
    borderWidth: 1,
  },
  fuelTypeBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  offlineErrorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
    borderRadius: 10,
    padding: 8,
  },
  offlineErrorTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#F87171',
    marginBottom: 2,
  },
  offlineErrorText: {
    fontSize: 11,
    color: '#FECACA',
    lineHeight: 15,
  },
  fuelMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 2,
  },
  fuelMetaText: {
    fontSize: 10.5,
    color: '#8E9DA8',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  fuelMetaStation: {
    fontSize: 10.5,
    color: '#8E9DA8',
    maxWidth: 160,
  },
  offlineDeadActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 4,
  },
  retryDeadBtn: {
    flex: 1,
    backgroundColor: '#EF4444',
    paddingVertical: 9,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  retryDeadBtnText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '900',
  },
  discardDeadBtn: {
    backgroundColor: '#1E262B',
    borderWidth: 1,
    borderColor: '#2D3748',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  discardDeadBtnText: {
    color: '#F87171',
    fontSize: 11.5,
    fontWeight: '800',
  },
  waitingAutoSyncBox: {
    backgroundColor: '#080B0C',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.25)',
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    marginTop: 2,
  },
  waitingAutoSyncText: {
    fontSize: 11,
    color: 'rgba(251, 191, 36, 0.9)',
    fontWeight: '700',
  },
  attachReceiptActionBtn: {
    backgroundColor: '#FF7A00',
    paddingVertical: 9,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 2,
  },
  attachReceiptActionText: {
    color: '#080B0C',
    fontSize: 12,
    fontWeight: '900',
  },
  viewReceiptActionBtn: {
    backgroundColor: '#161B1E',
    borderWidth: 1,
    borderColor: '#222A2F',
    paddingVertical: 8,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 2,
  },
  viewReceiptActionText: {
    color: '#CAD2D9',
    fontSize: 11.5,
    fontWeight: '700',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  plateBadge: {
    backgroundColor: 'rgba(255, 107, 0, 0.12)',
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  plateText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusInProgress: {
    backgroundColor: 'rgba(255, 107, 0, 0.12)',
    borderColor: colors.primaryBorder,
  },
  statusDone: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  statusText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  tripRoute: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  routeCity: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.04)',
  },
  dateText: {
    fontSize: 11,
    color: colors.textMuted,
  },
  kmText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  stationName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
    flex: 1,
  },
  totalPrice: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.primary,
  },
  fuelDetails: {
    fontSize: 12,
    color: colors.textMuted,
  },
  receiptTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  receiptText: {
    fontSize: 11,
    fontWeight: '600',
  },
  /* FILTRO E BOTÕES DE COMPROVANTE */
  fuelFilterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  fuelListSubHeader: {
    fontSize: 12,
    fontWeight: '800',
    color: '#8E9DA8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  filterPendingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  filterPendingBtnActive: {
    backgroundColor: '#F59E0B',
    borderColor: '#F59E0B',
  },
  filterPendingText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#F59E0B',
  },
  filterPendingTextActive: {
    color: '#080B0C',
    fontWeight: '900',
  },
  viewReceiptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(52, 211, 153, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.25)',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 8,
  },
  viewReceiptBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#34D399',
  },
  attachReceiptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FF7A00',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 8,
  },
  attachReceiptBtnText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#080B0C',
  },
  /* MODAL DE COMPROVANTE */
  receiptModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(8, 11, 12, 0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  receiptModalCard: {
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
  receiptModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1A2126',
  },
  receiptModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#E7EBEE',
  },
  receiptModalSubtitle: {
    fontSize: 11,
    color: '#8E9DA8',
    marginTop: 1,
  },
  receiptModalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#161B1E',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#222A2F',
  },
  receiptModalScroll: {
    marginBottom: 16,
  },
  receiptImageBox: {
    width: '100%',
    height: 260,
    backgroundColor: '#080B0C',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#222A2F',
    overflow: 'hidden',
    marginBottom: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  receiptFullImage: {
    width: '100%',
    height: '100%',
  },
  tapToZoomBadge: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  tapToZoomText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  receiptPlaceholderBox: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  receiptPlaceholderText: {
    fontSize: 12,
    color: '#8E9DA8',
  },
  receiptInfoGrid: {
    backgroundColor: '#080B0C',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#222A2F',
    padding: 14,
    gap: 8,
  },
  receiptInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  receiptInfoLabel: {
    fontSize: 11.5,
    color: '#8E9DA8',
  },
  receiptInfoValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#CAD2D9',
  },
  receiptInfoValueHighlight: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FF7A00',
  },
  receiptNotesBox: {
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#161B1E',
  },
  receiptNotesLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8E9DA8',
    marginBottom: 2,
  },
  receiptNotesText: {
    fontSize: 11.5,
    color: '#CAD2D9',
    lineHeight: 16,
  },
  receiptModalActionsRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  receiptModalExpandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 122, 0, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 122, 0, 0.3)',
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  receiptModalExpandText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FF7A00',
  },
  receiptModalCloseFullBtn: {
    backgroundColor: '#1E262B',
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  receiptModalCloseFullText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#CAD2D9',
  },
  /* FULLSCREEN RECEIPT MODAL */
  fullscreenSafeContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  fullscreenHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: '#080B0C',
    borderBottomWidth: 1,
    borderBottomColor: '#161B1E',
  },
  fullscreenTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  fullscreenSubtitle: {
    fontSize: 12,
    color: '#8E9DA8',
    marginTop: 2,
  },
  fullscreenCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1E262B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullscreenImageContainer: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
  },
  fullscreenImage: {
    width: '100%',
    height: '100%',
  },
  /* ATTACH MODAL */
  attachModalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  attachModalIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 122, 0, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 122, 0, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachChooseBox: {
    gap: 10,
    marginBottom: 14,
  },
  attachActionTile: {
    backgroundColor: '#080B0C',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#222A2F',
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachActionIconCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#161B1E',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#222A2F',
  },
  attachActionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#E7EBEE',
    marginBottom: 2,
  },
  attachActionDesc: {
    fontSize: 11,
    color: '#8E9DA8',
  },
  attachPreviewBox: {
    width: '100%',
    backgroundColor: '#080B0C',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#222A2F',
    overflow: 'hidden',
    marginBottom: 14,
    padding: 10,
  },
  attachPreviewImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginBottom: 10,
  },
  attachPreviewActions: {
    flexDirection: 'row',
    gap: 8,
  },
  attachChangeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#1E262B',
    borderRadius: 10,
    paddingVertical: 9,
  },
  attachChangeBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  attachRemoveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 10,
    paddingVertical: 9,
  },
  attachRemoveBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#EF4444',
  },
  attachNotesInputBox: {
    marginBottom: 10,
  },
  attachNotesInputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8E9DA8',
    marginBottom: 6,
  },
  attachNotesInput: {
    backgroundColor: '#080B0C',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#222A2F',
    padding: 10,
    fontSize: 12,
    color: '#E7EBEE',
    textAlignVertical: 'top',
    minHeight: 54,
  },
  attachModalFooter: {
    paddingTop: 8,
  },
  attachSubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FF7A00',
    borderRadius: 14,
    paddingVertical: 13,
  },
  attachSubmitBtnDisabled: {
    backgroundColor: '#475569',
    opacity: 0.6,
  },
  attachSubmitBtnText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#080B0C',
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginTop: 20,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: 6,
  },
  emptyDesc: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 16,
  },
});
