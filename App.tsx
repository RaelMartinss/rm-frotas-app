import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LoginScreen } from './src/screens/LoginScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { FuelScreen } from './src/screens/FuelScreen';
import { TripScreen } from './src/screens/TripScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { api } from './src/services/api.service';
import { colors } from './src/theme/colors';
import { User } from './src/types/auth';

type AppTab = 'home' | 'history' | 'profile';
type ActiveModal = 'fuel' | 'trip' | null;

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [activeTrip, setActiveTrip] = useState<any>(null);

  useEffect(() => {
    async function restoreSession() {
      try {
        const storedUser = await api.getStoredUser();
        if (storedUser) {
          setCurrentUser(storedUser);
          api.refresh().catch(() => {});
          api.getCurrentTrip().then((s) => {
            if (s?.trip) setActiveTrip(s.trip);
          }).catch(() => {});
        }
      } catch {
      } finally {
        setInitializing(false);
      }
    }

    restoreSession();
  }, []);

  const handleLogout = async () => {
    await api.logout();
    setCurrentUser(null);
    setActiveTab('home');
    setActiveModal(null);
  };

  const handleTripStarted = (tripData: any) => {
    setActiveTrip(tripData);
    setActiveModal(null);
    setActiveTab('home');
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
        <LoginScreen onLoginSuccess={setCurrentUser} />
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
            <TripScreen onBack={() => setActiveModal(null)} onTripStarted={handleTripStarted} />
          ) : activeTab === 'history' ? (
            <HistoryScreen />
          ) : activeTab === 'profile' ? (
            <ProfileScreen user={currentUser} onLogout={handleLogout} />
          ) : (
            <HomeScreen
              user={currentUser}
              onLogout={handleLogout}
              onNavigateToFuel={() => setActiveModal('fuel')}
              onNavigateToTrip={() => setActiveModal('trip')}
              onNavigateToHistory={() => setActiveTab('history')}
              onNavigateToProfile={() => setActiveTab('profile')}
              activeTrip={activeTrip}
              onTripCompleted={() => setActiveTrip(null)}
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
              onPress={() => setActiveTab('history')}
              activeOpacity={0.8}
            >
              <View style={styles.historyIconWrapper}>
                <Ionicons
                  name={activeTab === 'history' ? 'time' : 'time-outline'}
                  size={22}
                  color={activeTab === 'history' ? colors.primary : colors.textMuted}
                />
                <View style={styles.badgePending}>
                  <Text style={styles.badgePendingText}>1</Text>
                </View>
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
});
