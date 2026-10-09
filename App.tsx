import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LoginScreen } from './src/screens/LoginScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { api } from './src/services/api.service';
import { colors } from './src/theme/colors';
import { User } from './src/types/auth';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    async function restoreSession() {
      try {
        const storedUser = await api.getStoredUser();
        if (storedUser) {
          setCurrentUser(storedUser);
          // Atualiza em background sem travar o boot
          api.refresh().catch(() => {});
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
  };

  if (initializing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      {currentUser ? (
        <HomeScreen user={currentUser} onLogout={handleLogout} />
      ) : (
        <LoginScreen onLoginSuccess={setCurrentUser} />
      )}
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
});
