import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  StatusBar,
  Alert,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { api } from '../services/api.service';
import { ChecklistItem, TripChecklistDTO } from '../types/driver';

interface ChecklistScreenProps {
  onBack: () => void;
  onSuccess?: () => void;
  activeTrip?: any;
}

interface ChecklistTemplate {
  id: string;
  label: string;
  category: 'SEGURANCA' | 'ILUMINACAO' | 'MECANICA' | 'FLUIDOS' | 'DOCUMENTOS';
  categoryLabel: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
}

const TEMPLATE_ITEMS: ChecklistTemplate[] = [
  // SEGURANÇA
  {
    id: 'tires',
    label: 'Pneus e Calibragem (incluindo estepe)',
    category: 'SEGURANCA',
    categoryLabel: 'Segurança & Rodagem',
    icon: 'car-tire-alert',
  },
  {
    id: 'brakes',
    label: 'Freio de Serviço e Estacionamento',
    category: 'SEGURANCA',
    categoryLabel: 'Segurança & Rodagem',
    icon: 'car-brake-alert',
  },
  {
    id: 'belts_extinguisher',
    label: 'Cintos de Segurança e Extintor de Incêndio',
    category: 'SEGURANCA',
    categoryLabel: 'Segurança & Rodagem',
    icon: 'shield-check',
  },
  // ILUMINAÇÃO
  {
    id: 'headlights',
    label: 'Faróis Alto / Baixo e Lanternas',
    category: 'ILUMINACAO',
    categoryLabel: 'Iluminação & Sinalização',
    icon: 'car-light-high',
  },
  {
    id: 'turn_signals',
    label: 'Setas de Direção e Pisca-Alerta',
    category: 'ILUMINACAO',
    categoryLabel: 'Iluminação & Sinalização',
    icon: 'hazard-lights',
  },
  {
    id: 'brake_lights',
    label: 'Luzes de Freio e Marcha Ré',
    category: 'ILUMINACAO',
    categoryLabel: 'Iluminação & Sinalização',
    icon: 'car-light-dimmed',
  },
  // FLUIDOS & MOTOR
  {
    id: 'engine_oil',
    label: 'Nível do Óleo do Motor',
    category: 'FLUIDOS',
    categoryLabel: 'Fluidos & Mecânica',
    icon: 'oil',
  },
  {
    id: 'coolant',
    label: 'Líquido de Arrefecimento (Radiador)',
    category: 'FLUIDOS',
    categoryLabel: 'Fluidos & Mecânica',
    icon: 'coolant-temperature',
  },
  {
    id: 'windshield_fluid',
    label: 'Palhetas e Água do Para-brisa',
    category: 'FLUIDOS',
    categoryLabel: 'Fluidos & Mecânica',
    icon: 'wiper',
  },
  // DOCUMENTOS & EQUIPAMENTOS
  {
    id: 'documents',
    label: 'CRLV do Veículo e Disco de Tacógrafo',
    category: 'DOCUMENTOS',
    categoryLabel: 'Documentos & Cabine',
    icon: 'file-document-check-outline',
  },
  {
    id: 'tools_jack',
    label: 'Macaco, Triângulo e Chave de Roda',
    category: 'DOCUMENTOS',
    categoryLabel: 'Documentos & Cabine',
    icon: 'toolbox-outline',
  },
];

