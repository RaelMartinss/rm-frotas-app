import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  StatusBar,
  Switch,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { biometricService } from '../services/biometric.service';
import { api } from '../services/api.service';
import { User } from '../types/auth';

interface ProfileScreenProps {
  user: User;
  onLogout: () => void;
}

export function ProfileScreen({ user, onLogout }: ProfileScreenProps) {
  const [biometricsEnabled, setBiometricsEnabled] = useState(true);
  const [hasBiometricHardware, setHasBiometricHardware] = useState(false);

  useEffect(() => {
    biometricService.isAvailable().then(setHasBiometricHardware);
    biometricService.isEnabled().then(setBiometricsEnabled);
  }, []);

  const handleToggleBiometrics = async (val: boolean) => {
    if (val && !hasBiometricHardware) {
      Alert.alert('Indisponível', 'Nenhum leitor biométrico detectado neste aparelho.');
      return;
    }
    await biometricService.setEnabled(val);
    setBiometricsEnabled(val);
  };

  const handleConfirmLogout = () => {
    Alert.alert('Desconectar', 'Deseja realmente sair da sua conta?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: onLogout },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      {/* HEADER */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Meu Perfil</Text>
          <Text style={styles.headerSubtitle}>Dados cadastrais e credenciais</Text>
        </View>

        <TouchableOpacity onPress={handleConfirmLogout} style={styles.logoutButton} activeOpacity={0.7}>
          <Ionicons name="log-out-outline" size={18} color="#F87171" />
          <Text style={styles.logoutText}>Sair</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* AVATAR CARD */}
        <View style={styles.profileCard}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarInitials}>
              {user.name
                ? user.name
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .substring(0, 2)
                    .toUpperCase()
                : 'RM'}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.userName}>{user.name || 'Rael Martins'}</Text>
            <Text style={styles.userRole}>Motorista Operacional</Text>
            <Text style={styles.userEmail}>{user.email || 'raelmotorista@gmail.com'}</Text>
          </View>
        </View>

        {/* CNH STATUS CARD */}
        <View style={styles.sectionCard}>
          <View style={styles.cardHeader}>
            <View style={styles.labelWithIcon}>
              <Ionicons name="card-outline" size={16} color={colors.primary} />
              <Text style={styles.sectionLabel}>CNH & HABILITAÇÃO</Text>
            </View>
            <View style={styles.cnhValidBadge}>
              <Text style={styles.cnhValidText}>REGULAR</Text>
            </View>
          </View>

          <View style={styles.cnhGrid}>
            <View style={styles.cnhItem}>
              <Text style={styles.cnhItemLabel}>CATEGORIA</Text>
              <Text style={styles.cnhItemValue}>E (Carreta/Bitrem)</Text>
            </View>
            <View style={styles.cnhItem}>
              <Text style={styles.cnhItemLabel}>VALIDADE</Text>
              <Text style={styles.cnhItemValue}>18/11/2028</Text>
            </View>
          </View>
        </View>

        {/* VEÍCULO ATRIBUÍDO */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionLabel}>VEÍCULO PADRÃO</Text>
          <View style={styles.vehicleRow}>
            <View style={styles.vehicleIconBadge}>
              <MaterialCommunityIcons name="truck" size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.vehicleTitle}>Scania R450 6x2</Text>
              <Text style={styles.vehicleSubtitle}>Placa ABC-4D88 • Frota Pesada</Text>
            </View>
          </View>
        </View>

        {/* CONFIGURAÇÕES DE SEGURANÇA */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionLabel}>SEGURANÇA & ACESSO</Text>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <View style={styles.settingIconBox}>
                <Ionicons name="finger-print" size={20} color={colors.primary} />
              </View>
              <View>
                <Text style={styles.settingTitle}>Desbloqueio com Biometria</Text>
                <Text style={styles.settingDesc}>Acesso instantâneo por Face ID / Digital</Text>
              </View>
            </View>
            <Switch
              value={biometricsEnabled}
              onValueChange={handleToggleBiometrics}
              trackColor={{ false: '#222A2F', true: colors.primary }}
              thumbColor={biometricsEnabled ? '#FFFFFF' : '#8E9DA8'}
            />
          </View>

          <View style={[styles.settingRow, { borderBottomWidth: 0 }]}>
            <View style={styles.settingInfo}>
              <View style={styles.settingIconBox}>
                <Ionicons name="cloud-offline-outline" size={20} color={colors.primary} />
              </View>
              <View>
                <Text style={styles.settingTitle}>Sincronização Offline</Text>
                <Text style={styles.settingDesc}>Grava abastecimentos sem sinal de 4G</Text>
              </View>
            </View>
            <Switch
              value={true}
              disabled
              trackColor={{ false: '#222A2F', true: '#10B981' }}
              thumbColor="#FFFFFF"
            />
          </View>

          {/* BOTÃO SINCRONIZAR AGORA */}
          <TouchableOpacity
            style={styles.syncNowButton}
            onPress={async () => {
              Alert.alert('Sincronização', 'Verificando fila de pendências locais com o servidor...');
              const res = await api.syncOfflineQueue();
              if (res.synced > 0) {
                Alert.alert('Sucesso', `${res.synced} abastecimento(s) sincronizado(s) com o servidor!`);
              } else {
                Alert.alert('Tudo Atualizado', 'Todos os registros locais já estão sincronizados com a API.');
              }
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="sync-outline" size={16} color={colors.primary} />
            <Text style={styles.syncNowButtonText}>Sincronizar Pendências Agora</Text>
          </TouchableOpacity>
        </View>

        {/* VERSÃO DO APLICATIVO */}
        <View style={styles.versionCard}>
          <Text style={styles.versionText}>RM FROTAS APP • VERSÃO NATIVA 1.0.0</Text>
          <Text style={styles.buildText}>Expo SDK 57 • Dark Industrial System</Text>
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
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  logoutText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F87171',
  },
  scrollContent: {
    padding: 20,
    gap: 16,
    paddingBottom: 40,
  },
  profileCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  avatarCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1.5,
    borderColor: colors.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.primary,
  },
  userName: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  userRole: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '700',
    marginTop: 2,
  },
  userEmail: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  sectionCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 16,
    gap: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  labelWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textMuted,
    letterSpacing: 0.8,
  },
  cnhValidBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.35)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  cnhValidText: {
    color: '#34D399',
    fontSize: 10,
    fontWeight: '800',
  },
  cnhGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  cnhItem: {
    flex: 1,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 12,
  },
  cnhItemLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textDim,
  },
  cnhItemValue: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textPrimary,
    marginTop: 4,
  },
  vehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 12,
    gap: 12,
  },
  vehicleIconBadge: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  vehicleSubtitle: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.04)',
  },
  settingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  settingIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  settingDesc: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 2,
  },
  syncNowButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  syncNowButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.primary,
  },
  versionCard: {
    alignItems: 'center',
    paddingVertical: 14,
    gap: 4,
  },
  versionText: {
    fontSize: 10,
    color: colors.textDim,
    fontWeight: '700',
    letterSpacing: 1,
  },
  buildText: {
    fontSize: 10,
    color: colors.textDim,
  },
});
