import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  StatusBar,
  Alert,
  Image,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { colors } from '../theme/colors';
import { api } from '../services/api.service';
import { locationService } from '../services/location.service';
import { IncidentCategory } from '../types/driver';

interface SOSScreenProps {
  onBack: () => void;
  onSuccess?: () => void;
  activeTrip?: any;
}

interface IncidentTypeOption {
  id: IncidentCategory;
  title: string;
  subtitle: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  color: string;
}

const INCIDENT_OPTIONS: IncidentTypeOption[] = [
  {
    id: 'ACIDENTE',
    title: 'Acidente / Colisão',
    subtitle: 'Socorro médico, sinistro ou impacto',
    icon: 'car-emergency',
    color: '#EF4444',
  },
  {
    id: 'MECANICA',
    title: 'Pane Mecânica',
    subtitle: 'Motor, transmissão ou falha mecânica',
    icon: 'wrench',
    color: '#F97316',
  },
  {
    id: 'PNEU',
    title: 'Pneu Furado / Danificado',
    subtitle: 'Troca de estepe ou borracheiro móvel',
    icon: 'car-tire-alert',
    color: '#EAB308',
  },
  {
    id: 'ELETRICA',
    title: 'Pane Elétrica',
    subtitle: 'Bateria descarregada, alternador ou luzes',
    icon: 'lightning-bolt',
    color: '#3B82F6',
  },
  {
    id: 'ATRASO',
    title: 'Bloqueio / Atraso Crítico',
    subtitle: 'Tráfego bloqueado, blitz ou problemas na via',
    icon: 'clock-alert-outline',
    color: '#A855F7',
  },
  {
    id: 'OUTRO',
    title: 'Outra Ocorrência',
    subtitle: 'Outro imprevisto ou necessidade de apoio',
    icon: 'alert-circle-outline',
    color: '#6B7280',
  },
];