export function ChecklistScreen({ onBack, onSuccess, activeTrip }: ChecklistScreenProps) {
  const [items, setItems] = useState<Record<string, { status: 'OK' | 'DEFECT' | 'NOT_APPLICABLE'; notes: string }>>(
    () => {
      const initial: Record<string, { status: 'OK' | 'DEFECT' | 'NOT_APPLICABLE'; notes: string }> = {};
      TEMPLATE_ITEMS.forEach((it) => {
        initial[it.id] = { status: 'OK', notes: '' };
      });
      return initial;
    }
  );

  const [generalNotes, setGeneralNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const setItemStatus = (id: string, status: 'OK' | 'DEFECT' | 'NOT_APPLICABLE') => {
    setItems((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        status,
      },
    }));
  };

  const setItemNotes = (id: string, notes: string) => {
    setItems((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        notes,
      },
    }));
  };

  const markAllOk = () => {
    setItems((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((key) => {
        next[key] = { ...next[key], status: 'OK' };
      });
      return next;
    });
  };

  const hasDefects = Object.values(items).some((it) => it.status === 'DEFECT');
  const totalItems = TEMPLATE_ITEMS.length;
  const okCount = Object.values(items).filter((it) => it.status === 'OK').length;
  const defectCount = Object.values(items).filter((it) => it.status === 'DEFECT').length;

  const handleSaveChecklist = async () => {
    const tripId = activeTrip?.id || 'trip_current_1';

    setSubmitting(true);
    try {
      const checklistPayload: TripChecklistDTO = {
        tripId,
        items: TEMPLATE_ITEMS.map((tmpl) => ({
          id: tmpl.id,
          label: tmpl.label,
          category: tmpl.category,
          status: items[tmpl.id].status,
          notes: items[tmpl.id].notes || undefined,
        })),
        notes: generalNotes.trim() || undefined,
        allApproved: !hasDefects,
        vehiclePlate: activeTrip?.vehicle?.plate || '---',
      };

      const result = await api.saveChecklist(tripId, checklistPayload);

      Alert.alert(
        hasDefects ? '⚠️ Checklist Salvo com Ressalvas' : '✅ Checklist Conforme!',
        hasDefects
          ? `${defectCount} item(ns) foram marcados com não-conformidade. A equipe de manutenção foi alertada.`
          : 'Todos os itens foram inspecionados com sucesso. Tenha uma excelente e segura viagem!',
        [
          {
            text: 'Concluir',
            onPress: () => {
              if (onSuccess) onSuccess();
              onBack();
            },
          },
        ]
      );
    } catch (err: any) {
      Alert.alert('Erro ao Salvar', err.message || 'Falha ao transmitir o checklist veicular.');
    } finally {
      setSubmitting(false);
    }
  };

  // Agrupamento por categorias
  const categories = [
    { key: 'SEGURANCA', label: 'Segurança & Rodagem' },
    { key: 'ILUMINACAO', label: 'Iluminação & Sinalização' },
    { key: 'FLUIDOS', label: 'Fluidos & Mecânica' },
    { key: 'DOCUMENTOS', label: 'Documentos & Cabine' },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#0B0E11" />

      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton} activeOpacity={0.7}>
          <Ionicons name="close" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
        <View style={styles.headerTitles}>
          <Text style={styles.headerTitle}>Checklist Pré-Viagem</Text>
          <Text style={styles.headerSubtitle}>
            {activeTrip?.vehicle?.plate ? `Veículo ${activeTrip.vehicle.plate}` : 'Inspeção diária de conformidade'}
          </Text>
        </View>
        <TouchableOpacity style={styles.markAllBtn} onPress={markAllOk} activeOpacity={0.8}>
          <Ionicons name="checkmark-done" size={16} color={colors.primary} />
          <Text style={styles.markAllText}>Todos OK</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* RESUMO DE CONFORMIDADE */}
        <View style={styles.summaryBar}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{totalItems}</Text>
            <Text style={styles.summaryLabel}>Itens Totais</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: '#22C55E' }]}>{okCount}</Text>
            <Text style={styles.summaryLabel}>Conformes</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: defectCount > 0 ? '#EF4444' : '#64748B' }]}>
              {defectCount}
            </Text>
            <Text style={styles.summaryLabel}>Não-Conforme</Text>
          </View>
        </View>

        {/* LISTAGEM DOS ITENS POR CATEGORIA */}
        {categories.map((cat) => {
          const categoryItems = TEMPLATE_ITEMS.filter((it) => it.category === cat.key);
          if (categoryItems.length === 0) return null;

          return (
            <View key={cat.key} style={styles.categorySection}>
              <Text style={styles.categoryHeaderTitle}>{cat.label.toUpperCase()}</Text>

              {categoryItems.map((item) => {
                const current = items[item.id];
                const isOk = current.status === 'OK';
                const isDefect = current.status === 'DEFECT';
                const isNA = current.status === 'NOT_APPLICABLE';

                return (
                  <View key={item.id} style={styles.itemCard}>
                    <View style={styles.itemHeaderRow}>
                      <View style={styles.itemIconWrap}>
                        <MaterialCommunityIcons
                          name={item.icon}
                          size={20}
                          color={isDefect ? '#EF4444' : isOk ? '#22C55E' : '#94A3B8'}
                        />
                      </View>
                      <Text style={styles.itemLabel}>{item.label}</Text>
                    </View>

                    {/* SELETORES DE STATUS: OK / DEFEITO / N/A */}
                    <View style={styles.statusButtonsRow}>
                      <TouchableOpacity
                        style={[styles.statusBtn, isOk && styles.statusBtnOk]}
                        onPress={() => setItemStatus(item.id, 'OK')}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name={isOk ? 'checkmark-circle' : 'checkmark-circle-outline'}
                          size={16}
                          color={isOk ? '#22C55E' : '#64748B'}
                        />
                        <Text style={[styles.statusBtnText, isOk && styles.statusBtnTextOk]}>
                          Conforme
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.statusBtn, isDefect && styles.statusBtnDefect]}
                        onPress={() => setItemStatus(item.id, 'DEFECT')}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name={isDefect ? 'alert-circle' : 'alert-circle-outline'}
                          size={16}
                          color={isDefect ? '#EF4444' : '#64748B'}
                        />
                        <Text style={[styles.statusBtnText, isDefect && styles.statusBtnTextDefect]}>
                          Avaria / Defeito
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.statusBtn, isNA && styles.statusBtnNA]}
                        onPress={() => setItemStatus(item.id, 'NOT_APPLICABLE')}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.statusBtnText, isNA && styles.statusBtnTextNA]}>
                          N/A
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* CAMPO DE OBSERVAÇÃO QUANDO FOR DEFEITO */}
                    {isDefect && (
                      <View style={styles.defectInputWrap}>
                        <TextInput
                          style={styles.defectInput}
                          placeholder="Descreva o problema ou avaria identificada..."
                          placeholderTextColor="#64748B"
                          value={current.notes}
                          onChangeText={(txt) => setItemNotes(item.id, txt)}
                        />
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          );
        })}

        {/* OBSERVAÇÕES GERAIS */}
        <Text style={styles.categoryHeaderTitle}>OBSERVAÇÕES ADICIONAIS</Text>
        <View style={styles.generalNotesBox}>
          <TextInput
            style={styles.generalNotesInput}
            placeholder="Alguma ressalva geral sobre a carga, cabine ou documentação?"
            placeholderTextColor="#64748B"
            multiline
            numberOfLines={3}
            value={generalNotes}
            onChangeText={setGeneralNotes}
            textAlignVertical="top"
          />
        </View>

        {/* BOTÃO DE SALVAR */}
        <TouchableOpacity
          style={[styles.saveButton, submitting && { opacity: 0.7 }]}
          onPress={handleSaveChecklist}
          disabled={submitting}
          activeOpacity={0.8}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <>
              <MaterialCommunityIcons name="checkbox-marked-circle-outline" size={22} color="#FFFFFF" />
              <Text style={styles.saveButtonText}>SALVAR & ASSINAR INSPEÇÃO</Text>
            </>
          )}
        </TouchableOpacity>
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
  markAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryMuted,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    gap: 4,
  },
  markAllText: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 12,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  summaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0E1318',
    borderWidth: 1,
    borderColor: '#1C2631',
    borderRadius: 14,
    paddingVertical: 14,
    marginBottom: 20,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  summaryLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 2,
  },
  divider: {
    width: 1,
    height: 24,
    backgroundColor: '#1C2631',
  },
  categorySection: {
    marginBottom: 20,
  },
  categoryHeaderTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#8A99AD',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  itemCard: {
    backgroundColor: '#0E1318',
    borderWidth: 1,
    borderColor: '#1C2631',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  itemHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  itemIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#161E27',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#E2E8F0',
  },
  statusButtonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statusBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#131A22',
    borderWidth: 1,
    borderColor: '#1F2A38',
    borderRadius: 8,
    paddingVertical: 8,
    gap: 4,
  },
  statusBtnOk: {
    backgroundColor: '#163321',
    borderColor: '#22C55E',
  },
  statusBtnDefect: {
    backgroundColor: '#371818',
    borderColor: '#EF4444',
  },
  statusBtnNA: {
    backgroundColor: '#1E2530',
    borderColor: '#334155',
  },
  statusBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  statusBtnTextOk: {
    color: '#22C55E',
  },
  statusBtnTextDefect: {
    color: '#EF4444',
  },
  statusBtnTextNA: {
    color: '#94A3B8',
  },
  defectInputWrap: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#261C1C',
    paddingTop: 8,
  },
  defectInput: {
    backgroundColor: '#1C1515',
    borderWidth: 1,
    borderColor: '#EF444450',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    color: '#FFFFFF',
    fontSize: 12,
  },
  generalNotesBox: {
    backgroundColor: '#0E1318',
    borderWidth: 1,
    borderColor: '#1C2631',
    borderRadius: 14,
    padding: 12,
    marginBottom: 20,
  },
  generalNotesInput: {
    color: '#FFFFFF',
    fontSize: 13,
    minHeight: 70,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    gap: 10,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
});
