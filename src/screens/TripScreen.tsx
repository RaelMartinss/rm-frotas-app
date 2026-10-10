import React, { useState } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../theme/colors';

interface TripScreenProps {
  onBack: () => void;
  onTripStarted: (tripData: any) => void;
}

export function TripScreen({ onBack, onTripStarted }: TripScreenProps) {
  const [selectedVehicle, setSelectedVehicle] = useState('ABC-4D88');
  const [origin, setOrigin] = useState('São Paulo (SP)');
  const [destination, setDestination] = useState('Curitiba (PR)');
  const [initialKm, setInitialKm] = useState('148500');

  // Checklist rápido
  const [checklist, setChecklist] = useState({
    tires: true,
    fluids: true,
    lights: true,
    documents: true,
  });

  const toggleCheck = (key: keyof typeof checklist) => {
    setChecklist((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleStartTrip = () => {
    if (!initialKm || !destination) {
      Alert.alert('Atenção', 'Informe o odômetro inicial e o destino da viagem.');
      return;
    }

    const allChecked = Object.values(checklist).every(Boolean);
    if (!allChecked) {
      Alert.alert('Checklist Pendente', 'Certifique-se de que todos os itens de inspeção diária foram checados.');
      return;
    }

    Alert.alert('Viagem Iniciada', `Boa viagem! Rota: ${origin} → ${destination}`, [
      {
        text: 'OK',
        onPress: () => {
          onTripStarted({
            vehiclePlate: selectedVehicle,
            origin,
            destination,
            initialKm,
            startedAt: new Date().toISOString(),
          });
        },
      },
    ]);
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
            <Text style={styles.headerTitle}>Iniciar Nova Viagem</Text>
            <Text style={styles.headerSubtitle}>Validação de checklist e odômetro</Text>
          </View>
        </View>

        <View style={styles.truckIconBadge}>
          <MaterialCommunityIcons name="truck-fast" size={20} color={colors.primary} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* SELEÇÃO DO VEÍCULO */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionLabel}>VEÍCULO DESIGNADO</Text>
          <View style={styles.vehicleSelectBox}>
            <View style={styles.vehicleIconBadge}>
              <MaterialCommunityIcons name="truck" size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.vehiclePlateRow}>
                <View style={styles.plateBadge}>
                  <Text style={styles.plateText}>{selectedVehicle}</Text>
                </View>
                <Text style={styles.vehicleModelText}>Scania R450 6x2</Text>
              </View>
              <Text style={styles.vehicleSubtitle}>Cavalo Mecânico • Diesel S10</Text>
            </View>
          </View>
        </View>

        {/* ODÔMETRO INICIAL */}
        <View style={styles.sectionCard}>
          <View style={styles.labelRow}>
            <View style={styles.labelWithIcon}>
              <Ionicons name="speedometer" size={14} color={colors.primary} />
              <Text style={styles.sectionLabel}>ODÔMETRO INICIAL DE SAÍDA</Text>
            </View>
            <Text style={styles.labelHint}>Conferir painel</Text>
          </View>

          <View style={styles.inputContainer}>
            <TextInput
              style={[styles.input, styles.monoInput]}
              value={initialKm}
              onChangeText={setInitialKm}
              keyboardType="numeric"
              placeholder="148500"
              placeholderTextColor={colors.textDim}
            />
            <Text style={styles.inputSuffix}>KM</Text>
          </View>
        </View>

        {/* ROTA PREVISTA */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionLabel}>ROTA DA VIAGEM</Text>
          <View style={styles.routeContainer}>
            <View style={styles.routeItem}>
              <View style={[styles.routeDot, { backgroundColor: '#34D399' }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.routeFieldLabel}>Origem</Text>
                <TextInput
                  style={styles.routeInput}
                  value={origin}
                  onChangeText={setOrigin}
                  placeholder="Cidade de Origem"
                  placeholderTextColor={colors.textDim}
                />
              </View>
            </View>

            <View style={styles.routeLine} />

            <View style={styles.routeItem}>
              <View style={[styles.routeDot, { backgroundColor: colors.primary }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.routeFieldLabel}>Destino</Text>
                <TextInput
                  style={styles.routeInput}
                  value={destination}
                  onChangeText={setDestination}
                  placeholder="Cidade de Destino"
                  placeholderTextColor={colors.textDim}
                />
              </View>
            </View>
          </View>
        </View>

        {/* CHECKLIST DIÁRIO */}
        <View style={styles.sectionCard}>
          <View style={styles.labelRow}>
            <Text style={styles.sectionLabel}>CHECKLIST OPERACIONAL</Text>
            <Text style={styles.labelHint}>Norma de segurança</Text>
          </View>

          <View style={styles.checklistGrid}>
            {[
              { key: 'tires', label: 'Pneus e Estepe', desc: 'Calibragem e sulco' },
              { key: 'fluids', label: 'Óleo e Água', desc: 'Níveis verificados' },
              { key: 'lights', label: 'Faróis e Setas', desc: 'Sinalização funcional' },
              { key: 'documents', label: 'CNH e CRLV', desc: 'Documentos regulares' },
            ].map((item) => {
              const isChecked = checklist[item.key as keyof typeof checklist];
              return (
                <TouchableOpacity
                  key={item.key}
                  style={[styles.checklistItem, isChecked && styles.checklistItemChecked]}
                  onPress={() => toggleCheck(item.key as keyof typeof checklist)}
                  activeOpacity={0.75}
                >
                  <View
                    style={[
                      styles.checkCircle,
                      isChecked && styles.checkCircleChecked,
                    ]}
                  >
                    {isChecked && <Ionicons name="checkmark" size={14} color="#080B0C" />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.checkLabel, isChecked && styles.checkLabelChecked]}>
                      {item.label}
                    </Text>
                    <Text style={styles.checkDesc}>{item.desc}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* BOTÃO INICIAR */}
        <TouchableOpacity
          style={styles.startButton}
          onPress={handleStartTrip}
          activeOpacity={0.85}
        >
          <MaterialCommunityIcons name="play" size={22} color="#080B0C" style={{ marginRight: 6 }} />
          <Text style={styles.startButtonText}>Confirmar e Iniciar Viagem</Text>
        </TouchableOpacity>
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
  },
  headerSubtitle: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
  },
  truckIconBadge: {
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
  sectionCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 16,
    gap: 12,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textMuted,
    letterSpacing: 0.8,
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
  labelHint: {
    fontSize: 10,
    color: colors.textDim,
  },
  vehicleSelectBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 12,
    gap: 12,
  },
  vehicleIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.primaryMuted,
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
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  vehicleSubtitle: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
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
  },
  routeContainer: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 14,
  },
  routeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  routeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  routeLine: {
    width: 2,
    height: 16,
    backgroundColor: colors.border,
    marginLeft: 4,
    marginVertical: 4,
  },
  routeFieldLabel: {
    fontSize: 10,
    color: colors.textDim,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  routeInput: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    paddingVertical: 2,
  },
  checklistGrid: {
    gap: 10,
  },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 12,
    gap: 12,
  },
  checklistItemChecked: {
    borderColor: 'rgba(52, 211, 153, 0.4)',
    backgroundColor: 'rgba(16, 185, 129, 0.05)',
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircleChecked: {
    backgroundColor: '#34D399',
    borderColor: '#34D399',
  },
  checkLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
  },
  checkLabelChecked: {
    color: colors.textPrimary,
  },
  checkDesc: {
    fontSize: 10,
    color: colors.textDim,
    marginTop: 1,
  },
  startButton: {
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
  startButtonText: {
    color: '#080B0C',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
});