export function SOSScreen({ onBack, onSuccess, activeTrip }: SOSScreenProps) {
  const [selectedCategory, setSelectedCategory] = useState<IncidentCategory>('MECANICA');
  const [description, setDescription] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Coordenadas de GPS em tempo real
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [fetchingGps, setFetchingGps] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function fetchLocation() {
      try {
        const pos = await locationService.getCurrentPosition();
        if (isMounted && pos) {
          setCoords({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
        }
      } catch {
        // Fallback para não bloquear o alerta se GPS falhar
      } finally {
        if (isMounted) setFetchingGps(false);
      }
    }

    fetchLocation();

    return () => {
      isMounted = false;
    };
  }, []);

  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permissão necessária', 'Precisamos de acesso à câmera para fotografar o incidente.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.6,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setPhotoUri(result.assets[0].uri);
      }
    } catch {
      Alert.alert('Erro', 'Não foi possível acessar a câmera do dispositivo.');
    }
  };

  const removePhoto = () => {
    setPhotoUri(null);
  };

  const handleSubmit = async () => {
    setSubmitting(true);

    try {
      const result = await api.reportIncident({
        category: selectedCategory,
        description: description.trim() || undefined,
        latitude: coords?.latitude,
        longitude: coords?.longitude,
        photoUrl: photoUri || undefined,
        tripId: activeTrip?.id,
        vehicleId: activeTrip?.vehicle?.id,
      });

      Alert.alert(
        '🚨 Alerta Registrado!',
        `Protocolo de Emergência: ${result.protocol}\n\nA central da RM Frotas recebeu suas coordenadas e foi acionada para prestar assistência imediata.`,
        [
          {
            text: 'Entendido',
            onPress: () => {
              if (onSuccess) onSuccess();
              onBack();
            },
          },
        ]
      );
    } catch (err: any) {
      Alert.alert(
        'Erro ao enviar',
        err.message || 'Falha na comunicação com o servidor. Tente novamente ou acione a central telefônica.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#0B0E11" />

      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton} activeOpacity={0.7}>
          <Ionicons name="close" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
        <View style={styles.headerTitles}>
          <Text style={styles.headerTitle}>SOS Operacional</Text>
          <Text style={styles.headerSubtitle}>Canal Direto com a Central da Frota</Text>
        </View>
        <View style={styles.sosPulseBadge}>
          <View style={styles.pulseInnerDot} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* BANNER DE LOCALIZAÇÃO GPS */}
        <View style={styles.gpsBanner}>
          <View style={styles.gpsIconCircle}>
            <MaterialCommunityIcons
              name={coords ? 'crosshairs-gps' : 'map-marker-radius'}
              size={22}
              color={coords ? '#22C55E' : colors.primary}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.gpsBannerTitle}>
              {fetchingGps ? 'Localizando satélites GPS...' : coords ? 'Localização Fixada' : 'Aguardando Coordenadas'}
            </Text>
            <Text style={styles.gpsBannerSub}>
              {coords
                ? `Lat: ${coords.latitude.toFixed(5)} • Long: ${coords.longitude.toFixed(5)}`
                : 'Transmitindo última localização conhecida'}
            </Text>
          </View>
          {fetchingGps && <ActivityIndicator size="small" color={colors.primary} />}
        </View>

        {/* SELEÇÃO DO TIPO DE EMERGÊNCIA */}
        <Text style={styles.sectionHeader}>TIPO DE OCORRÊNCIA</Text>
        <View style={styles.categoriesGrid}>
          {INCIDENT_OPTIONS.map((opt) => {
            const isSelected = selectedCategory === opt.id;
            return (
              <TouchableOpacity
                key={opt.id}
                style={[
                  styles.categoryCard,
                  isSelected && {
                    borderColor: opt.color,
                    backgroundColor: `${opt.color}15`,
                  },
                ]}
                onPress={() => setSelectedCategory(opt.id)}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.categoryIconWrap,
                    { backgroundColor: `${opt.color}25` },
                    isSelected && { backgroundColor: opt.color },
                  ]}
                >
                  <MaterialCommunityIcons
                    name={opt.icon}
                    size={22}
                    color={isSelected ? '#FFFFFF' : opt.color}
                  />
                </View>
                <View style={styles.categoryInfo}>
                  <Text
                    style={[
                      styles.categoryTitle,
                      isSelected && { color: '#FFFFFF', fontWeight: '800' },
                    ]}
                  >
                    {opt.title}
                  </Text>
                  <Text style={styles.categorySubtitle} numberOfLines={2}>
                    {opt.subtitle}
                  </Text>
                </View>
                {isSelected && (
                  <View style={[styles.checkPill, { backgroundColor: opt.color }]}>
                    <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* DETALHAMENTO / DESCRIÇÃO */}
        <Text style={styles.sectionHeader}>RELATO DO MOTORISTA (OPCIONAL)</Text>
        <View style={styles.inputBox}>
          <TextInput
            style={styles.textArea}
            placeholder="Descreva detalhes: ponto de referência, rodovia, se há feridos ou se o veículo está no acostamento..."
            placeholderTextColor="#5A6578"
            multiline
            numberOfLines={4}
            value={description}
            onChangeText={setDescription}
            textAlignVertical="top"
          />
        </View>

        {/* FOTO DA OCORRÊNCIA */}
        <Text style={styles.sectionHeader}>FOTO DA AVARIA / LOCAL</Text>
        {photoUri ? (
          <View style={styles.photoPreviewCard}>
            <Image source={{ uri: photoUri }} style={styles.photoPreview} resizeMode="cover" />
            <TouchableOpacity style={styles.removePhotoBtn} onPress={removePhoto} activeOpacity={0.8}>
              <Ionicons name="trash-outline" size={18} color="#FFFFFF" />
              <Text style={styles.removePhotoText}>Remover</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.photoUploadBox} onPress={takePhoto} activeOpacity={0.7}>
            <View style={styles.cameraIconBox}>
              <MaterialCommunityIcons name="camera-plus" size={28} color={colors.primary} />
            </View>
            <Text style={styles.photoUploadTitle}>Fotografar com a Câmera</Text>
            <Text style={styles.photoUploadSub}>Ajuda a agilizar o envio do guincho ou peça correta</Text>
          </TouchableOpacity>
        )}

        {/* INFORMAÇÕES DO VEÍCULO VINCULADO */}
        {activeTrip?.vehicle && (
          <View style={styles.vehicleBanner}>
            <MaterialCommunityIcons name="truck" size={18} color={colors.textSecondary} />
            <Text style={styles.vehicleBannerText}>
              Veículo: {activeTrip.vehicle.brand || ''} {activeTrip.vehicle.model || ''} • Placa:{' '}
              {activeTrip.vehicle.plate || '---'}
            </Text>
          </View>
        )}

        {/* BOTÃO PRINCIPAL DE DISPARO */}
        <TouchableOpacity
          style={[styles.sosButton, submitting && { opacity: 0.7 }]}
          onPress={handleSubmit}
          disabled={submitting}
          activeOpacity={0.8}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <>
              <MaterialCommunityIcons name="broadcast" size={24} color="#FFFFFF" />
              <Text style={styles.sosButtonText}>DISPARAR ALERTA DE SOCORRO</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={styles.footerNote}>
          Em caso de risco à vida ou emergência médica, ligue também para 192 (SAMU) ou 193 (Bombeiros).
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#080B0C',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1A2128',
    backgroundColor: '#0B0F13',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#161D24',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerTitles: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#7E8B9B',
    marginTop: 2,
  },
  sosPulseBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#EF444430',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseInnerDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#EF4444',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  gpsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F161E',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    gap: 12,
  },
  gpsIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#16222F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gpsBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  gpsBannerSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '800',
    color: '#8A99AD',
    letterSpacing: 0.8,
    marginBottom: 10,
    marginTop: 10,
  },
  categoriesGrid: {
    gap: 10,
    marginBottom: 16,
  },
  categoryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0E1318',
    borderWidth: 1.5,
    borderColor: '#1C2631',
    borderRadius: 14,
    padding: 12,
    gap: 12,
  },
  categoryIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryInfo: {
    flex: 1,
  },
  categoryTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#E2E8F0',
  },
  categorySubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  checkPill: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputBox: {
    backgroundColor: '#0E1318',
    borderWidth: 1,
    borderColor: '#1C2631',
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
  },
  textArea: {
    color: '#FFFFFF',
    fontSize: 14,
    minHeight: 80,
  },
  photoUploadBox: {
    backgroundColor: '#0E1318',
    borderWidth: 1.5,
    borderColor: '#1C2631',
    borderStyle: 'dashed',
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  cameraIconBox: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  photoUploadTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  photoUploadSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
    textAlign: 'center',
  },
  photoPreviewCard: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#0E1318',
    borderWidth: 1,
    borderColor: '#1C2631',
    marginBottom: 16,
  },
  photoPreview: {
    width: '100%',
    height: 180,
  },
  removePhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EF4444',
    paddingVertical: 10,
    gap: 8,
  },
  removePhotoText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  vehicleBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#121820',
    borderRadius: 10,
    padding: 10,
    gap: 8,
    marginBottom: 20,
  },
  vehicleBannerText: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '600',
  },
  sosButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DC2626',
    borderRadius: 14,
    paddingVertical: 16,
    gap: 10,
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
    marginBottom: 12,
  },
  sosButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  footerNote: {
    textAlign: 'center',
    color: '#4B5563',
    fontSize: 11,
    lineHeight: 16,
    paddingHorizontal: 20,
  },
});
