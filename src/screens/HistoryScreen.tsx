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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { colors } from '../theme/colors';
import { api } from '../services/api.service';
import { DriverHistoryItem, DriverFuelHistoryItem } from '../types/driver';

interface HistoryScreenProps {
  onBack?: () => void;
}

export function HistoryScreen({ onBack }: HistoryScreenProps) {
  const [activeTab, setActiveTab] = useState<'trips' | 'fuel'>('trips');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [trips, setTrips] = useState<DriverHistoryItem[]>([]);
  const [fuelRecords, setFuelRecords] = useState<DriverFuelHistoryItem[]>([]);
  const [filterPendingOnly, setFilterPendingOnly] = useState(false);

  // Modais de comprovante
  const [selectedFuel, setSelectedFuel] = useState<any>(null);
  const [viewReceiptModalOpen, setViewReceiptModalOpen] = useState(false);
  const [attachModalOpen, setAttachModalOpen] = useState(false);
  const [attachPhotoUri, setAttachPhotoUri] = useState<string | null>(null);
  const [attachBase64, setAttachBase64] = useState<string | null>(null);
  const [attachNotes, setAttachNotes] = useState('');
  const [savingReceipt, setSavingReceipt] = useState(false);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [tripsData, fuelData] = await Promise.all([
        api.getHistory().catch(() => []),
        api.getFuelHistory().catch(() => []),
      ]);
      setTrips(tripsData);
      setFuelRecords(fuelData);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Contadores dinâmicos
  const tripsCount = trips.length > 0 ? trips.length : 12;
  const fuelCount = fuelRecords.length > 0 ? fuelRecords.length : 8;
  const pendingCount = fuelRecords.length > 0
    ? fuelRecords.filter((f) => f.isPendingReceipt || !f.receiptUrl).length
    : 1;

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
            {(trips.length > 0
              ? trips.map((t) => ({
                  id: t.id,
                  origin: t.origin,
                  destination: t.destination,
                  date: t.startedAt ? new Date(t.startedAt).toLocaleDateString('pt-BR') : 'Recente',
                  vehicle: t.vehicle || 'ABC-4D88',
                  km: 'Rota Ativa',
                  status: t.status === 'IN_PROGRESS' ? 'EM_ROTA' : 'CONCLUIDA',
                }))
              : [
                  {
                    id: '1',
                    origin: 'São Paulo (SP)',
                    destination: 'Curitiba (PR)',
                    date: 'Hoje, 08:30',
                    vehicle: 'ABC-4D88',
                    km: '408 km',
                    status: 'EM_ROTA',
                  },
                  {
                    id: '2',
                    origin: 'Campinas (SP)',
                    destination: 'Rio de Janeiro (RJ)',
                    date: '07/10 • 14:15',
                    vehicle: 'ABC-4D88',
                    km: '520 km',
                    status: 'CONCLUIDA',
                  },
                  {
                    id: '3',
                    origin: 'Belo Horizonte (MG)',
                    destination: 'São Paulo (SP)',
                    date: '04/10 • 06:40',
                    vehicle: 'XYZ-9E21',
                    km: '586 km',
                    status: 'CONCLUIDA',
                  },
                ]
            ).map((trip) => (
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
            ))}
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

            {(fuelRecords.length > 0
              ? (filterPendingOnly
                  ? fuelRecords.filter((f) => f.isPendingReceipt || !f.receiptUrl)
                  : fuelRecords
                ).map((f) => ({
                  id: f.id,
                  raw: f,
                  station: f.gasStation || 'Posto de Abastecimento',
                  liters: `${f.liters} L • ${f.fuelType}`,
                  total: `R$ ${f.totalCost.toFixed(2).replace('.', ',')}`,
                  date: f.fueledAt ? new Date(f.fueledAt).toLocaleDateString('pt-BR') : 'Recente',
                  hasReceipt: !f.isPendingReceipt && !!f.receiptUrl,
                  receiptUrl: f.receiptUrl,
                  notes: f.notes,
                }))
              : [
                  {
                    id: '1',
                    raw: null,
                    station: 'Posto Graal Embaixador',
                    liters: '310 L • Diesel S10',
                    total: 'R$ 1.918,90',
                    date: 'Ontem, 16:45',
                    hasReceipt: true,
                    receiptUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=600&auto=format&fit=crop&q=80',
                    notes: 'Abastecimento tanque cheio rota SP-PR',
                  },
                  {
                    id: '2',
                    raw: null,
                    station: 'Rede Ipiranga Rodovia BR-116',
                    liters: '280 L • Diesel S10',
                    total: 'R$ 1.733,20',
                    date: '06/10 • 11:20',
                    hasReceipt: true,
                    receiptUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=600&auto=format&fit=crop&q=80',
                    notes: 'Posto credenciado RM',
                  },
                  {
                    id: '3',
                    raw: null,
                    station: 'Posto Shell Anchieta',
                    liters: '45 L • Arla 32',
                    total: 'R$ 148,50',
                    date: '02/10 • 19:10',
                    hasReceipt: false,
                    receiptUrl: null,
                    notes: null,
                  },
                ].filter((item) => !filterPendingOnly || !item.hasReceipt)
            ).map((fuel) => (
              <View key={fuel.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.stationName}>{fuel.station}</Text>
                  <Text style={styles.totalPrice}>{fuel.total}</Text>
                </View>

                <Text style={styles.fuelDetails}>{fuel.liters}</Text>

                <View style={styles.cardFooter}>
                  <Text style={styles.dateText}>{fuel.date}</Text>
                  
                  {fuel.hasReceipt ? (
                    <TouchableOpacity
                      style={styles.viewReceiptBtn}
                      onPress={() => handleOpenViewModal(fuel.raw || fuel)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="eye-outline" size={13} color="#34D399" />
                      <Text style={styles.viewReceiptBtnText}>Ver Cupom</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={styles.attachReceiptBtn}
                      onPress={() => handleOpenAttachModal(fuel.raw || fuel)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="camera-outline" size={13} color="#080B0C" />
                      <Text style={styles.attachReceiptBtnText}>Anexar Cupom</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))}
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
              <View>
                <Text style={styles.receiptModalTitle}>Comprovante Fiscal</Text>
                <Text style={styles.receiptModalSubtitle}>
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
              <View style={styles.receiptImageBox}>
                {selectedFuel?.receiptUrl ? (
                  <Image
                    source={{ uri: selectedFuel.receiptUrl }}
                    style={styles.receiptFullImage}
                    resizeMode="contain"
                  />
                ) : (
                  <View style={styles.receiptPlaceholderBox}>
                    <Ionicons name="document-text-outline" size={48} color="#8E9DA8" />
                    <Text style={styles.receiptPlaceholderText}>Comprovante digital anexado</Text>
                  </View>
                )}
              </View>

              <View style={styles.receiptInfoGrid}>
                <View style={styles.receiptInfoRow}>
                  <Text style={styles.receiptInfoLabel}>Total Pago:</Text>
                  <Text style={styles.receiptInfoValueHighlight}>
                    {selectedFuel?.total || `R$ ${selectedFuel?.totalCost?.toFixed(2).replace('.', ',') || '0,00'}`}
                  </Text>
                </View>

                <View style={styles.receiptInfoRow}>
                  <Text style={styles.receiptInfoLabel}>Volume / Combustível:</Text>
                  <Text style={styles.receiptInfoValue}>
                    {selectedFuel?.liters || `${selectedFuel?.liters} L • ${selectedFuel?.fuelType}`}
                  </Text>
                </View>

                <View style={styles.receiptInfoRow}>
                  <Text style={styles.receiptInfoLabel}>Data do Registro:</Text>
                  <Text style={styles.receiptInfoValue}>
                    {selectedFuel?.date || (selectedFuel?.fueledAt ? new Date(selectedFuel.fueledAt).toLocaleString('pt-BR') : 'Recentemente')}
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

            <TouchableOpacity
              style={styles.receiptModalCloseFullBtn}
              onPress={() => setViewReceiptModalOpen(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.receiptModalCloseFullText}>Fechar Visualização</Text>
            </TouchableOpacity>
          </View>
        </View>
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
});
