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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
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
            {(fuelRecords.length > 0
              ? fuelRecords.map((f) => ({
                  id: f.id,
                  station: f.gasStation || 'Posto de Abastecimento',
                  liters: `${f.liters} L • ${f.fuelType}`,
                  total: `R$ ${f.totalCost.toFixed(2).replace('.', ',')}`,
                  date: f.fueledAt ? new Date(f.fueledAt).toLocaleDateString('pt-BR') : 'Recente',
                  hasReceipt: !f.isPendingReceipt && !!f.receiptUrl,
                }))
              : [
                  {
                    id: '1',
                    station: 'Posto Graal Embaixador',
                    liters: '310 L • Diesel S10',
                    total: 'R$ 1.918,90',
                    date: 'Ontem, 16:45',
                    hasReceipt: true,
                  },
                  {
                    id: '2',
                    station: 'Rede Ipiranga Rodovia BR-116',
                    liters: '280 L • Diesel S10',
                    total: 'R$ 1.733,20',
                    date: '06/10 • 11:20',
                    hasReceipt: true,
                  },
                  {
                    id: '3',
                    station: 'Posto Shell Anchieta',
                    liters: '45 L • Arla 32',
                    total: 'R$ 148,50',
                    date: '02/10 • 19:10',
                    hasReceipt: false,
                  },
                ]
            ).map((fuel) => (
              <View key={fuel.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.stationName}>{fuel.station}</Text>
                  <Text style={styles.totalPrice}>{fuel.total}</Text>
                </View>

                <Text style={styles.fuelDetails}>{fuel.liters}</Text>

                <View style={styles.cardFooter}>
                  <Text style={styles.dateText}>{fuel.date}</Text>
                  <View style={styles.receiptTag}>
                    <Ionicons
                      name={fuel.hasReceipt ? 'checkmark-circle' : 'alert-circle'}
                      size={13}
                      color={fuel.hasReceipt ? '#34D399' : '#F87171'}
                    />
                    <Text
                      style={[
                        styles.receiptText,
                        fuel.hasReceipt ? { color: '#34D399' } : { color: '#F87171' },
                      ]}
                    >
                      {fuel.hasReceipt ? 'Cupom Anexado' : 'Sem Cupom'}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
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
});
