import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  StatusBar,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import {
  notificationService,
  DriverNotificationItem,
} from '../services/notification.service';

interface NotificationCenterModalProps {
  visible: boolean;
  onClose: () => void;
  onNavigateToScreen?: (screen: 'fuel' | 'trip' | 'profile' | 'route' | 'sos') => void;
}

export function NotificationCenterModal({
  visible,
  onClose,
  onNavigateToScreen,
}: NotificationCenterModalProps) {
  const [notifications, setNotifications] = useState<DriverNotificationItem[]>([]);

  useEffect(() => {
    if (visible) {
      const unsub = notificationService.subscribe(setNotifications);
      return unsub;
    }
  }, [visible]);

  const handleMarkAllRead = async () => {
    await notificationService.markAllAsRead();
  };

  const handleClearAll = async () => {
    await notificationService.clearAll();
  };

  const handleItemPress = async (item: DriverNotificationItem) => {
    if (!item.read) {
      await notificationService.markAsRead(item.id);
    }
    if (item.actionScreen && onNavigateToScreen) {
      onClose();
      onNavigateToScreen(item.actionScreen);
    }
  };

  const formatTimestamp = (iso: string) => {
    try {
      const d = new Date(iso);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffMins = Math.floor(diffMs / 60000);

      if (diffMins < 1) return 'Agora mesmo';
      if (diffMins < 60) return `Há ${diffMins} min`;

      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `Há ${diffHours}h`;

      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const getIconConfig = (type: DriverNotificationItem['type']) => {
    switch (type) {
      case 'NEW_TRIP':
      case 'TRIP_STARTED':
      case 'TRIP_COMPLETED':
        return { name: 'truck-fast', color: colors.primary, bg: colors.primaryMuted };
      case 'PENDING_RECEIPT':
        return { name: 'gas-station', color: '#FBBF24', bg: 'rgba(251, 191, 36, 0.15)' };
      case 'CNH':
        return { name: 'card-account-details', color: '#F87171', bg: 'rgba(248, 113, 113, 0.15)' };
      case 'ALERT':
        return { name: 'shield-alert', color: '#EF4444', bg: 'rgba(239, 68, 68, 0.15)' };
      default:
        return { name: 'bell-outline', color: '#38BDF8', bg: 'rgba(56, 189, 248, 0.15)' };
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" backgroundColor="#0B0F13" />

        {/* HEADER */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Central de Avisos</Text>
            <Text style={styles.headerSubtitle}>
              {unreadCount > 0 ? `${unreadCount} alerta(s) novo(s)` : 'Tudo em dia'}
            </Text>
          </View>
          {unreadCount > 0 && (
            <TouchableOpacity onPress={handleMarkAllRead} style={styles.markReadBtn} activeOpacity={0.7}>
              <Ionicons name="checkmark-done" size={16} color={colors.primary} />
            </TouchableOpacity>
          )}
        </View>

        {/* CORPO DA LISTA */}
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {notifications.length === 0 ? (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="notifications-off-outline" size={32} color={colors.textMuted} />
              </View>
              <Text style={styles.emptyTitle}>Nenhum aviso no momento</Text>
              <Text style={styles.emptySub}>
                Quando houver viagens atribuídas ou avisos da central, eles aparecerão aqui.
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.listHeaderRow}>
                <Text style={styles.listSectionTitle}>RECENTES</Text>
                <TouchableOpacity onPress={handleClearAll} activeOpacity={0.7}>
                  <Text style={styles.clearAllText}>Limpar Tudo</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.notificationsList}>
                {notifications.map((item) => {
                  const icon = getIconConfig(item.type);

                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[
                        styles.notifCard,
                        !item.read && styles.notifCardUnread,
                      ]}
                      onPress={() => handleItemPress(item)}
                      activeOpacity={0.75}
                    >
                      <View style={[styles.notifIconWrap, { backgroundColor: icon.bg }]}>
                        <MaterialCommunityIcons
                          name={icon.name as any}
                          size={20}
                          color={icon.color}
                        />
                      </View>

                      <View style={styles.notifContent}>
                        <View style={styles.notifTopRow}>
                          <Text
                            style={[
                              styles.notifItemTitle,
                              !item.read && styles.notifItemTitleUnread,
                            ]}
                            numberOfLines={1}
                          >
                            {item.title}
                          </Text>
                          <Text style={styles.notifTime}>{formatTimestamp(item.timestamp)}</Text>
                        </View>

                        <Text style={styles.notifBody}>{item.body}</Text>

                        {item.actionScreen && (
                          <View style={styles.actionPill}>
                            <Text style={styles.actionPillText}>Abrir detalhes</Text>
                            <Ionicons name="chevron-forward" size={10} color={colors.primary} />
                          </View>
                        )}
                      </View>

                      {!item.read && <View style={styles.unreadDot} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1A2128',
    backgroundColor: '#0B0F13',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#161D24',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#7E8B9B',
    marginTop: 2,
  },
  markReadBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  listHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  listSectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.8,
  },
  clearAllText: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
  },
  notificationsList: {
    gap: 10,
  },
  notifCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#0E1318',
    borderWidth: 1,
    borderColor: '#1C2631',
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  notifCardUnread: {
    backgroundColor: '#111822',
    borderColor: 'rgba(255, 122, 0, 0.35)',
  },
  notifIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifContent: {
    flex: 1,
  },
  notifTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  notifItemTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#CBD5E1',
    flex: 1,
  },
  notifItemTitleUnread: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  notifTime: {
    fontSize: 10,
    color: '#64748B',
    marginLeft: 8,
  },
  notifBody: {
    fontSize: 12,
    color: '#94A3B8',
    lineHeight: 17,
  },
  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 2,
  },
  actionPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginTop: 6,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: 20,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#131A22',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
  },
});
