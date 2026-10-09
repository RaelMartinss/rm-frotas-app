import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { User } from '../types/auth';

interface HomeScreenProps {
  user: User;
  onLogout: () => void;
}

export function HomeScreen({ user, onLogout }: HomeScreenProps) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <ScrollView contentContainerStyle={styles.container}>
        {/* HEADER DO COCKPIT */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Olá, motorista</Text>
            <Text style={styles.driverName}>{user.name || 'Motorista'}</Text>
          </View>
          <TouchableOpacity onPress={onLogout} style={styles.logoutButton}>
            <Text style={styles.logoutText}>Sair</Text>
          </TouchableOpacity>
        </View>

        {/* CARD PRINCIPAL DA VIAGEM */}
        <View style={styles.tripCard}>
          <View style={styles.tripBadge}>
            <View style={styles.badgeDot} />
            <Text style={styles.badgeText}>EM ESPERA</Text>
          </View>
          <Text style={styles.tripTitle}>Pronto para rodar?</Text>
          <Text style={styles.tripSubtitle}>
            Selecione o veículo e inicie sua jornada com validação de odômetro.
          </Text>

          <TouchableOpacity style={styles.startTripButton} activeOpacity={0.85}>
            <Text style={styles.startTripButtonText}>Iniciar Viagem</Text>
          </TouchableOpacity>
        </View>

        {/* AÇÕES RÁPIDAS OPERACIONAIS */}
        <Text style={styles.sectionTitle}>AÇÕES RÁPIDAS</Text>
        <View style={styles.quickGrid}>
          <TouchableOpacity style={styles.quickCard} activeOpacity={0.8}>
            <View style={[styles.quickIconBox, { backgroundColor: 'rgba(255, 107, 0, 0.15)' }]}>
              <Text style={{ fontSize: 20 }}>⛽</Text>
            </View>
            <Text style={styles.quickCardTitle}>Abastecer</Text>
            <Text style={styles.quickCardDesc}>Registrar cupom</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.quickCard} activeOpacity={0.8}>
            <View style={[styles.quickIconBox, { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}>
              <Text style={{ fontSize: 20 }}>🚨</Text>
            </View>
            <Text style={[styles.quickCardTitle, { color: '#F87171' }]}>SOS Alerta</Text>
            <Text style={styles.quickCardDesc}>Emergência</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.quickCard} activeOpacity={0.8}>
            <View style={[styles.quickIconBox, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
              <Text style={{ fontSize: 20 }}>📋</Text>
            </View>
            <Text style={styles.quickCardTitle}>Checklist</Text>
            <Text style={styles.quickCardDesc}>Inspeção diária</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.quickCard} activeOpacity={0.8}>
            <View style={[styles.quickIconBox, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
              <Text style={{ fontSize: 20 }}>📄</Text>
            </View>
            <Text style={styles.quickCardTitle}>Documentos</Text>
            <Text style={styles.quickCardDesc}>CNH e CRLV</Text>
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
  container: {
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  greeting: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  driverName: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.textPrimary,
    marginTop: 2,
  },
  logoutButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 48,
  },
  logoutText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  tripCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 28,
  },
  tripBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 107, 0, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 0, 0.3)',
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
    fontWeight: '800',
    letterSpacing: 1,
  },
  tripTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 6,
  },
  tripSubtitle: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
    marginBottom: 20,
  },
  startTripButton: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  startTripButtonText: {
    color: '#080B0C',
    fontSize: 15,
    fontWeight: '800',
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textDim,
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  quickCard: {
    width: '48%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    padding: 16,
  },
  quickIconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  quickCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  quickCardDesc: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
});
