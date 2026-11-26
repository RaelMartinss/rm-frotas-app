import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useKeyboardOffset } from './src/hooks/useKeyboardOffset';
import { LoginScreen } from './src/screens/LoginScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { FuelScreen } from './src/screens/FuelScreen';
import { TripScreen } from './src/screens/TripScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { SOSScreen } from './src/screens/SOSScreen';
import { ChecklistScreen } from './src/screens/ChecklistScreen';
import { RouteScreen } from './src/screens/RouteScreen';
import { api } from './src/services/api.service';
import { biometricService } from './src/services/biometric.service';
import { deviceService } from './src/services/device.service';
import { colors } from './src/theme/colors';
import { User } from './src/types/auth';

type AppTab = 'home' | 'history' | 'profile';
type ActiveModal = 'fuel' | 'trip' | 'sos' | 'checklist' | 'route' | null;

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [activeTrip, setActiveTrip] = useState<any>(null);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [historyInitialPending, setHistoryInitialPending] = useState(false);
  const [firstAccessPass, setFirstAccessPass] = useState('');
  const [firstAccessConfirm, setFirstAccessConfirm] = useState('');
  const [savingFirstAccess, setSavingFirstAccess] = useState(false);
  const keyboardHeight = useKeyboardOffset();

  useEffect(() => {
    api.setOnUnauthorized(() => {
      setCurrentUser(null);
      setActiveTrip(null);
      setActiveModal(null);
      setActiveTab('home');
    });

    async function restoreSession() {
      try {
        const [storedUser, hasRefresh] = await Promise.all([
          api.getStoredUser(),
          api.hasRefreshToken(),
        ]);

        if (storedUser && hasRefresh && storedUser.role === 'DRIVER') {
          const refreshRes = await api.refreshDetailed(4500);
          if (refreshRes.status === 'revoked' || refreshRes.status === 'no_token') {
            await api.logout(true);
            setCurrentUser(null);
            return;
          }

          const activeUser =
            refreshRes.status === 'ok' && refreshRes.data.user
              ? refreshRes.data.user
              : storedUser;

          setCurrentUser(activeUser);
          if (!activeUser.mustChangePassword) {
            api
              .getCurrentTrip()
              .then((s) => {
                if (s?.trip) setActiveTrip(s.trip);
                if (s?.pendingReceiptsCount !== undefined) {
                  setPendingCount(s.pendingReceiptsCount);
                }
              })
              .catch(() => {});
          }
          deviceService.syncDeviceTelemetry().catch(() => {});
        } else if (storedUser) {
          await api.logout(true);
        }
      } catch {
      } finally {
        setInitializing(false);
      }
    }

    restoreSession();

    return () => {
      api.setOnUnauthorized(null);
    };
  }, []);

  const handleLogout = async (clearAll?: boolean) => {
    const bioEnabled = await biometricService.isEnabled();
    const shouldClearAll = clearAll === true || !bioEnabled;
    await api.logout(shouldClearAll);
    setCurrentUser(null);
    setActiveTrip(null);
    setActiveTab('home');
    setActiveModal(null);
  };

  const handleTripStarted = (tripData: any) => {
    setActiveTrip((prev: any) => ({ ...(prev || {}), ...tripData, status: 'IN_PROGRESS' }));
    setActiveModal(null);
    setActiveTab('home');
    api.getCurrentTrip().then((s) => {
      if (s?.trip) setActiveTrip(s.trip);
    }).catch(() => {});
  };

  if (initializing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!currentUser) {
    return (
      <SafeAreaProvider>
        <LoginScreen
          onLoginSuccess={(user) => {
            setCurrentUser(user);
            deviceService.syncDeviceTelemetry(true).catch(() => {});
          }}
        />
      </SafeAreaProvider>
    );
  }

  if (currentUser.mustChangePassword) {
    const handleSaveFirstPassword = async () => {
      if (
        !firstAccessPass ||
        firstAccessPass.length < 8 ||
        !/[A-Za-z]/.test(firstAccessPass) ||
        !/\d/.test(firstAccessPass)
      ) {
        Alert.alert(
          'Senha Fraca',
          'A nova senha deve conter no mínimo 8 caracteres, com pelo menos uma letra e um número.'
        );
        return;
      }
      if (firstAccessPass !== firstAccessConfirm) {
        Alert.alert('Atenção', 'A confirmação da nova senha não confere.');
        return;
      }
      setSavingFirstAccess(true);
      try {
        await api.changeInitialPassword(firstAccessPass);
        setFirstAccessPass('');
        setFirstAccessConfirm('');
        setCurrentUser({ ...currentUser, mustChangePassword: false });
        api
          .getCurrentTrip()
          .then((s) => {
            if (s?.trip) setActiveTrip(s.trip);
            if (s?.pendingReceiptsCount !== undefined) {
              setPendingCount(s.pendingReceiptsCount);
            }
          })
          .catch(() => {});
        Alert.alert('Senha Atualizada', 'Sua nova senha pessoal foi configurada com sucesso!');
      } catch (err: any) {
        Alert.alert('Erro', err.message || 'Não foi possível redefinir sua senha.');
      } finally {
        setSavingFirstAccess(false);
      }
    };

    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.firstAccessSafe}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ flex: 1 }}
          >
            <ScrollView
              contentContainerStyle={[
                styles.firstAccessWrap,
                keyboardHeight > 0 && {
                  justifyContent: 'flex-start',
                  paddingTop: 20,
                  paddingBottom: Platform.OS === 'android' ? keyboardHeight + 32 : 24,
                },
              ]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.firstAccessCard}>
                <View style={styles.firstAccessIconBox}>
                  <Ionicons name="key-outline" size={26} color={colors.primary} />
                </View>
                <Text style={styles.firstAccessTitle}>Defina sua Nova Senha</Text>
                <Text style={styles.firstAccessSubtitle}>
                  Este é o seu primeiro acesso com uma senha temporária. Por segurança, crie uma senha pessoal de no mínimo 8 caracteres, com letras e números, para continuar.
                </Text>

                <Text style={styles.firstAccessLabel}>Nova senha</Text>
                <TextInput
                  style={styles.firstAccessInput}
                  placeholder="Mín. 8 caracteres (letras e números)"
                  placeholderTextColor={colors.textDim}
                  secureTextEntry
                  value={firstAccessPass}
                  onChangeText={setFirstAccessPass}
                />

                <Text style={styles.firstAccessLabel}>Confirmar nova senha</Text>
                <TextInput
                  style={styles.firstAccessInput}
                  placeholder="Repita a nova senha"
                  placeholderTextColor={colors.textDim}
                  secureTextEntry
                  returnKeyType="done"
                  onSubmitEditing={handleSaveFirstPassword}
                  value={firstAccessConfirm}
                  onChangeText={setFirstAccessConfirm}
                />

                <TouchableOpacity
                  style={[styles.firstAccessPrimaryBtn, savingFirstAccess && { opacity: 0.7 }]}
                  onPress={handleSaveFirstPassword}
                  disabled={savingFirstAccess}
                  activeOpacity={0.85}
                >
                  {savingFirstAccess ? (
                    <ActivityIndicator size="small" color="#080B0C" />
                  ) : (
                    <Text style={styles.firstAccessPrimaryText}>Salvar e Acessar o App</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.firstAccessLogoutBtn}
                  onPress={() => handleLogout(true)}
                  disabled={savingFirstAccess}
                >
                  <Text style={styles.firstAccessLogoutText}>Sair da conta</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <View style={styles.appContainer}>
        {/* CORPO DA TELA CONFORME ABA / MODAL ATIVO */}
        <View style={styles.screenBody}>
          {activeModal === 'fuel' ? (
            <FuelScreen
              onBack={() => setActiveModal(null)}
              onSuccess={() => {
                setActiveModal(null);
                api.getCurrentTrip().then((s) => {
                  if (s?.trip) setActiveTrip(s.trip);
                }).catch(() => {});
              }}
              defaultVehicle={activeTrip?.vehicle}
            />
          ) : activeModal === 'trip' ? (
            <TripScreen
              onBack={() => setActiveModal(null)}
              onTripStarted={handleTripStarted}
              trip={activeTrip}
              defaultVehicle={activeTrip?.vehicle}
            />
          ) : activeModal === 'sos' ? (
            <SOSScreen
              onBack={() => setActiveModal(null)}
              onSuccess={() => {
                api.getCurrentTrip().then((s) => {
                  if (s?.trip) setActiveTrip(s.trip);
                }).catch(() => {});
              }}
              activeTrip={activeTrip}
            />
          ) : activeModal === 'checklist' ? (
            <ChecklistScreen
              onBack={() => setActiveModal(null)}
              onSuccess={() => {
                api.getCurrentTrip().then((s) => {
                  if (s?.trip) setActiveTrip(s.trip);
                }).catch(() => {});
              }}
              activeTrip={activeTrip}
            />
          ) : activeModal === 'route' ? (
            <RouteScreen
              onBack={() => setActiveModal(null)}
              activeTrip={activeTrip}
            />
          ) : activeTab === 'history' ? (
            <HistoryScreen
              initialTab={historyInitialPending ? 'fuel' : 'trips'}
              initialFilterPendingOnly={historyInitialPending}
            />
          ) : activeTab === 'profile' ? (
            <ProfileScreen
              user={currentUser}
              onLogout={(clearAll) => handleLogout(clearAll)}
              onNavigateToHistory={() => {
                setHistoryInitialPending(false);
                setActiveTab('history');
              }}
            />
          ) : (
            <HomeScreen
              user={currentUser}
              onLogout={() => handleLogout()}
              onNavigateToFuel={() => setActiveModal('fuel')}
              onNavigateToTrip={() => setActiveModal('trip')}
              onNavigateToHistory={() => {
                setHistoryInitialPending(true);
                setActiveTab('history');
              }}
              onNavigateToProfile={() => setActiveTab('profile')}
              onNavigateToSOS={() => setActiveModal('sos')}
              onNavigateToChecklist={() => setActiveModal('checklist')}
              onNavigateToRoute={() => setActiveModal('route')}
              activeTrip={activeTrip}
              onTripCompleted={() => {
                setActiveTrip(null);
                api.getCurrentTrip().then((s) => {
                  setActiveTrip(s?.trip || null);
                }).catch(() => {});
              }}
            />
          )}
        </View>

        {/* BOTTOM NAVIGATION BAR (SÓ APARECE QUANDO NÃO ESTIVER EM MODAL FULLSCREEN) */}
        {!activeModal && (
          <View style={styles.bottomNav}>
            {/* 1. INÍCIO */}
            <TouchableOpacity
              style={styles.navItem}
              onPress={() => setActiveTab('home')}
              activeOpacity={0.8}
            >
              <Ionicons
                name={activeTab === 'home' ? 'home' : 'home-outline'}
                size={22}
                color={activeTab === 'home' ? colors.primary : colors.textMuted}
              />
              <Text style={[styles.navLabel, activeTab === 'home' && styles.navLabelActive]}>
                Início
              </Text>
              <View
                style={[
                  styles.navIndicator,
                  activeTab === 'home' && styles.navIndicatorActive,
                ]}
              />
            </TouchableOpacity>

            {/* 2. HISTÓRICO */}
            <TouchableOpacity
              style={styles.navItem}
              onPress={() => {
                setHistoryInitialPending(false);
                setActiveTab('history');
              }}
              activeOpacity={0.8}
            >
              <View style={styles.historyIconWrapper}>
                <Ionicons
                  name={activeTab === 'history' ? 'time' : 'time-outline'}
                  size={22}
                  color={activeTab === 'history' ? colors.primary : colors.textMuted}
                />
                {pendingCount > 0 && (
                  <View style={styles.badgePending}>
                    <Text style={styles.badgePendingText}>{pendingCount}</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.navLabel, activeTab === 'history' && styles.navLabelActive]}>
                Histórico
              </Text>
              <View
                style={[
                  styles.navIndicator,
                  activeTab === 'history' && styles.navIndicatorActive,
                ]}
              />
            </TouchableOpacity>

            {/* 3. PERFIL */}
            <TouchableOpacity
              style={styles.navItem}
              onPress={() => setActiveTab('profile')}
              activeOpacity={0.8}
            >
              <Ionicons
                name={activeTab === 'profile' ? 'person' : 'person-outline'}
                size={22}
                color={activeTab === 'profile' ? colors.primary : colors.textMuted}
              />
              <Text style={[styles.navLabel, activeTab === 'profile' && styles.navLabelActive]}>
                Perfil
              </Text>
              <View
                style={[
                  styles.navIndicator,
                  activeTab === 'profile' && styles.navIndicatorActive,
                ]}
              />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  screenBody: {
    flex: 1,
  },
  bottomNav: {
    flexDirection: 'row',
    height: 64,
    backgroundColor: '#0F1215',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingTop: 6,
    position: 'relative',
  },
  historyIconWrapper: {
    position: 'relative',
  },
  badgePending: {
    position: 'absolute',
    top: -4,
    right: -8,
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderWidth: 1,
    borderColor: '#0F1215',
  },
  badgePendingText: {
    color: '#080B0C',
    fontSize: 9,
    fontWeight: '900',
  },
  navLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
  },
  navLabelActive: {
    color: colors.primary,
    fontWeight: '800',
  },
  navIndicator: {
    width: 28,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: 'transparent',
    marginTop: 2,
  },
  navIndicatorActive: {
    backgroundColor: colors.primary,
  },
  firstAccessSafe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  firstAccessWrap: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  firstAccessCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 24,
  },
  firstAccessIconBox: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  firstAccessTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 6,
  },
  firstAccessSubtitle: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
    marginBottom: 20,
  },
  firstAccessLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 6,
  },
  firstAccessInput: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: colors.textPrimary,
    fontSize: 14,
    marginBottom: 14,
  },
  firstAccessPrimaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  firstAccessPrimaryText: {
    color: '#080B0C',
    fontSize: 14,
    fontWeight: '900',
  },
  firstAccessLogoutBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 8,
  },
  firstAccessLogoutText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
});
