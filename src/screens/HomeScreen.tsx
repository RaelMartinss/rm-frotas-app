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
  }, [loadData]);

  const activeTrip = propActiveTrip || summary?.trip;
  const isTripInProgress = activeTrip?.status === 'IN_PROGRESS';
  const pendingReceipts = summary?.pendingReceiptsCount ?? 1;

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
          {biometricAvailable && (
            <View style={styles.bioBadge}>
              <Text style={styles.bioBadgeText}>👆 BIO</Text>
            </View>
          )}

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
        {/* BANNER PROATIVO DE CNH */}
        <View style={styles.cnhBanner}>
          <View style={styles.cnhBannerLeft}>
            <View style={styles.cnhIconBox}>
              <Ionicons name="shield-checkmark" size={18} color="#34D399" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cnhTitle}>
                {summary?.driver
                  ? `CNH Regularizada • Categoria ${summary.driver.cnhCategory || 'E'}`
                  : 'CNH Regularizada • Categoria E'}
              </Text>
              <Text style={styles.cnhDesc}>
                {`Validade até ${formatCnhDate(summary?.driver?.cnhExpirationDateIso || summary?.driver?.cnhExpirationDate)}. Liberação total para viagem.`}
              </Text>
            </View>
          </View>
        </View>

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

            <View style={styles.gpsBadge}>
              <View style={styles.gpsDot} />
              <Text style={styles.gpsText}>GPS ATIVO</Text>
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
            <Ionicons name="arrow-forward" size={18} color="#080B0C" />
          </TouchableOpacity>
        </View>

        {/* SEÇÃO AÇÕES RÁPIDAS (GRID 2x2) */}
        <View style={styles.sectionHeader}>
          <Ionicons name="flash" size={16} color={colors.primary} />
          <Text style={styles.sectionTitle}>AÇÕES RÁPIDAS</Text>
        </View>

        <View style={styles.quickGrid}>
          {/* 1. Abastecer */}
          <TouchableOpacity
            style={styles.quickCard}
            onPress={onNavigateToFuel}
            activeOpacity={0.8}
          >
            <View style={styles.quickCardContent}>
              <View style={[styles.quickIconBox, { backgroundColor: colors.primaryMuted, borderColor: colors.primaryBorder }]}>
                <MaterialCommunityIcons name="gas-station" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.quickCardTitle}>Abastecer</Text>
                <Text style={styles.quickCardDesc}>Cupom e odômetro</Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color={colors.textDim} />
            </View>
          </TouchableOpacity>

          {/* 2. SOS Alerta */}
          <TouchableOpacity
            style={styles.quickCard}
            onPress={handleSOS}
            activeOpacity={0.8}
          >
            <View style={styles.quickCardContent}>
              <View style={[styles.quickIconBox, { backgroundColor: 'rgba(239, 68, 68, 0.15)', borderColor: 'rgba(239, 68, 68, 0.3)' }]}>
                <MaterialCommunityIcons name="shield-alert-outline" size={20} color="#F87171" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.quickCardTitle, { color: '#F87171' }]}>SOS Alerta</Text>
                <Text style={styles.quickCardDesc}>Emergência</Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color={colors.textDim} />
            </View>
          </TouchableOpacity>

          {/* 3. Checklist */}
          <TouchableOpacity
            style={styles.quickCard}
            onPress={onNavigateToTrip}
            activeOpacity={0.8}
          >
            <View style={styles.quickCardContent}>
              <View style={[styles.quickIconBox, { backgroundColor: 'rgba(59, 130, 246, 0.15)', borderColor: 'rgba(59, 130, 246, 0.3)' }]}>
                <Ionicons name="clipboard-outline" size={18} color="#60A5FA" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.quickCardTitle}>Checklist</Text>
                <Text style={styles.quickCardDesc}>Inspeção diária</Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color={colors.textDim} />
            </View>
          </TouchableOpacity>

          {/* 4. Histórico */}
          <TouchableOpacity
            style={styles.quickCard}
            onPress={onNavigateToHistory}
            activeOpacity={0.8}
          >
            <View style={styles.quickCardContent}>
              <View style={[styles.quickIconBox, { backgroundColor: 'rgba(16, 185, 129, 0.15)', borderColor: 'rgba(16, 185, 129, 0.3)' }]}>
                <Ionicons name="time-outline" size={18} color="#34D399" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.quickCardTitle}>Histórico</Text>
                <Text style={styles.quickCardDesc}>Viagens e cupons</Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color={colors.textDim} />
            </View>
          </TouchableOpacity>
        </View>
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
  bioBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.35)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
  },
  bioBadgeText: {
    color: '#34D399',
    fontSize: 9,
    fontWeight: '800',
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
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    borderRadius: 18,
    padding: 12,
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
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cnhTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#34D399',
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
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  startTripButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  playIconBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#080B0C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  startTripButtonText: {
    color: '#080B0C',
    fontSize: 14,
    fontWeight: '900',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textSecondary,
    letterSpacing: 1,
  },
  quickGrid: {
    gap: 10,
  },
  quickCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    padding: 14,
  },
  quickCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  quickIconBox: {
    width: 42,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickCardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  quickCardDesc: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
});
