import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  StatusBar,
  Platform,
  Alert,
  Image,
  Switch,
  Vibration,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { colors } from '../theme/colors';
import { api } from '../services/api.service';
import { networkService } from '../services/network.service';
import { DriverFuelDTO } from '../types/driver';

interface FuelScreenProps {
  onBack: () => void;
  onSuccess?: () => void;
  defaultVehicle?: any;
}

type FuelType = 'DIESEL' | 'GASOLINA' | 'ETANOL' | 'ARLA_32';

export function FuelScreen({ onBack, onSuccess, defaultVehicle }: FuelScreenProps) {
  const [vehicle, setVehicle] = useState<any>(defaultVehicle || null);
  const [km, setKm] = useState(defaultVehicle?.currentKm != null ? String(defaultVehicle.currentKm) : '');
  const [fuelType, setFuelType] = useState<FuelType>('DIESEL');
  const [liters, setLiters] = useState('320.00');
  const [pricePerLiter, setPricePerLiter] = useState('6.19');
  const [stationName, setStationName] = useState('Posto Graal Embaixador');
  const [fullTank, setFullTank] = useState(true);
  const [notes, setNotes] = useState('');
  const [receiptPhotoUri, setReceiptPhotoUri] = useState<string | null>(null);
  const [receiptBase64, setReceiptBase64] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [isOnline, setIsOnline] = useState(networkService.isOnline);

  // Monitora alterações na conectividade da rede em tempo real
  useEffect(() => {
    const unsub = networkService.subscribe((online: boolean) => {
      setIsOnline(online);
    });
    return unsub;
  }, []);

  // Busca dados dinâmicos do veículo da viagem ativa caso não tenham sido passados
  useEffect(() => {
    if (defaultVehicle) {
      setVehicle(defaultVehicle);
      if (defaultVehicle.currentKm != null && !km) {
        setKm(String(defaultVehicle.currentKm));
      }
      return;
    }

    let isMounted = true;
    api
      .getCurrentTrip()
      .then((summary) => {
        if (!isMounted) return;
        const currentVeh = summary?.trip?.vehicle;
        if (currentVeh) {
          setVehicle(currentVeh);
          if (currentVeh.currentKm != null) {
            setKm(String(currentVeh.currentKm));
          }
        }
      })
      .catch(() => {})

    return () => {
      isMounted = false;
    };
  }, [defaultVehicle]);

  // Cálculo automático do total
  const total =
    liters && pricePerLiter
      ? (parseFloat(liters.replace(',', '.')) * parseFloat(pricePerLiter.replace(',', '.'))).toFixed(2)
      : '0,00';

  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permissão necessária', 'Precisamos de acesso à câmera para fotografar o cupom fiscal.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.7,
        base64: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setReceiptPhotoUri(asset.uri);
        if (asset.base64) {
          setReceiptBase64(`data:image/jpeg;base64,${asset.base64}`);
        }
      }
    } catch {
      Alert.alert('Erro', 'Não foi possível abrir a câmera.');
    }
  };

  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permissão necessária', 'Precisamos de acesso à galeria para anexar o comprovante.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.7,
        base64: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setReceiptPhotoUri(asset.uri);
        if (asset.base64) {
          setReceiptBase64(`data:image/jpeg;base64,${asset.base64}`);
        }
      }
    } catch {
      Alert.alert('Erro', 'Não foi possível abrir a galeria.');
    }
  };

  const handleSelectPhoto = () => {
    Alert.alert(
      'Comprovante Fiscal',
      'Escolha como deseja registrar o cupom:',
      [
        { text: '📷 Câmera (Tirar Foto)', onPress: takePhoto },
        { text: '🖼️ Galeria de Fotos', onPress: pickImage },
        { text: 'Cancelar', style: 'cancel' },
      ]
    );
  };

  const handleRemovePhoto = () => {
    setReceiptPhotoUri(null);
    setReceiptBase64(null);
  };

  // Validação e cálculo em tempo real do odômetro
  const parsedKm = parseInt(km.replace(/\D/g, ''), 10);
  const isKmLowerThanVehicle =
    vehicle?.currentKm != null && !isNaN(parsedKm) && parsedKm > 0 && parsedKm < vehicle.currentKm;

  const handleSave = async () => {
    if (!km || !liters || !pricePerLiter) {
      Alert.alert('Atenção', 'Preencha o odômetro, a quantidade de litros e o valor por litro.');
      return;
    }

    if (isNaN(parsedKm) || parsedKm <= 0) {
      Alert.alert('Atenção', 'Informe um valor válido para o odômetro.');
      return;
    }

    if (vehicle?.currentKm != null && parsedKm < vehicle.currentKm) {
      Alert.alert(
        'Odômetro Menor que o Atual',
        `O odômetro informado (${parsedKm.toLocaleString('pt-BR')} km) não pode ser inferior ao odômetro atual do veículo (${Number(vehicle.currentKm).toLocaleString('pt-BR')} km).`
      );
      return;
    }

    const parsedLiters = parseFloat(liters.replace(',', '.'));
    const parsedPrice = parseFloat(pricePerLiter.replace(',', '.'));

    if (isNaN(parsedLiters) || parsedLiters <= 0 || isNaN(parsedPrice) || parsedPrice <= 0) {
      Alert.alert('Atenção', 'Informe valores numéricos válidos para litros e preço.');
      return;
    }

    setSubmitting(true);
    try {
      const targetVehicleId = vehicle?.id || defaultVehicle?.id || '74f74c7a-254b-477f-b715-734ee09f9a27';
      const fuelDto: DriverFuelDTO = {
        vehicleId: targetVehicleId,
        currentKm: parsedKm,
        liters: parsedLiters,
        pricePerLiter: parsedPrice,
        fuelType,
        gasStation: stationName.trim() || undefined,
        fullTank,
        notes: notes.trim() || undefined,
        receiptUrl: receiptBase64 || receiptPhotoUri || undefined,
        occurredAt: new Date().toISOString(),
        vehiclePlate: vehicle?.plate || vehicle?.licensePlate || defaultVehicle?.plate || 'BRA2E19',
        vehicleModel: vehicle ? `${vehicle.brand || ''} ${vehicle.model || ''}`.trim() : 'Volvo FH 540',
      };

      const res = await api.registerFuel(fuelDto);

      try {
        Vibration.vibrate(50);
      } catch {}

      if (res.isOffline) {
        Alert.alert(
          '💾 Salvo no Modo Offline',
          'O abastecimento foi gravado com segurança na fila offline do dispositivo.\n\nSerá sincronizado automaticamente com a central assim que você tiver conexão de internet.',
          [
            {
              text: 'Entendido',
              onPress: () => {
                if (onSuccess) onSuccess();
                else onBack();
              },
            },
          ]
        );
      } else {
        Alert.alert('✅ Sucesso', res.message || 'Abastecimento registrado com sucesso no sistema!', [
          {
            text: 'OK',
            onPress: () => {
              if (onSuccess) onSuccess();
              else onBack();
            },
          },
        ]);
      }
    } catch (err: any) {
      Alert.alert('Aviso de Lançamento', err.message || 'Abastecimento registrado em cache.');
      if (onSuccess) onSuccess();
      else onBack();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      {/* HEADER DA TELA */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={onBack} style={styles.backButton} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Registrar Abastecimento</Text>
            <Text style={styles.headerSubtitle}>Lançamento de cupom e consumo</Text>
          </View>
        </View>

        <View style={styles.fuelIconBadge}>
          <MaterialCommunityIcons name="gas-station" size={20} color={colors.primary} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* BANNER MODO OFFLINE */}
        {!isOnline && (
          <View style={styles.offlineBanner}>
            <View style={styles.offlineBannerHeader}>
              <View style={styles.offlineBadge}>
                <Ionicons name="cloud-offline-outline" size={14} color="#F59E0B" />
                <Text style={styles.offlineBadgeText}>MODO OFFLINE ATIVADO</Text>
              </View>
              <Text style={styles.offlineTimeText}>Sem conexão</Text>
            </View>
            <Text style={styles.offlineBannerDesc}>
              Os dados e comprovante serão gravados com segurança no aparelho e transmitidos automaticamente para a central assim que a conexão for restabelecida.
            </Text>
          </View>
        )}

        {/* CARD DO VEÍCULO ATIVO */}
        <View style={styles.vehicleCard}>
          <View style={styles.vehicleIconBadge}>
            <MaterialCommunityIcons name="truck-outline" size={22} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.vehiclePlateRow}>
              <View style={styles.plateBadge}>
                <Text style={styles.plateText}>{vehicle?.plate || vehicle?.licensePlate || 'BRA2E19'}</Text>
              </View>
              <Text style={styles.vehicleModelText}>
                {vehicle ? `${vehicle.brand || ''} ${vehicle.model || ''}`.trim() : 'Volvo FH 540'}
              </Text>
            </View>
            <View style={styles.odometerRow}>
              <Ionicons name="speedometer-outline" size={13} color={colors.textMuted} />
              <Text style={styles.odometerText}>
                Odômetro atual:{' '}
                <Text style={styles.odometerValue}>
                  {vehicle?.currentKm != null ? Number(vehicle.currentKm).toLocaleString('pt-BR') : '148.320'} km
                </Text>
              </Text>
            </View>
          </View>
        </View>

        {/* SEÇÃO 1: ODÔMETRO */}
        <View style={styles.sectionCard}>
          <View style={styles.labelRow}>
            <View style={styles.labelWithIcon}>
              <Ionicons name="speedometer" size={14} color={colors.primary} />
              <Text style={styles.sectionLabel}>KM DO ODÔMETRO</Text>
            </View>
            <Text style={styles.labelHint}>Foto no painel</Text>
          </View>

          <View style={styles.inputContainer}>
            <TextInput
              style={[styles.input, styles.monoInput]}
              value={km}
              onChangeText={setKm}
              keyboardType="numeric"
              placeholder={`ex: ${vehicle?.currentKm || '148320'}`}
              placeholderTextColor={colors.textDim}
            />
            <Text style={styles.inputSuffix}>KM</Text>
          </View>

          {isKmLowerThanVehicle && (
            <View style={styles.kmWarningBox}>
              <Ionicons name="alert-circle" size={14} color="#F59E0B" />
              <Text style={styles.kmWarningText}>
                KM informado é menor que o odômetro anterior ({Number(vehicle.currentKm).toLocaleString('pt-BR')} km).
              </Text>
            </View>
          )}
        </View>

        {/* SEÇÃO 2: TIPO DE COMBUSTÍVEL */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionLabel}>TIPO DE COMBUSTÍVEL</Text>
          <View style={styles.fuelTypeGrid}>
            {[
              { id: 'DIESEL', label: 'Diesel S10 / Comum' },
              { id: 'GASOLINA', label: 'Gasolina' },
              { id: 'ETANOL', label: 'Etanol' },
              { id: 'ARLA_32', label: 'Arla 32' },
            ].map((item) => {
              const active = fuelType === item.id;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.fuelTypePill, active && styles.fuelTypePillActive]}
                  onPress={() => setFuelType(item.id as FuelType)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.fuelTypePillText, active && styles.fuelTypePillTextActive]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* SEÇÃO 3: QUANTIDADE E PREÇO POR LITRO */}
        <View style={styles.sectionCard}>
          <View style={styles.twoColRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionLabel}>LITROS</Text>
              <View style={styles.inputContainer}>
                <TextInput
                  style={[styles.input, styles.monoInput]}
                  value={liters}
                  onChangeText={setLiters}
                  keyboardType="decimal-pad"
                  placeholder="320.50"
                  placeholderTextColor={colors.textDim}
                />
                <Text style={styles.inputSuffix}>L</Text>
              </View>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.sectionLabel}>PREÇO / LITRO</Text>
              <View style={styles.inputContainer}>
                <TextInput
                  style={[styles.input, styles.monoInput]}
                  value={pricePerLiter}
                  onChangeText={setPricePerLiter}
                  keyboardType="decimal-pad"
                  placeholder="6.19"
                  placeholderTextColor={colors.textDim}
                />
                <Text style={styles.inputSuffix}>R$</Text>
              </View>
            </View>
          </View>

          {/* TOTAL CALCULADO */}
          <View style={styles.totalBox}>
            <Text style={styles.totalLabel}>TOTAL ESTIMADO</Text>
            <Text style={styles.totalValue}>R$ {total.replace('.', ',')}</Text>
          </View>
        </View>

        {/* SEÇÃO 4: TANQUE CHEIO */}
        <TouchableOpacity
          style={styles.sectionCard}
          activeOpacity={0.8}
          onPress={() => setFullTank(!fullTank)}
        >
          <View style={styles.switchRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <View style={styles.switchHeaderRow}>
                <MaterialCommunityIcons
                  name="gas-station-outline"
                  size={18}
                  color={fullTank ? colors.primary : colors.textMuted}
                />
                <Text style={styles.switchTitle}>Tanque Cheio (Completou o tanque)</Text>
              </View>
              <Text style={styles.switchDesc}>
                Marque se completou até o desarme automático da bomba. Essencial para o cálculo de média Km/L.
              </Text>
            </View>
            <Switch
              value={fullTank}
              onValueChange={setFullTank}
              trackColor={{ false: '#222A2F', true: colors.primary }}
              thumbColor={fullTank ? '#FFFFFF' : '#8E9DA8'}
            />
          </View>
        </TouchableOpacity>

        {/* SEÇÃO 5: POSTO DE COMBUSTÍVEL E OBSERVAÇÕES */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionLabel}>POSTO DE COMBUSTÍVEL (OPCIONAL)</Text>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              value={stationName}
              onChangeText={setStationName}
              placeholder="Ex: Posto Graal Embaixador, Shell..."
              placeholderTextColor={colors.textDim}
            />
            <MaterialCommunityIcons name="map-marker-outline" size={18} color={colors.textMuted} style={styles.inputIconRight} />
          </View>

          <View style={[styles.labelRow, { marginTop: 4 }]}>
            <Text style={styles.sectionLabel}>OBSERVAÇÕES ADICIONAIS (OPCIONAL)</Text>
          </View>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              value={notes}
              onChangeText={setNotes}
              placeholder="Ex: Desconto via convênio, bomba 03..."
              placeholderTextColor={colors.textDim}
            />
            <MaterialCommunityIcons name="file-document-outline" size={18} color={colors.textMuted} style={styles.inputIconRight} />
          </View>
        </View>

        {/* SEÇÃO 6: FOTO DO CUPOM FISCAL / COMPROVANTE */}
        <View style={styles.sectionCard}>
          <View style={styles.labelRow}>
            <Text style={styles.sectionLabel}>FOTO DO CUPOM FISCAL</Text>
            <Text style={styles.labelHint}>Obrigatório para prestação</Text>
          </View>

          {receiptPhotoUri ? (
            <View style={styles.photoPreviewCard}>
              <Image source={{ uri: receiptPhotoUri }} style={styles.photoPreviewImage} />
              <View style={styles.photoPreviewMeta}>
                <View style={styles.photoAttachedBadge}>
                  <Ionicons name="checkmark-circle" size={14} color="#34D399" />
                  <Text style={styles.photoAttachedBadgeText}>Comprovante Anexado</Text>
                </View>
                <Text style={styles.photoFilename} numberOfLines={1}>
                  Foto do comprovante pronta para envio
                </Text>
                <View style={styles.photoActionsRow}>
                  <TouchableOpacity
                    style={styles.changePhotoButton}
                    onPress={handleSelectPhoto}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="camera-reverse-outline" size={14} color={colors.primary} />
                    <Text style={styles.changePhotoButtonText}>Trocar foto</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.removePhotoButton}
                    onPress={handleRemovePhoto}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="trash-outline" size={14} color="#F87171" />
                    <Text style={styles.removePhotoButtonText}>Remover</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.photoBox}
              onPress={handleSelectPhoto}
              activeOpacity={0.8}
            >
              <View style={styles.photoIconBadge}>
                <Ionicons name="camera-outline" size={24} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.photoTitle}>Tirar foto ou anexar cupom</Text>
                <Text style={styles.photoDesc}>Câmera nativa ou galeria do aparelho</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* BOTÃO SALVAR */}
        <TouchableOpacity
          style={[
            styles.saveButton,
            !isOnline && styles.saveButtonOffline,
            submitting && { opacity: 0.7 },
          ]}
          onPress={handleSave}
          disabled={submitting}
          activeOpacity={0.85}
        >
          <MaterialCommunityIcons
            name={!isOnline ? 'cloud-upload-outline' : 'check'}
            size={20}
            color="#080B0C"
            style={{ marginRight: 6 }}
          />
          <Text style={styles.saveButtonText}>
            {submitting
              ? 'Salvando...'
              : !isOnline
              ? 'Salvar Offline (Sincronizar Depois)'
              : 'Salvar Abastecimento'}
          </Text>
        </TouchableOpacity>

        {!isOnline && (
          <Text style={styles.saveButtonOfflineNote}>
            🔒 Registro protegido e enfileirado para envio automático
          </Text>
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
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
  },
  fuelIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    padding: 20,
    gap: 16,
    paddingBottom: 40,
  },
  vehicleCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  vehicleIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehiclePlateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  vehicleModelText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  odometerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  odometerText: {
    fontSize: 11,
    color: colors.textMuted,
  },
  odometerValue: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  sectionCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 16,
    gap: 12,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  switchTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  switchDesc: {
    fontSize: 11,
    color: colors.textMuted,
    lineHeight: 16,
  },
  labelRow: {
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
    fontWeight: '800',
    color: colors.textMuted,
    letterSpacing: 0.8,
  },
  labelHint: {
    fontSize: 10,
    color: colors.textDim,
  },
  inputContainer: {
    position: 'relative',
    justifyContent: 'center',
  },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.textPrimary,
    fontSize: 14,
  },
  monoInput: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '700',
    fontSize: 15,
  },
  inputSuffix: {
    position: 'absolute',
    right: 14,
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  inputIconRight: {
    position: 'absolute',
    right: 14,
  },
  fuelTypeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  fuelTypePill: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fuelTypePillActive: {
    backgroundColor: colors.primaryMuted,
    borderColor: colors.primary,
  },
  fuelTypePillText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
  },
  fuelTypePillTextActive: {
    color: colors.primary,
    fontWeight: '800',
  },
  twoColRow: {
    flexDirection: 'row',
    gap: 12,
  },
  totalBox: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textMuted,
    letterSpacing: 0.8,
  },
  totalValue: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.primary,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  photoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },
  photoBoxAttached: {
    borderStyle: 'solid',
    borderColor: 'rgba(52, 211, 153, 0.4)',
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
  },
  photoPreviewCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.3)',
    borderRadius: 16,
    padding: 12,
    gap: 12,
    alignItems: 'center',
  },
  photoPreviewImage: {
    width: 68,
    height: 68,
    borderRadius: 10,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  photoPreviewMeta: {
    flex: 1,
    gap: 4,
  },
  photoAttachedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  photoAttachedBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#34D399',
  },
  photoFilename: {
    fontSize: 11,
    color: colors.textMuted,
  },
  photoActionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  changePhotoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  changePhotoButtonText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
  },
  removePhotoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  removePhotoButtonText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#F87171',
  },
  photoIconBadge: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  photoDesc: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  saveButtonText: {
    color: '#080B0C',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  saveButtonOffline: {
    backgroundColor: '#F59E0B',
    shadowColor: '#F59E0B',
  },
  saveButtonOfflineNote: {
    textAlign: 'center',
    fontSize: 11,
    color: '#8E9DA8',
    marginTop: 2,
    marginBottom: 8,
  },
  offlineBanner: {
    backgroundColor: '#16130E',
    borderWidth: 1,
    borderColor: '#784E10',
    borderRadius: 16,
    padding: 14,
    gap: 8,
  },
  offlineBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  offlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  offlineBadgeText: {
    color: '#F59E0B',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  offlineTimeText: {
    color: '#8E9DA8',
    fontSize: 11,
  },
  offlineBannerDesc: {
    color: '#CAD2D9',
    fontSize: 12,
    lineHeight: 17,
  },
  kmWarningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.25)',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
  },
  kmWarningText: {
    color: '#F59E0B',
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },
});
