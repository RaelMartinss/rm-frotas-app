import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  StatusBar,
  Alert,
  Image,
  ImageBackground,
  Modal,
  TextInput,
  ActivityIndicator,
  Linking,
  Switch,
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
import { DriverPortalSummary } from '../types/driver';

interface ProfileScreenProps {
  user: User;
  onLogout: () => void;
  onNavigateToHistory?: () => void;
}

function formatCpf(cpf?: string): string {
  if (!cpf) return '***.***.***-04';
  const digits = cpf.replace(/\D/g, '');
  if (digits.length >= 2) {
    return `***.***.***-${digits.slice(-2)}`;
  }
  return '***.***.***-04';
}

function maskCnh(cnh?: string): string {
  if (!cnh) return '****2551';
  const cleaned = cnh.trim();
  if (cleaned.length >= 4) {
    return '****' + cleaned.slice(-4);
  }
  return cleaned;
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '03/12/2026';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return dateStr;
  }
}

export function ProfileScreen({ user, onLogout, onNavigateToHistory }: ProfileScreenProps) {
  const [currentView, setCurrentView] = useState<'profile' | 'settings'>('profile');
  const [profileUser, setProfileUser] = useState<User>(user);
  const [summary, setSummary] = useState<DriverPortalSummary | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [phone, setPhone] = useState('(91) 98123-4567');
  const [biometricsEnabled, setBiometricsEnabled] = useState(true);
  const [hasBiometricHardware, setHasBiometricHardware] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updatingPhoto, setUpdatingPhoto] = useState(false);

  // Notificações locais
  const [notifTravels, setNotifTravels] = useState(true);
  const [notifFuel, setNotifFuel] = useState(true);
  const [notifAlerts, setNotifAlerts] = useState(true);

  // Modais de Edição & Informação
  const [editProfileModalOpen, setEditProfileModalOpen] = useState(false);
  const [editName, setEditName] = useState(user.name || '');
  const [editEmail, setEditEmail] = useState(user.email || '');
  const [editPhone, setEditPhone] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const [notificationsModalOpen, setNotificationsModalOpen] = useState(false);
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [termsModalOpen, setTermsModalOpen] = useState(false);
  const [privacyModalOpen, setPrivacyModalOpen] = useState(false);
  const [supportModalOpen, setSupportModalOpen] = useState(false);

  // Download do Atualizador In-App
  const [downloadState, setDownloadState] = useState<UpdateDownloadState>({
    isDownloading: false,
    progress: 0,
    error: null,
    completed: false,
  });

  useEffect(() => {
    biometricService.isAvailable().then(setHasBiometricHardware);
    biometricService.isEnabled().then(setBiometricsEnabled);

    const unsubUpdate = appUpdateService.subscribe((st) => {
      setDownloadState(st);
    });

    storage.getItem(`rm_driver_phone_${user.id}`).then((p) => {
      if (p) setPhone(p);
    });
    storage.getItem('rm_driver_photo').then((cached) => {
      if (cached) setPhotoUrl(cached);
    });

    api.getCurrentTrip().then((sum) => {
      if (sum) {
        setSummary(sum);
        if (sum.driver?.photoUrl) {
          setPhotoUrl(sum.driver.photoUrl);
          storage.setItem('rm_driver_photo', sum.driver.photoUrl);
        }
      }
    }).catch(() => {});

    return () => {
      unsubUpdate();
    };
  }, [user.id]);

  const handleSelectPhoto = () => {
    Alert.alert('Foto de Perfil', 'Escolha como deseja atualizar sua foto:', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Câmera', onPress: () => capturePhoto('camera') },
      { text: 'Galeria de Fotos', onPress: () => capturePhoto('gallery') },
      ...(photoUrl ? [{ text: 'Remover Foto', style: 'destructive' as const, onPress: removePhoto }] : []),
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
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permissão necessária', 'Precisamos de acesso à sua galeria de fotos.');
          return;
        }
      }

      const result = mode === 'camera'
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.7,
            base64: true,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.7,
            base64: true,
          });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const base64Uri = asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri;

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

  const handleOpenEditProfile = () => {
    setEditName(profileUser.name || '');
    setEditEmail(profileUser.email || '');
    setEditPhone(phone);
    setEditProfileModalOpen(true);
  };

  const handleSaveProfile = async () => {
    if (!editName.trim()) {
      Alert.alert('Atenção', 'O nome não pode ficar vazio.');
      return;
    }
    setSavingProfile(true);
    try {
      await api.updateProfile(editName.trim());

      const updated = { ...profileUser, name: editName.trim(), email: editEmail.trim() || profileUser.email };
      setProfileUser(updated);
      setPhone(editPhone.trim() || phone);
      await storage.setItem(`rm_driver_phone_${user.id}`, editPhone.trim());
      setEditProfileModalOpen(false);
      Alert.alert('Sucesso', 'Dados cadastrais atualizados!');
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Não foi possível salvar as alterações.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleToggleBiometrics = async (val: boolean) => {
    try {
      if (val) {
        // Se ativando, solicita confirmação biométrica
        const success = await biometricService.authenticate('Confirme sua biometria para ativar o acesso rápido');
        if (success) {
          await biometricService.setEnabled(true);
          setBiometricsEnabled(true);
          Alert.alert('Sucesso', 'Autenticação biométrica ativada com sucesso!');
        } else {
          Alert.alert('Não autenticado', 'Não foi possível validar a biometria.');
        }
      } else {
        await biometricService.setEnabled(false);
        setBiometricsEnabled(false);
        Alert.alert('Biometria Desativada', 'O login biométrico foi desativado.');
      }
    } catch {
      Alert.alert('Erro', 'Não foi possível alterar a configuração de biometria.');
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword) {
      Alert.alert('Atenção', 'Informe sua senha atual.');
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      Alert.alert('Atenção', 'A nova senha deve possuir no mínimo 6 dígitos.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Atenção', 'A confirmação de senha não confere.');
      return;
    }
    setChangingPassword(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      setPasswordModalOpen(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      Alert.alert('Sucesso', 'Sua senha de acesso foi alterada com sucesso!');
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Falha ao alterar senha. Verifique a senha atual.');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    try {
      const res = await appUpdateService.checkForUpdates();
      if (res.hasUpdate) {
        Alert.alert(
          `Atualização Disponível (v${res.latestVersion})`,
          `Uma nova versão do RM Frotas está disponível para instalação.\n\nO que há de novo:\n${res.releaseNotes}\n\nDeseja atualizar agora?`,
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

  const handleConfirmLogout = () => {
    Alert.alert(
      'Sair da Conta',
      'Deseja realmente encerrar sua sessão no aplicativo RM Frotas?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Sair', style: 'destructive', onPress: onLogout },
      ]
    );
  };

  const driverInitials = profileUser.name
    ? profileUser.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .substring(0, 2)
        .toUpperCase()
    : 'RM';

  const driverCpf = summary?.driver?.cpf || '02345678904';
  const driverCnh = summary?.driver?.cnhNumber || '12345672551';
  const driverCnhCat = summary?.driver?.cnhCategory || 'B';
  const driverCnhExp = summary?.driver?.cnhExpirationDateIso || summary?.driver?.cnhExpirationDate || '2026-12-03';

  const vehiclePlate = summary?.trip?.vehicle?.plate || 'BRA2E19';
  const vehicleModel = summary?.trip?.vehicle?.model || summary?.trip?.vehicle?.brand || 'FH540';
  const vehicleKm = summary?.trip?.vehicle?.currentKm ? `${summary.trip.vehicle.currentKm.toLocaleString('pt-BR')} km` : '148.320 km';

  const tripOrigin = summary?.trip?.originCity ? `${summary.trip.originCity} (${summary.trip.originState || 'PA'})` : 'Paragominas (PA)';
  const tripDest = summary?.trip?.destinationCity ? `${summary.trip.destinationCity} (${summary.trip.destinationState || 'SP'})` : 'São Paulo (SP)';
  const isTripActive = summary?.trip?.status === 'IN_PROGRESS' || !summary?.trip;

  const monthFuelings = summary?.monthFuelingsCount ?? 1;
  const recentTrips = summary?.recentTripsCount ?? 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      {/* ========================================================================= */}
      {/* VISTA 1: PERFIL DO MOTORISTA (IDÊNTICO AO CAPACITOR)                      */}
      {/* ========================================================================= */}
      {currentView === 'profile' ? (
        <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
          {/* TOPO: TÍTULO DA PÁGINA + ENGRENAGEM DE CONFIGURAÇÕES */}
          <View style={styles.topHeaderRow}>
            <Text style={styles.topHeaderTitle}>Perfil do Motorista</Text>
            <TouchableOpacity
              style={styles.settingsCogButton}
              onPress={() => setCurrentView('settings')}
              activeOpacity={0.8}
            >
              <Ionicons name="settings-outline" size={20} color="#8E9DA8" />
            </TouchableOpacity>
          </View>

          {/* BANNER HERO COM CAMINHÃO PANORÂMICO AO FUNDO */}
          <View style={styles.heroCardContainer}>
            {/* Imagem do caminhão ocupando 100% da área do card */}
            <Image
              source={require('../../assets/images/truck-hero-bg.png')}
              style={styles.heroBackgroundImage}
              resizeMode="cover"
            />

            {/* Gradiente/overlay escurecendo a esquerda para legibilidade perfeita dos textos mantendo o caminhão visível à direita */}
            <View style={styles.heroOverlayGradientLeft} />
            <View style={styles.heroOverlayGradientRight} />

            <View style={styles.heroContentRow}>
              {/* Avatar Grande com Ring Laranja Industrial e Botão de Câmera */}
              <View style={styles.heroAvatarWrapper}>
                <TouchableOpacity
                  style={styles.heroAvatarTouch}
                  onPress={handleSelectPhoto}
                  activeOpacity={0.85}
                  disabled={updatingPhoto}
                >
                  {updatingPhoto ? (
                    <View style={styles.heroAvatarPlaceholder}>
                      <ActivityIndicator size="small" color={colors.primary} />
                    </View>
                  ) : photoUrl ? (
                    <Image source={{ uri: photoUrl }} style={styles.heroAvatarImage} />
                  ) : (
                    <View style={styles.heroAvatarPlaceholder}>
                      <Text style={styles.heroAvatarInitials}>{driverInitials}</Text>
                    </View>
                  )}

                  {/* Botão de Câmera flutuante no canto inferior direito */}
                  <View style={styles.heroCameraPill}>
                    <Ionicons name="camera" size={13} color="#080B0C" />
                  </View>
                </TouchableOpacity>
              </View>

              {/* Informações do Motorista */}
              <View style={styles.heroInfoCol}>
                <Text style={styles.heroDriverName} numberOfLines={1}>
                  {summary?.driver?.name || profileUser.name || 'Rael Martins'}
                </Text>

                {/* Status Online */}
                <View style={styles.onlinePill}>
                  <View style={styles.onlineDot} />
                  <Text style={styles.onlinePillText}>Online</Text>
                </View>

                {/* Cargo */}
                <Text style={styles.heroRoleSubtitle}>Motorista</Text>
              </View>
            </View>
          </View>

          {/* LINHA DE DADOS DOCUMENTAIS (3 COLUNAS) */}
          <View style={styles.docCard}>
            {/* 1. CPF */}
            <View style={styles.docColCpf}>
              <View style={styles.docLabelRow}>
                <Ionicons name="person-outline" size={13} color="#8E9DA8" />
                <Text style={styles.docLabelText}>CPF</Text>
              </View>
              <Text
                style={styles.docValueText}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {formatCpf(driverCpf)}
              </Text>
            </View>

            {/* 2. CNH - apenas categoria sem números */}
            <View style={[styles.docColCnh, styles.docColDivider]}>
              <View style={styles.docLabelRow}>
                <MaterialCommunityIcons name="card-account-details-outline" size={13} color="#8E9DA8" />
                <Text style={styles.docLabelText}>CNH</Text>
              </View>
              <Text
                style={styles.docValueText}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                Categoria {driverCnhCat}
              </Text>
            </View>

            {/* 3. Validade CNH */}
            <View style={styles.docColValidade}>
              <View style={styles.docLabelRow}>
                <Ionicons name="calendar-outline" size={13} color="#8E9DA8" />
                <Text style={styles.docLabelText}>VALIDADE</Text>
              </View>
              <Text
                style={styles.docValueText}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {formatDate(driverCnhExp)}
              </Text>
            </View>
          </View>

          {/* CARDS DE STATUS ATUAL (2 COLUNAS) */}
          <View style={styles.twoColsGrid}>
            {/* 1. Veículo Atual */}
            <TouchableOpacity
              style={styles.statusCard}
              activeOpacity={0.7}
              onPress={() => {
                Alert.alert(
                  'Veículo da Frota',
                  `Placa: ${vehiclePlate}\nModelo: ${vehicleModel}\nKM Atual: ${vehicleKm}\nCRLV: Regularizado`
                );
              }}
            >
              <View style={styles.statusCardHeader}>
                <View style={styles.statusCardIconBoxOrange}>
                  <Ionicons name="car-outline" size={16} color="#FF7A00" />
                </View>
                <Text style={styles.statusCardHeaderLabel}>Veículo atual</Text>
                <Ionicons name="chevron-forward" size={15} color="#8E9DA8" style={styles.statusCardChevron} />
              </View>
              <View style={styles.statusCardBody}>
                <Text style={styles.vehiclePlateText}>{vehiclePlate}</Text>
                <Text style={styles.statusCardSub} numberOfLines={1}>
                  {vehicleModel} • {vehicleKm}
                </Text>
              </View>
            </TouchableOpacity>

            {/* 2. Última Viagem */}
            <TouchableOpacity
              style={styles.statusCard}
              activeOpacity={0.7}
              onPress={() => {
                if (onNavigateToHistory) onNavigateToHistory();
              }}
            >
              <View style={styles.statusCardHeader}>
                <View style={styles.statusCardIconBoxGrey}>
                  <Ionicons name="location-outline" size={16} color="#CAD2D9" />
                </View>
                <Text style={styles.statusCardHeaderLabel}>Última viagem</Text>
                <Ionicons name="chevron-forward" size={15} color="#8E9DA8" style={styles.statusCardChevron} />
              </View>
              <View style={styles.statusCardBody}>
                <Text style={styles.tripRouteText} numberOfLines={1}>
                  {tripOrigin} ➔ {tripDest}
                </Text>
                <Text style={styles.statusCardSub} numberOfLines={1}>
                  09/10 18:19 •{' '}
                  <Text style={{ color: '#FF7A00', fontWeight: '700' }}>
                    {isTripActive ? 'Em andamento' : 'Concluída'}
                  </Text>
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* SEÇÃO: ESTATÍSTICAS DO MOTORISTA */}
          <View style={styles.statsSection}>
            <View style={styles.statsSectionHeader}>
              <View style={styles.statsHeaderLeft}>
                <MaterialCommunityIcons name="trending-up" size={18} color="#FF7A00" />
                <Text style={styles.statsSectionTitle}>ESTATÍSTICAS DO MOTORISTA</Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  if (onNavigateToHistory) onNavigateToHistory();
                }}
                activeOpacity={0.7}
                style={styles.statsHeaderRight}
              >
                <Text style={styles.statsVerTodasText}>Ver todas</Text>
                <Ionicons name="arrow-forward" size={14} color="#FF7A00" />
              </TouchableOpacity>
            </View>

            <View style={styles.twoColsGrid}>
              {/* Abastecimentos */}
              <View style={styles.metricCard}>
                <View style={styles.metricIconBoxOrange}>
                  <Ionicons name="funnel-outline" size={18} color="#FF7A00" />
                </View>
                <Text style={styles.metricLabel}>Abastecimentos</Text>
                <Text style={styles.metricValue}>{monthFuelings}</Text>
                <Text style={styles.metricTimeSub}>últimos 30 dias</Text>
              </View>

              {/* Viagens */}
              <View style={styles.metricCard}>
                <View style={styles.metricIconBoxGrey}>
                  <Ionicons name="navigate-outline" size={18} color="#CAD2D9" />
                </View>
                <Text style={styles.metricLabel}>Viagens</Text>
                <Text style={styles.metricValue}>{recentTrips}</Text>
                <Text style={styles.metricTimeSub}>últimos 30 dias</Text>
              </View>
            </View>
          </View>
        </ScrollView>
      ) : (
        /* ========================================================================= */
        /* VISTA 2: CONFIGURAÇÕES DA CONTA (IDÊNTICO AO CAPACITOR)                   */
        /* ========================================================================= */
        <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
          {/* TOPO: VOLTAR + TÍTULO */}
          <View style={styles.topHeaderRow}>
            <TouchableOpacity
              style={styles.settingsBackButton}
              onPress={() => setCurrentView('profile')}
              activeOpacity={0.8}
            >
              <Ionicons name="arrow-back" size={20} color="#E7EBEE" />
            </TouchableOpacity>
            <Text style={styles.settingsHeaderTitle}>Configurações</Text>
          </View>

          {/* GRUPO 1: CONTA */}
          <View style={styles.groupSection}>
            <Text style={styles.groupSectionTitle}>CONTA</Text>
            <View style={styles.groupedCard}>
              <TouchableOpacity
                style={styles.groupedRow}
                onPress={handleOpenEditProfile}
                activeOpacity={0.7}
              >
                <View style={styles.rowIconBoxOrange}>
                  <Ionicons name="person" size={18} color="#FF7A00" />
                </View>
                <View style={styles.rowTextCol}>
                  <Text style={styles.rowTitleText}>Dados pessoais</Text>
                  <Text style={styles.rowSubtitleText}>Nome, CPF, telefone e e-mail</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#8E9DA8" />
              </TouchableOpacity>

              <View style={styles.rowDivider} />

              <TouchableOpacity
                style={styles.groupedRow}
                onPress={() => setPasswordModalOpen(true)}
                activeOpacity={0.7}
              >
                <View style={styles.rowIconBoxGrey}>
                  <Ionicons name="lock-closed" size={18} color="#CAD2D9" />
                </View>
                <View style={styles.rowTextCol}>
                  <Text style={styles.rowTitleText}>Alterar senha</Text>
                  <Text style={styles.rowSubtitleText}>Mantenha sua conta segura</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#8E9DA8" />
              </TouchableOpacity>
            </View>
          </View>

          {/* GRUPO 2: APP E DISPOSITIVO */}
          <View style={styles.groupSection}>
            <Text style={styles.groupSectionTitle}>APP E DISPOSITIVO</Text>
            <View style={styles.groupedCard}>
              <TouchableOpacity
                style={styles.groupedRow}
                onPress={() => setNotificationsModalOpen(true)}
                activeOpacity={0.7}
              >
                <View style={styles.rowIconBoxOrange}>
                  <Ionicons name="notifications" size={18} color="#FF7A00" />
                </View>
                <View style={styles.rowTextCol}>
                  <Text style={styles.rowTitleText}>Notificações</Text>
                  <Text style={styles.rowSubtitleText}>Viagens, abastecimentos e alertas</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#8E9DA8" />
              </TouchableOpacity>

              <View style={styles.rowDivider} />

              <TouchableOpacity
                style={styles.groupedRow}
                onPress={() => setLocationModalOpen(true)}
                activeOpacity={0.7}
              >
                <View style={styles.rowIconBoxGrey}>
                  <Ionicons name="location" size={18} color="#CAD2D9" />
                </View>
                <View style={styles.rowTextCol}>
                  <Text style={styles.rowTitleText}>Localização</Text>
                  <Text style={styles.rowSubtitleText}>Permissões de localização do app</Text>
                </View>
                <View style={styles.statusPillSmallGreen}>
                  <Text style={styles.statusPillSmallText}>Ativo</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#8E9DA8" />
              </TouchableOpacity>

              <View style={styles.rowDivider} />

              {/* 3. Biometria (Touch ID / Face ID / Impressão Digital) */}
              <View style={styles.groupedRow}>
                <View style={styles.rowIconBoxOrange}>
                  <Ionicons name="finger-print" size={20} color="#FF7A00" />
                </View>
                <View style={styles.rowTextCol}>
                  <Text style={styles.rowTitleText}>Biometria</Text>
                  <Text style={styles.rowSubtitleText}>Acesso rápido com digital ou Face ID</Text>
                </View>
                <Switch
                  value={biometricsEnabled}
                  onValueChange={handleToggleBiometrics}
                  thumbColor={biometricsEnabled ? '#FF7A00' : '#8E9DA8'}
                  trackColor={{ false: '#1E262B', true: 'rgba(255, 122, 0, 0.4)' }}
                />
              </View>
            </View>
          </View>

          {/* GRUPO 3: INFORMAÇÕES */}
          <View style={styles.groupSection}>
            <Text style={styles.groupSectionTitle}>INFORMAÇÕES</Text>
            <View style={styles.groupedCard}>
              {/* Sobre o App */}
              <TouchableOpacity
                style={styles.groupedRow}
                onPress={handleCheckUpdate}
                activeOpacity={0.7}
                disabled={checkingUpdate}
              >
                <View style={styles.rowIconBoxOrange}>
                  <Ionicons name="information-circle" size={18} color="#FF7A00" />
                </View>
                <View style={styles.rowTextCol}>
                  <Text style={styles.rowTitleText}>Sobre o app</Text>
                  <Text style={styles.rowSubtitleText}>Versão {CURRENT_APP_VERSION}</Text>
                </View>
                {checkingUpdate ? (
                  <ActivityIndicator size="small" color="#FF7A00" />
                ) : (
                  <Ionicons name="chevron-forward" size={16} color="#8E9DA8" />
                )}
              </TouchableOpacity>

              <View style={styles.rowDivider} />

              {/* Termos de Uso */}
              <TouchableOpacity
                style={styles.groupedRow}
                onPress={() => setTermsModalOpen(true)}
                activeOpacity={0.7}
              >
                <View style={styles.rowIconBoxGrey}>
                  <Ionicons name="document-text" size={18} color="#CAD2D9" />
                </View>
                <View style={styles.rowTextCol}>
                  <Text style={styles.rowTitleText}>Termos de uso</Text>
                  <Text style={styles.rowSubtitleText}>Veja os termos e condições</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#8E9DA8" />
              </TouchableOpacity>

              <View style={styles.rowDivider} />

              {/* Política de Privacidade */}
              <TouchableOpacity
                style={styles.groupedRow}
                onPress={() => setPrivacyModalOpen(true)}
                activeOpacity={0.7}
              >
                <View style={styles.rowIconBoxGrey}>
                  <Ionicons name="shield-checkmark" size={18} color="#CAD2D9" />
                </View>
                <View style={styles.rowTextCol}>
                  <Text style={styles.rowTitleText}>Política de privacidade</Text>
                  <Text style={styles.rowSubtitleText}>Como seus dados são usados</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#8E9DA8" />
              </TouchableOpacity>

              <View style={styles.rowDivider} />

              {/* Ajuda e Suporte */}
              <TouchableOpacity
                style={styles.groupedRow}
                onPress={() => setSupportModalOpen(true)}
                activeOpacity={0.7}
              >
                <View style={styles.rowIconBoxOrange}>
                  <Ionicons name="headset" size={18} color="#FF7A00" />
                </View>
                <View style={styles.rowTextCol}>
                  <Text style={styles.rowTitleText}>Ajuda e suporte</Text>
                  <Text style={styles.rowSubtitleText}>Tire suas dúvidas ou entre em contato</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#8E9DA8" />
              </TouchableOpacity>
            </View>
          </View>

          {/* CARD DE SAIR DA CONTA (BORDA VERMELHA) */}
          <TouchableOpacity
            style={styles.logoutCardRed}
            onPress={handleConfirmLogout}
            activeOpacity={0.8}
          >
            <View style={styles.logoutIconBoxRed}>
              <Ionicons name="log-out-outline" size={20} color="#F87171" />
            </View>
            <Text style={styles.logoutCardRedText}>Sair da conta</Text>
            <Ionicons name="chevron-forward" size={16} color="#F87171" />
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* ========================================================================= */}
      {/* MODAL: DADOS PESSOAIS                                                     */}
      {/* ========================================================================= */}
      <Modal
        visible={editProfileModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setEditProfileModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleRow}>
                <Ionicons name="person" size={20} color="#FF7A00" />
                <Text style={styles.modalTitle}>Dados Pessoais</Text>
              </View>
              <TouchableOpacity onPress={() => setEditProfileModalOpen(false)}>
                <Ionicons name="close" size={22} color="#8E9DA8" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalInputGroup}>
              <Text style={styles.modalInputLabel}>Nome Completo</Text>
              <TextInput
                style={styles.modalInput}
                value={editName}
                onChangeText={setEditName}
                placeholder="Seu nome completo"
                placeholderTextColor="#5A6872"
              />
            </View>

            <View style={styles.modalInputGroup}>
              <Text style={styles.modalInputLabel}>E-mail</Text>
              <TextInput
                style={styles.modalInput}
                value={editEmail}
                onChangeText={setEditEmail}
                placeholder="seu.email@exemplo.com"
                placeholderTextColor="#5A6872"
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.modalInputGroup}>
              <Text style={styles.modalInputLabel}>Telefone / WhatsApp</Text>
              <TextInput
                style={styles.modalInput}
                value={editPhone}
                onChangeText={setEditPhone}
                placeholder="(91) 98123-4567"
                placeholderTextColor="#5A6872"
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.modalButtonsRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setEditProfileModalOpen(false)}
              >
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSaveBtn}
                onPress={handleSaveProfile}
                disabled={savingProfile}
              >
                {savingProfile ? (
                  <ActivityIndicator size="small" color="#080B0C" />
                ) : (
                  <Text style={styles.modalSaveText}>Salvar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL: ALTERAR SENHA                                                      */}
      {/* ========================================================================= */}
      <Modal
        visible={passwordModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setPasswordModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleRow}>
                <Ionicons name="lock-closed" size={20} color="#FF7A00" />
                <Text style={styles.modalTitle}>Alterar Senha</Text>
              </View>
              <TouchableOpacity onPress={() => setPasswordModalOpen(false)}>
                <Ionicons name="close" size={22} color="#8E9DA8" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalInputGroup}>
              <Text style={styles.modalInputLabel}>Senha Atual</Text>
              <TextInput
                style={styles.modalInput}
                value={currentPassword}
                onChangeText={setCurrentPassword}
                placeholder="Digite a senha atual"
                placeholderTextColor="#5A6872"
                secureTextEntry={!showPassword}
              />
            </View>

            <View style={styles.modalInputGroup}>
              <Text style={styles.modalInputLabel}>Nova Senha (mínimo 6 dígitos)</Text>
              <TextInput
                style={styles.modalInput}
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="Nova senha segura"
                placeholderTextColor="#5A6872"
                secureTextEntry={!showPassword}
              />
            </View>

            <View style={styles.modalInputGroup}>
              <Text style={styles.modalInputLabel}>Confirmar Nova Senha</Text>
              <TextInput
                style={styles.modalInput}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Repita a nova senha"
                placeholderTextColor="#5A6872"
                secureTextEntry={!showPassword}
              />
            </View>

            <TouchableOpacity
              style={styles.showPassRow}
              onPress={() => setShowPassword(!showPassword)}
            >
              <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={18} color="#FF7A00" />
              <Text style={styles.showPassText}>
                {showPassword ? 'Ocultar senhas' : 'Exibir senhas'}
              </Text>
            </TouchableOpacity>

            <View style={styles.modalButtonsRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setPasswordModalOpen(false)}
              >
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSaveBtn}
                onPress={handleChangePassword}
                disabled={changingPassword}
              >
                {changingPassword ? (
                  <ActivityIndicator size="small" color="#080B0C" />
                ) : (
                  <Text style={styles.modalSaveText}>Alterar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL: NOTIFICAÇÕES                                                       */}
      {/* ========================================================================= */}
      <Modal
        visible={notificationsModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setNotificationsModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleRow}>
                <Ionicons name="notifications" size={20} color="#FF7A00" />
                <Text style={styles.modalTitle}>Preferências de Alerta</Text>
              </View>
              <TouchableOpacity onPress={() => setNotificationsModalOpen(false)}>
                <Ionicons name="close" size={22} color="#8E9DA8" />
              </TouchableOpacity>
            </View>

            <View style={styles.switchRowItem}>
              <View style={{ flex: 1 }}>
                <Text style={styles.switchTitle}>Alertas de Viagens</Text>
                <Text style={styles.switchSub}>Receba novas rotas e itinerários</Text>
              </View>
              <Switch
                value={notifTravels}
                onValueChange={setNotifTravels}
                thumbColor={notifTravels ? '#FF7A00' : '#8E9DA8'}
                trackColor={{ false: '#1E262B', true: 'rgba(255, 122, 0, 0.4)' }}
              />
            </View>

            <View style={styles.switchRowItem}>
              <View style={{ flex: 1 }}>
                <Text style={styles.switchTitle}>Abastecimentos</Text>
                <Text style={styles.switchSub}>Confirmações e cupons salvos</Text>
              </View>
              <Switch
                value={notifFuel}
                onValueChange={setNotifFuel}
                thumbColor={notifFuel ? '#FF7A00' : '#8E9DA8'}
                trackColor={{ false: '#1E262B', true: 'rgba(255, 122, 0, 0.4)' }}
              />
            </View>

            <View style={styles.switchRowItem}>
              <View style={{ flex: 1 }}>
                <Text style={styles.switchTitle}>Avisos da Frota</Text>
                <Text style={styles.switchSub}>Manutenções e comunicados gerais</Text>
              </View>
              <Switch
                value={notifAlerts}
                onValueChange={setNotifAlerts}
                thumbColor={notifAlerts ? '#FF7A00' : '#8E9DA8'}
                trackColor={{ false: '#1E262B', true: 'rgba(255, 122, 0, 0.4)' }}
              />
            </View>

            <TouchableOpacity
              style={[styles.modalSaveBtn, { width: '100%', marginTop: 16 }]}
              onPress={() => {
                setNotificationsModalOpen(false);
                Alert.alert('Sucesso', 'Preferências de notificação salvas no dispositivo.');
              }}
            >
              <Text style={styles.modalSaveText}>Concluído</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL: LOCALIZAÇÃO                                                        */}
      {/* ========================================================================= */}
      <Modal
        visible={locationModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setLocationModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleRow}>
                <Ionicons name="location" size={20} color="#FF7A00" />
                <Text style={styles.modalTitle}>Localização GPS</Text>
              </View>
              <TouchableOpacity onPress={() => setLocationModalOpen(false)}>
                <Ionicons name="close" size={22} color="#8E9DA8" />
              </TouchableOpacity>
            </View>

            <View style={styles.infoBoxWithIcon}>
              <Ionicons name="shield-checkmark" size={24} color="#10B981" />
              <View style={{ flex: 1 }}>
                <Text style={styles.infoBoxTitle}>Rastreamento em Tempo Real Ativo</Text>
                <Text style={styles.infoBoxDesc}>
                  O app coleta dados de telemetria durante viagens em andamento para garantir segurança operacional e registro de percurso.
                </Text>
              </View>
            </View>

            <View style={styles.settingsRowSimple}>
              <Text style={styles.settingsRowSimpleLabel}>Precisão</Text>
              <Text style={styles.settingsRowSimpleValue}>Alta precisão (GPS Satélite)</Text>
            </View>

            <View style={styles.settingsRowSimple}>
              <Text style={styles.settingsRowSimpleLabel}>Segundo plano</Text>
              <Text style={styles.settingsRowSimpleValue}>Ativo com Foreground Service</Text>
            </View>

            <TouchableOpacity
              style={[styles.modalSaveBtn, { width: '100%', marginTop: 16 }]}
              onPress={() => setLocationModalOpen(false)}
            >
              <Text style={styles.modalSaveText}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL: AJUDA E SUPORTE                                                    */}
      {/* ========================================================================= */}
      <Modal
        visible={supportModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setSupportModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleRow}>
                <Ionicons name="headset" size={20} color="#FF7A00" />
                <Text style={styles.modalTitle}>Ajuda e Suporte</Text>
              </View>
              <TouchableOpacity onPress={() => setSupportModalOpen(false)}>
                <Ionicons name="close" size={22} color="#8E9DA8" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.supportButton} onPress={handleCallCentral}>
              <View style={styles.supportIconBoxOrange}>
                <Ionicons name="call" size={20} color="#FF7A00" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.supportTitle}>Central 0800 Operacional</Text>
                <Text style={styles.supportSub}>0800 763 7682 • Chamada Gratuita 24h</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#8E9DA8" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.supportButton} onPress={handleWhatsAppSupport}>
              <View style={styles.supportIconBoxGreen}>
                <Ionicons name="logo-whatsapp" size={20} color="#10B981" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.supportTitle}>WhatsApp de Apoio</Text>
                <Text style={styles.supportSub}>(91) 98123-4567 • Suporte Rápido</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#8E9DA8" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modalCancelBtn, { width: '100%', marginTop: 12 }]}
              onPress={() => setSupportModalOpen(false)}
            >
              <Text style={styles.modalCancelText}>Voltar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL: TERMOS DE USO                                                      */}
      {/* ========================================================================= */}
      <Modal
        visible={termsModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setTermsModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleRow}>
                <Ionicons name="document-text" size={20} color="#FF7A00" />
                <Text style={styles.modalTitle}>Termos de Uso</Text>
              </View>
              <TouchableOpacity onPress={() => setTermsModalOpen(false)}>
                <Ionicons name="close" size={22} color="#8E9DA8" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 300, marginVertical: 8 }}>
              <Text style={styles.termsBodyText}>
                O aplicativo RM Frotas é de uso restrito e exclusivo de motoristas e operadores autorizados da frota.{'\n\n'}
                1. O motorista é responsável pela precisão dos comprovantes e checklists lançados.{'\n'}
                2. O rastreamento de rota permanece em vigor durante as viagens iniciadas.{'\n'}
                3. O acesso é pessoal e intransferível, sendo vedado o compartilhamento de senhas.{'\n'}
                4. O descumprimento das diretrizes operacionais enseja aplicação de normas internas da empresa.
              </Text>
            </ScrollView>
            <TouchableOpacity
              style={[styles.modalSaveBtn, { width: '100%', marginTop: 8 }]}
              onPress={() => setTermsModalOpen(false)}
            >
              <Text style={styles.modalSaveText}>Entendido</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL: POLÍTICA DE PRIVACIDADE                                            */}
      {/* ========================================================================= */}
      <Modal
        visible={privacyModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setPrivacyModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleRow}>
                <Ionicons name="shield-checkmark" size={20} color="#FF7A00" />
                <Text style={styles.modalTitle}>Política de Privacidade</Text>
              </View>
              <TouchableOpacity onPress={() => setPrivacyModalOpen(false)}>
                <Ionicons name="close" size={22} color="#8E9DA8" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 300, marginVertical: 8 }}>
              <Text style={styles.termsBodyText}>
                Seus dados são protegidos em conformidade com as diretrizes de segurança da informação e LGPD.{'\n\n'}
                • Coleta de localização: Ocorre exclusivamente quando uma viagem operacional estiver em andamento.{'\n'}
                • Dados cadastrais: Armazenados em servidores seguros com criptografia ponta a ponta.{'\n'}
                • Imagens e comprovantes: Utilizados unicamente para conferência de prestação de contas de despesas da frota.
              </Text>
            </ScrollView>
            <TouchableOpacity
              style={[styles.modalSaveBtn, { width: '100%', marginTop: 8 }]}
              onPress={() => setPrivacyModalOpen(false)}
            >
              <Text style={styles.modalSaveText}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL: DOWNLOAD DA ATUALIZAÇÃO NATIVA                                     */}
      {/* ========================================================================= */}
      <Modal
        visible={downloadState.isDownloading}
        transparent
        animationType="fade"
        onRequestClose={() => {}}
      >
        <View style={styles.downloadModalBackdrop}>
          <View style={styles.downloadModalCard}>
            <View style={styles.downloadModalIconBox}>
              <Ionicons name="cloud-download" size={32} color="#FF7A00" />
            </View>
            <Text style={styles.downloadModalTitle}>Baixando Atualização...</Text>
            <Text style={styles.downloadModalSubtitle}>Atualizando o RM Frotas no dispositivo</Text>

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
    backgroundColor: '#080B0C',
  },
  scrollContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 40,
    gap: 14,
  },

  /* TOPO DA TELA */
  topHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  topHeaderTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#E7EBEE',
    letterSpacing: -0.3,
  },
  settingsCogButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#11161A',
    borderWidth: 1,
    borderColor: '#222A2F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsBackButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#11161A',
    borderWidth: 1,
    borderColor: '#222A2F',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  settingsHeaderTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#E7EBEE',
    letterSpacing: -0.3,
    flex: 1,
  },

  /* HERO BANNER DO MOTORISTA */
  heroCardContainer: {
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#222A2F',
    backgroundColor: '#11161A',
    position: 'relative',
    minHeight: 114,
    justifyContent: 'center',
  },
  heroBackgroundImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  heroOverlayGradientLeft: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: '58%',
    backgroundColor: 'rgba(8, 11, 12, 0.82)',
  },
  heroOverlayGradientRight: {
    position: 'absolute',
    top: 0,
    left: '50%',
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(8, 11, 12, 0.18)',
  },
  heroContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    zIndex: 2,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  heroAvatarWrapper: {
    position: 'relative',
  },
  heroAvatarTouch: {
    position: 'relative',
  },
  heroAvatarImage: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 2,
    borderColor: '#FF7A00',
  },
  heroAvatarPlaceholder: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(255, 122, 0, 0.18)',
    borderWidth: 2,
    borderColor: '#FF7A00',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroAvatarInitials: {
    fontSize: 24,
    fontWeight: '900',
    color: '#FF7A00',
  },
  heroCameraPill: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FF7A00',
    borderWidth: 2,
    borderColor: '#080B0C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroInfoCol: {
    flex: 1,
    minWidth: 0,
  },
  heroDriverName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#E7EBEE',
    letterSpacing: -0.2,
  },
  onlinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(16, 185, 129, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 6,
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  onlinePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#10B981',
  },
  heroRoleSubtitle: {
    fontSize: 12,
    color: '#8E9DA8',
    marginTop: 4,
    fontWeight: '500',
  },

  /* CARD DE DOCUMENTOS (3 COLUNAS) */
  docCard: {
    backgroundColor: '#11161A',
    borderWidth: 1,
    borderColor: '#222A2F',
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  docColCpf: {
    flex: 1.15,
    minWidth: 0,
    gap: 3,
  },
  docColCnh: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  docColValidade: {
    flex: 1.05,
    minWidth: 0,
    gap: 3,
  },
  docColDivider: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#222A2F',
    paddingHorizontal: 8,
    marginHorizontal: 4,
  },
  docLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  docLabelText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#8E9DA8',
    letterSpacing: 0.5,
  },
  docValueText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#E7EBEE',
    fontVariant: ['tabular-nums'],
  },
  docSubText: {
    fontSize: 10,
    color: '#8E9DA8',
    fontWeight: '500',
  },

  /* GRID DE 2 COLUNAS */
  twoColsGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  statusCard: {
    flex: 1,
    backgroundColor: '#11161A',
    borderWidth: 1,
    borderColor: '#222A2F',
    borderRadius: 20,
    padding: 12,
    justifyContent: 'space-between',
  },
  statusCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusCardIconBoxOrange: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 122, 0, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 122, 0, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusCardIconBoxGrey: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#1E262B',
    borderWidth: 1,
    borderColor: '#222A2F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusCardHeaderLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#8E9DA8',
    flex: 1,
  },
  statusCardChevron: {
    marginLeft: 'auto',
  },
  statusCardBody: {
    marginTop: 10,
    gap: 2,
  },
  vehiclePlateText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#E7EBEE',
    letterSpacing: 0.5,
  },
  tripRouteText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#E7EBEE',
  },
  statusCardSub: {
    fontSize: 10,
    color: '#8E9DA8',
    fontWeight: '500',
  },

  /* ESTATÍSTICAS */
  statsSection: {
    gap: 8,
    marginTop: 4,
  },
  statsSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  statsHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statsSectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#E7EBEE',
    letterSpacing: 0.5,
  },
  statsHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statsVerTodasText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FF7A00',
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#11161A',
    borderWidth: 1,
    borderColor: '#222A2F',
    borderRadius: 20,
    padding: 14,
  },
  metricIconBoxOrange: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 122, 0, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 122, 0, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  metricIconBoxGrey: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#1E262B',
    borderWidth: 1,
    borderColor: '#222A2F',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#CAD2D9',
  },
  metricValue: {
    fontSize: 24,
    fontWeight: '900',
    color: '#E7EBEE',
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  metricTimeSub: {
    fontSize: 10,
    color: '#8E9DA8',
    marginTop: 2,
  },

  /* TELA DE CONFIGURAÇÕES */
  groupSection: {
    gap: 6,
  },
  groupSectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#8E9DA8',
    letterSpacing: 0.8,
    paddingHorizontal: 4,
  },
  groupedCard: {
    backgroundColor: '#11161A',
    borderWidth: 1,
    borderColor: '#222A2F',
    borderRadius: 20,
  },
  groupedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  rowDivider: {
    height: 1,
    backgroundColor: 'rgba(34, 42, 47, 0.7)',
    marginLeft: 54,
  },
  rowIconBoxOrange: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 122, 0, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 122, 0, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconBoxGrey: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#1E262B',
    borderWidth: 1,
    borderColor: '#222A2F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowTitleText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#E7EBEE',
  },
  rowSubtitleText: {
    fontSize: 11,
    color: '#8E9DA8',
  },
  statusPillSmallGreen: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  statusPillSmallText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#10B981',
  },

  /* SAIR DA CONTA (CARD VERMELHO) */
  logoutCardRed: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
    borderRadius: 20,
    padding: 14,
    gap: 12,
    marginTop: 6,
  },
  logoutIconBoxRed: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutCardRedText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#F87171',
    flex: 1,
  },

  /* MODAIS GERAIS */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(8, 11, 12, 0.85)',
    justifyContent: 'flex-end',
    padding: 16,
    paddingBottom: 24,
  },
  modalContentCard: {
    backgroundColor: '#0F1215',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#222A2F',
    padding: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#222A2F',
  },
  modalHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#E7EBEE',
  },
  modalInputGroup: {
    marginBottom: 12,
  },
  modalInputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#CAD2D9',
    marginBottom: 6,
  },
  modalInput: {
    backgroundColor: '#080B0C',
    borderWidth: 1,
    borderColor: '#222A2F',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#E7EBEE',
    fontSize: 13,
  },
  showPassRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    marginBottom: 12,
  },
  showPassText: {
    color: '#FF7A00',
    fontSize: 12,
    fontWeight: '600',
  },
  modalButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
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
    minHeight: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF7A00',
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  modalSaveText: {
    color: '#080B0C',
    fontWeight: 'bold',
    fontSize: 14,
    textAlign: 'center',
    includeFontPadding: false,
  },

  /* SWITCH ITEMS */
  switchRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1E262B',
  },
  switchTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#E7EBEE',
  },
  switchSub: {
    fontSize: 11,
    color: '#8E9DA8',
    marginTop: 2,
  },

  /* INFO BOX */
  infoBoxWithIcon: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
  },
  infoBoxTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#10B981',
  },
  infoBoxDesc: {
    fontSize: 11,
    color: '#CAD2D9',
    marginTop: 2,
    lineHeight: 16,
  },
  settingsRowSimple: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1E262B',
  },
  settingsRowSimpleLabel: {
    fontSize: 12,
    color: '#8E9DA8',
  },
  settingsRowSimpleValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#E7EBEE',
  },

  /* SUPORTE */
  supportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#11161A',
    borderWidth: 1,
    borderColor: '#222A2F',
    borderRadius: 16,
    padding: 14,
    gap: 12,
    marginBottom: 10,
  },
  supportIconBoxOrange: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 122, 0, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  supportIconBoxGreen: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  supportTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#E7EBEE',
  },
  supportSub: {
    fontSize: 11,
    color: '#8E9DA8',
    marginTop: 2,
  },
  termsBodyText: {
    fontSize: 12,
    color: '#CAD2D9',
    lineHeight: 18,
  },

  /* DOWNLOAD MODAL */
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
