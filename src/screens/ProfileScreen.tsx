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
  Image,
  Modal,
  TextInput,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { colors } from '../theme/colors';
import { biometricService } from '../services/biometric.service';
import { api } from '../services/api.service';
import { storage } from '../services/storage.service';
import { appUpdateService, CURRENT_APP_VERSION, UpdateDownloadState } from '../services/app-update.service';
import { User } from '../types/auth';

interface ProfileScreenProps {
  user: User;
  onLogout: () => void;
}

export function ProfileScreen({ user, onLogout }: ProfileScreenProps) {
  const [profileUser, setProfileUser] = useState<User>(user);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [phone, setPhone] = useState('(91) 98123-4567');
  const [biometricsEnabled, setBiometricsEnabled] = useState(true);
  const [hasBiometricHardware, setHasBiometricHardware] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updatingPhoto, setUpdatingPhoto] = useState(false);
  const [downloadState, setDownloadState] = useState<UpdateDownloadState>({
    isDownloading: false,
    progress: 0,
    error: null,
    completed: false,
  });

  // Modais de Edição
  const [editProfileModalOpen, setEditProfileModalOpen] = useState(false);
  const [editName, setEditName] = useState(user.name || '');
  const [editPhone, setEditPhone] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // Modal Alterar Senha
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    biometricService.isAvailable().then(setHasBiometricHardware);
    biometricService.isEnabled().then(setBiometricsEnabled);

    const unsubUpdate = appUpdateService.subscribe((st) => {
      setDownloadState(st);
    });

    // Carrega dados e foto do storage local ou API
    storage.getItem(`rm_driver_phone_${user.id}`).then((p) => {
      if (p) setPhone(p);
    });
    storage.getItem('rm_driver_photo').then((cached) => {
      if (cached) setPhotoUrl(cached);
    });

    api.getCurrentTrip().then((sum) => {
      if (sum?.driver?.photoUrl) {
        setPhotoUrl(sum.driver.photoUrl);
        storage.setItem('rm_driver_photo', sum.driver.photoUrl);
      }
    }).catch(() => {});

    return () => {
      unsubUpdate();
    };
  }, [user.id]);

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

  // --- FOTO DE PERFIL ---
  const handleSelectPhoto = () => {
    Alert.alert('Foto de Perfil', 'Escolha como deseja atualizar sua foto:', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Câmera',
        onPress: () => capturePhoto('camera'),
      },
      {
        text: 'Galeria de Fotos',
        onPress: () => capturePhoto('gallery'),
      },
      ...(photoUrl
        ? [
            {
              text: 'Remover Foto',
              style: 'destructive' as const,
              onPress: removePhoto,
            },
          ]
        : []),
    ]);
  };

  const capturePhoto = async (mode: 'camera' | 'gallery') => {
    try {
      if (mode === 'camera') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permissão necessária', 'Precisamos de acesso à câmera para fotografar seu perfil.');
          return;
        }
      }

      const pickerFn =
        mode === 'camera'
          ? ImagePicker.launchCameraAsync
          : ImagePicker.launchImageLibraryAsync;

      const result = await pickerFn({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const base64Uri = asset.base64
          ? `data:image/jpeg;base64,${asset.base64}`
          : asset.uri;

        setUpdatingPhoto(true);
        try {
          await api.updateProfilePhoto(base64Uri);
          setPhotoUrl(base64Uri);
          await storage.setItem('rm_driver_photo', base64Uri);
          Alert.alert('Sucesso', 'Foto de perfil atualizada com sucesso!');
        } catch (err: any) {
          Alert.alert('Erro', err.message || 'Não foi possível salvar a foto no servidor.');
        } finally {
          setUpdatingPhoto(false);
        }
      }
    } catch {
      Alert.alert('Erro', 'Não foi possível processar a imagem.');
    }
  };

  const removePhoto = async () => {
    setUpdatingPhoto(true);
    try {
      await api.updateProfilePhoto(null);
      setPhotoUrl(null);
      await storage.removeItem('rm_driver_photo');
      Alert.alert('Sucesso', 'Foto de perfil removida.');
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Falha ao remover foto.');
    } finally {
      setUpdatingPhoto(false);
    }
  };

  // --- DADOS PESSOAIS ---
  const handleOpenEditProfile = () => {
    setEditName(profileUser.name || '');
    setEditPhone(phone);
    setEditProfileModalOpen(true);
  };

  const handleSaveProfile = async () => {
    if (!editName.trim()) {
      Alert.alert('Atenção', 'Informe seu nome completo.');
      return;
    }

    setSavingProfile(true);
    try {
      const updated = await api.updateProfile(editName.trim());
      setProfileUser((prev) => ({ ...prev, name: updated.name }));

      if (editPhone.trim()) {
        await storage.setItem(`rm_driver_phone_${user.id}`, editPhone.trim());
        setPhone(editPhone.trim());
      }

      setEditProfileModalOpen(false);
      Alert.alert('Sucesso', 'Dados do perfil atualizados com sucesso!');
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Não foi possível atualizar o perfil.');
    } finally {
      setSavingProfile(false);
    }
  };

  // --- ALTERAR SENHA ---
  const handleOpenChangePassword = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordModalOpen(true);
  };

  const handleSavePassword = async () => {
    if (!currentPassword) {
      Alert.alert('Atenção', 'Informe sua senha atual.');
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      Alert.alert('Atenção', 'A nova senha deve possuir pelo menos 6 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Atenção', 'A confirmação de senha não confere com a nova senha.');
      return;
    }

    setChangingPassword(true);
    try {
      const res = await api.changePassword(currentPassword, newPassword);
      setPasswordModalOpen(false);
      Alert.alert('Senha Alterada', res.message || 'Sua nova senha foi salva com sucesso!');
    } catch (err: any) {
      Alert.alert('Erro ao Alterar Senha', err.message || 'Verifique a senha atual informada.');
    } finally {
      setChangingPassword(false);
    }
  };

  // --- CANAL DE SUPORTE 0800 & WHATSAPP ---
  const handleCallCentral = () => {
    Linking.openURL('tel:08007637682').catch(() => {
      Alert.alert('Telefone da Central', 'Ligue para: 0800 763 7682');
    });
  };

  const handleWhatsAppSupport = () => {
    const text = encodeURIComponent(`Olá, sou o motorista ${profileUser.name} e preciso de apoio operacional.`);
    Linking.openURL(`https://wa.me/5591981234567?text=${text}`).catch(() => {
      Alert.alert('WhatsApp', 'Número de apoio: (91) 98123-4567');
    });
  };

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    try {
      const res = await appUpdateService.checkForUpdates();
      if (res.hasUpdate) {
        Alert.alert(
          `Nova Versão v${res.latestVersion} Disponível!`,
          `Sua versão atual é v${res.currentVersion}.\n\nNotas da versão:\n${res.releaseNotes}\n\nDeseja baixar a atualização agora?`,
          [
            { text: 'Mais tarde', style: 'cancel' },
            {
              text: 'Atualizar Agora',
              onPress: () => appUpdateService.downloadAndInstall(res.downloadUrl),
            },
          ]
        );
      } else {
        Alert.alert(
          'Aplicativo Atualizado',
          `Você já está utilizando a versão mais recente homologada (v${res.currentVersion}).`
        );
      }
    } catch {
      Alert.alert('Erro', 'Não foi possível verificar atualizações no momento.');
    } finally {
      setCheckingUpdate(false);
    }
  };

  const driverInitials = profileUser.name
    ? profileUser.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .substring(0, 2)
        .toUpperCase()
    : 'RM';

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

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* AVATAR CARD */}
        <View style={styles.profileCard}>
          <TouchableOpacity
            style={styles.avatarTouchable}
            onPress={handleSelectPhoto}
            activeOpacity={0.8}
            disabled={updatingPhoto}
          >
            {updatingPhoto ? (
              <View style={styles.avatarCircle}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : photoUrl ? (
              <Image source={{ uri: photoUrl }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarInitials}>{driverInitials}</Text>
              </View>
            )}
            <View style={styles.cameraPill}>
              <Ionicons name="camera" size={13} color="#FFFFFF" />
            </View>
          </TouchableOpacity>

          <View style={{ flex: 1 }}>
            <View style={styles.nameRow}>
              <Text style={styles.userName} numberOfLines={1}>
                {profileUser.name || 'Rael Martins'}
              </Text>
              <TouchableOpacity onPress={handleOpenEditProfile} activeOpacity={0.7}>
                <Ionicons name="pencil" size={16} color={colors.primary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.userRole}>Motorista Operacional</Text>
            <Text style={styles.userEmail}>{profileUser.email || 'raelmotorista@gmail.com'}</Text>
            <Text style={styles.userPhone}>{phone}</Text>
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

        {/* SEGURANÇA & ACESSO */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionLabel}>SEGURANÇA & ACESSO</Text>

          {/* Trocar Senha */}
          <TouchableOpacity
            style={styles.settingRow}
            onPress={handleOpenChangePassword}
            activeOpacity={0.7}
          >
            <View style={styles.settingInfo}>
              <View style={styles.settingIconBox}>
                <Ionicons name="key-outline" size={18} color={colors.primary} />
              </View>
              <View>
                <Text style={styles.settingTitle}>Alterar Senha de Acesso</Text>
                <Text style={styles.settingDesc}>Atualize suas credenciais com segurança</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#64748B" />
          </TouchableOpacity>

          {/* Desbloqueio Biometria */}
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

          {/* Sincronização Offline */}
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

          {/* Sincronizar Agora */}
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

        {/* CENTRAL DE SUPORTE & APOIO AO MOTORISTA */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionLabel}>CENTRAL DE APOIO OPERACIONAL</Text>
          <Text style={styles.updateCardDesc}>
            Canais diretos de atendimento 24h para socorro, dúvidas ou autorizações na rota:
          </Text>

          <View style={styles.supportButtonsRow}>
            <TouchableOpacity style={styles.callSupportBtn} onPress={handleCallCentral} activeOpacity={0.8}>
              <MaterialCommunityIcons name="phone" size={18} color="#FFFFFF" />
              <Text style={styles.callSupportText}>Ligar 0800</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.whatsappSupportBtn} onPress={handleWhatsAppSupport} activeOpacity={0.8}>
              <MaterialCommunityIcons name="whatsapp" size={18} color="#FFFFFF" />
              <Text style={styles.whatsappSupportText}>WhatsApp</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ATUALIZAÇÕES DO APLICATIVO */}
        <View style={styles.sectionCard}>
          <View style={styles.cardHeader}>
            <View style={styles.labelWithIcon}>
              <Ionicons name="cloud-download-outline" size={16} color={colors.primary} />
              <Text style={styles.sectionLabel}>ATUALIZAÇÕES DO APLICATIVO</Text>
            </View>
            <View style={styles.versionBadge}>
              <Text style={styles.versionBadgeText}>v{CURRENT_APP_VERSION}</Text>
            </View>
          </View>

          <Text style={styles.updateCardDesc}>
            Mantenha seu aplicativo na versão mais recente homologada para ter acesso a melhorias contínuas, novos recursos e máxima estabilidade.
          </Text>

          <TouchableOpacity
            style={styles.checkUpdateButton}
            onPress={handleCheckUpdate}
            disabled={checkingUpdate}
            activeOpacity={0.8}
          >
            <Ionicons
              name={checkingUpdate ? 'hourglass-outline' : 'refresh-circle-outline'}
              size={18}
              color="#080B0C"
            />
            <Text style={styles.checkUpdateButtonText}>
              {checkingUpdate ? 'Consultando Servidor...' : 'Verificar Novas Atualizações'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* RODAPÉ DO APLICATIVO */}
        <View style={styles.versionCard}>
          <Text style={styles.versionText}>RM Frotas • Portal do Motorista v{CURRENT_APP_VERSION}</Text>
          <Text style={styles.versionSubtext}>Build Nativo Expo & Android SDK 35</Text>
        </View>
      </ScrollView>

      {/* MODAL: EDITAR DADOS PESSOAIS */}
      <Modal visible={editProfileModalOpen} transparent animationType="fade" onRequestClose={() => setEditProfileModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Editar Dados Pessoais</Text>

            <Text style={styles.inputLabel}>NOME COMPLETO</Text>
            <TextInput
              style={styles.inputField}
              value={editName}
              onChangeText={setEditName}
              placeholder="Seu nome completo"
              placeholderTextColor="#64748B"
            />

            <Text style={styles.inputLabel}>TELEFONE / WHATSAPP</Text>
            <TextInput
              style={styles.inputField}
              value={editPhone}
              onChangeText={setEditPhone}
              placeholder="(00) 00000-0000"
              placeholderTextColor="#64748B"
              keyboardType="phone-pad"
            />

            <View style={styles.modalButtonsRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setEditProfileModalOpen(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalSaveBtn}
                onPress={handleSaveProfile}
                disabled={savingProfile}
                activeOpacity={0.8}
              >
                {savingProfile ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalSaveText}>Salvar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL: ALTERAR SENHA */}
      <Modal visible={passwordModalOpen} transparent animationType="fade" onRequestClose={() => setPasswordModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Alterar Senha de Acesso</Text>

            <Text style={styles.inputLabel}>SENHA ATUAL</Text>
            <TextInput
              style={styles.inputField}
              value={currentPassword}
              onChangeText={setCurrentPassword}
              placeholder="Digite sua senha atual"
              placeholderTextColor="#64748B"
              secureTextEntry={!showPassword}
            />

            <Text style={styles.inputLabel}>NOVA SENHA (MÍNIMO 6 CARACTERES)</Text>
            <TextInput
              style={styles.inputField}
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="Digite a nova senha"
              placeholderTextColor="#64748B"
              secureTextEntry={!showPassword}
            />

            <Text style={styles.inputLabel}>CONFIRMAR NOVA SENHA</Text>
            <TextInput
              style={styles.inputField}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Confirme a nova senha"
              placeholderTextColor="#64748B"
              secureTextEntry={!showPassword}
            />

            <TouchableOpacity
              style={styles.showPassRow}
              onPress={() => setShowPassword(!showPassword)}
              activeOpacity={0.7}
            >
              <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={16} color={colors.primary} />
              <Text style={styles.showPassText}>{showPassword ? 'Ocultar senhas' : 'Exibir senhas'}</Text>
            </TouchableOpacity>

            <View style={styles.modalButtonsRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setPasswordModalOpen(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalSaveBtn}
                onPress={handleSavePassword}
                disabled={changingPassword}
                activeOpacity={0.8}
              >
                {changingPassword ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalSaveText}>Alterar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL DE DOWNLOAD DA ATUALIZAÇÃO NATIVA */}
      <Modal
        visible={downloadState.isDownloading}
        transparent
        animationType="fade"
      >
        <View style={styles.downloadModalBackdrop}>
          <View style={styles.downloadModalCard}>
            <View style={styles.downloadModalIconBox}>
              <Ionicons name="cloud-download" size={32} color="#FF7A00" />
            </View>
            <Text style={styles.downloadModalTitle}>Baixando Atualização...</Text>
            <Text style={styles.downloadModalSubtitle}>
              Atualizando o RM Frotas no dispositivo
            </Text>

            <View style={styles.downloadProgressRow}>
              <Text style={styles.downloadProgressLabel}>Progresso do download</Text>
              <Text style={styles.downloadProgressValue}>{downloadState.progress}%</Text>
            </View>

            <View style={styles.downloadProgressBarTrack}>
              <View style={[styles.downloadProgressBarFill, { width: `${downloadState.progress}%` }]} />
            </View>

            <Text style={styles.downloadModalHint}>
              O instalador nativo abrirá automaticamente na tela ao concluir o download.
            </Text>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
  },
  logoutText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F87171',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
    gap: 16,
  },
  profileCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatarTouchable: {
    position: 'relative',
  },
  avatarCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primaryMuted,
    borderWidth: 2,
    borderColor: colors.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  avatarInitials: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.primary,
  },
  cameraPill: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  userName: {
    fontSize: 17,
    fontWeight: '900',
    color: colors.textPrimary,
    flex: 1,
  },
  userRole: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '700',
    marginTop: 2,
  },
  userEmail: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  userPhone: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  sectionCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  labelWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },
  cnhValidBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  cnhValidText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#10B981',
  },
  cnhGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  cnhItem: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cnhItemLabel: {
    fontSize: 9,
    color: colors.textMuted,
    fontWeight: '700',
    marginBottom: 4,
  },
  cnhItemValue: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  vehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.background,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  vehicleIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  settingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  settingIconBox: {
    width: 34,
    height: 34,
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
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
  },
  syncNowButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 4,
  },
  syncNowButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.primary,
  },
  supportButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  callSupportBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 12,
    gap: 8,
  },
  callSupportText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
  whatsappSupportBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16A34A',
    borderRadius: 12,
    paddingVertical: 12,
    gap: 8,
  },
  whatsappSupportText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
  versionBadge: {
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  versionBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: colors.primary,
  },
  updateCardDesc: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 18,
  },
  checkUpdateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 13,
    marginTop: 4,
  },
  checkUpdateButtonText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#080B0C',
  },
  versionCard: {
    alignItems: 'center',
    paddingVertical: 12,
    gap: 4,
  },
  versionText: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '600',
  },
  versionSubtext: {
    fontSize: 10,
    color: colors.textDim,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalContent: {
    backgroundColor: '#0F161E',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 20,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 10,
  },
  inputField: {
    backgroundColor: '#16222F',
    borderWidth: 1,
    borderColor: '#243547',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#FFFFFF',
    fontSize: 14,
  },
  showPassRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  showPassText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  modalButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  modalCancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16222F',
    borderRadius: 12,
    paddingVertical: 12,
  },
  modalCancelText: {
    color: '#94A3B8',
    fontWeight: '700',
    fontSize: 13,
  },
  modalSaveBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
  },
  modalSaveText: {
    color: '#080B0C',
    fontWeight: '900',
    fontSize: 13,
  },
  downloadModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(8, 11, 12, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  downloadModalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#11161A',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 122, 0, 0.3)',
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 12,
  },
  downloadModalIconBox: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 122, 0, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 122, 0, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  downloadModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#E7EBEE',
    marginBottom: 6,
    textAlign: 'center',
  },
  downloadModalSubtitle: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 18,
  },
  downloadProgressRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  downloadProgressLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#CAD2D9',
  },
  downloadProgressValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FF7A00',
    fontVariant: ['tabular-nums'],
  },
  downloadProgressBarTrack: {
    width: '100%',
    height: 8,
    backgroundColor: '#1E262B',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 12,
  },
  downloadProgressBarFill: {
    height: '100%',
    backgroundColor: '#FF7A00',
    borderRadius: 4,
  },
  downloadModalHint: {
    fontSize: 11,
    color: '#8E9DA8',
    textAlign: 'center',
    lineHeight: 16,
  },
});
