import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { api } from '../services/api.service';
import { biometricService, BiometricType } from '../services/biometric.service';
import { User } from '../types/auth';

interface LoginScreenProps {
  onLoginSuccess: (user: User) => void;
}

export function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Estados de Biometria
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState<BiometricType>('none');
  const [lastUser, setLastUser] = useState<User | null>(null);

  useEffect(() => {
    async function checkBiometrics() {
      try {
        const available = await biometricService.isAvailable();
        setBiometricAvailable(available);

        if (available) {
          const type = await biometricService.getBiometryType();
          setBiometricType(type);
        }

        const stored = await api.getLastUser();
        if (stored) {
          setLastUser(stored);
          if (stored.email) {
            setEmail(stored.email);
          }
        }
      } catch (err) {
        console.warn('Erro ao inicializar biometria:', err);
      }
    }

    checkBiometrics();
  }, []);

  const handleLogin = async () => {
    if (!email || !password) {
      setErrorMessage('Preencha seu e-mail e senha.');
      return;
    }

    try {
      setLoading(true);
      setErrorMessage(null);
      const auth = await api.login({ email: email.trim(), password });
      // Se houver biometria no aparelho, habilita para o próximo acesso
      if (biometricAvailable) {
        await biometricService.setEnabled(true);
      }
      onLoginSuccess(auth.user);
    } catch (err: any) {
      setErrorMessage(err.message || 'Falha ao autenticar.');
    } finally {
      setLoading(false);
    }
  };

  const handleBiometricAuth = async () => {
    try {
      setBiometricLoading(true);
      setErrorMessage(null);

      const label = biometricType === 'facial' ? 'Face ID' : 'Impressão Digital';
      const success = await biometricService.authenticate(
        `Confirme com ${label} para entrar no RM Frotas`
      );

      if (!success) {
        setBiometricLoading(false);
        return;
      }

      const user = await api.loginWithBiometrics();
      if (user) {
        onLoginSuccess(user);
      } else {
        setErrorMessage(
          'Sessão expirada. Digite sua senha uma vez para revalidar a biometria.'
        );
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao autenticar com biometria.');
    } finally {
      setBiometricLoading(false);
    }
  };

  const biometricTitle =
    biometricType === 'facial' ? 'Face ID' : 'Digital';

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* HEADER / LOGO */}
          <View style={styles.header}>
            <View style={styles.logoBadge}>
              <Text style={styles.logoBadgeText}>RM</Text>
            </View>
            <Text style={styles.headerTitle}>
              RM <Text style={{ color: colors.primary }}>FROTAS</Text>
            </Text>
            <Text style={styles.headerSubtitle}>PORTAL OPERACIONAL</Text>
          </View>

          {/* CARD DE LOGIN CENTRALIZADO */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.accentBar} />
              <View>
                <Text style={styles.cardTitle}>Acesse sua conta</Text>
                <Text style={styles.cardSubtitle}>
                  Entre para gerenciar sua frota com eficiência
                </Text>
              </View>
            </View>

            {errorMessage && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            )}

            {/* BOTÃO DE ACESSO BIOMÉTRICO RÁPIDO SE HOUVER USUÁRIO ANTERIOR */}
            {biometricAvailable && lastUser && (
              <View style={styles.biometricSection}>
                <TouchableOpacity
                  style={styles.biometricButton}
                  onPress={handleBiometricAuth}
                  disabled={biometricLoading || loading}
                  activeOpacity={0.8}
                >
                  <View style={styles.biometricIconBadge}>
                    <Text style={{ fontSize: 20 }}>
                      {biometricType === 'facial' ? '👤' : '👆'}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.biometricTitleText}>
                      Entrar com {biometricTitle}
                    </Text>
                    <Text style={styles.biometricSubText}>
                      Continuar como {lastUser.name || 'Motorista'}
                    </Text>
                  </View>
                  {biometricLoading ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Text style={styles.biometricArrow}>→</Text>
                  )}
                </TouchableOpacity>

                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>ou digite sua senha</Text>
                  <View style={styles.dividerLine} />
                </View>
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.label}>E-mail</Text>
              <TextInput
                style={styles.input}
                placeholder="seu@email.com"
                placeholderTextColor={colors.textDim}
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Senha</Text>
              <View style={styles.passwordContainer}>
                <TextInput
                  style={[styles.input, styles.passwordInput]}
                  placeholder="••••••••••••"
                  placeholderTextColor={colors.textDim}
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.eyeButton}
                >
                  <Text style={styles.eyeText}>
                    {showPassword ? 'Ocultar' : 'Ver'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.loginButton, loading && styles.buttonDisabled]}
                onPress={handleLogin}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator color="#080B0C" size="small" />
                ) : (
                  <Text style={styles.loginButtonText}>Entrar</Text>
                )}
              </TouchableOpacity>

              {/* Botão compacto de biometria ao lado se não houver card rápido */}
              {biometricAvailable && !lastUser && (
                <TouchableOpacity
                  style={styles.biometricQuickIconButton}
                  onPress={handleBiometricAuth}
                  disabled={biometricLoading}
                  activeOpacity={0.8}
                >
                  <Text style={{ fontSize: 22 }}>
                    {biometricType === 'facial' ? '👤' : '👆'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* RODAPÉ */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              RM FROTAS • SUA FROTA, MAIS EFICIENTE
            </Text>
            <Text style={styles.footerVersion}>
              Versão Nativa 1.0.0 {biometricAvailable ? '• Biometria Ativa' : ''}
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 28,
  },
  logoBadge: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  logoBadgeText: {
    color: '#080B0C',
    fontWeight: '900',
    fontSize: 20,
    letterSpacing: 1,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.textPrimary,
    letterSpacing: 3,
  },
  headerSubtitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 2,
    marginTop: 4,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  accentBar: {
    width: 5,
    height: 38,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginRight: 12,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  cardSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 12,
    fontWeight: '500',
  },
  biometricSection: {
    marginBottom: 18,
  },
  biometricButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 107, 0, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 0, 0.3)',
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },
  biometricIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 107, 0, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  biometricTitleText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  biometricSubText: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  biometricArrow: {
    fontSize: 18,
    color: colors.primary,
    fontWeight: '800',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    fontSize: 11,
    color: colors.textDim,
    fontWeight: '600',
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: colors.textPrimary,
    fontSize: 14,
  },
  passwordContainer: {
    position: 'relative',
    justifyContent: 'center',
  },
  passwordInput: {
    paddingRight: 64,
  },
  eyeButton: {
    position: 'absolute',
    right: 14,
    padding: 6,
  },
  eyeText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
  },
  loginButton: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  biometricQuickIconButton: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 0, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  loginButtonText: {
    color: '#080B0C',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  footer: {
    alignItems: 'center',
    marginTop: 28,
    gap: 4,
  },
  footerText: {
    fontSize: 10,
    color: colors.textDim,
    letterSpacing: 1,
    fontWeight: '600',
  },
  footerVersion: {
    fontSize: 10,
    color: colors.textDim,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
});
