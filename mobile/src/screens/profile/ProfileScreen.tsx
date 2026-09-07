import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { Colors } from '../../constants/colors';
import {
  User,
  Phone,
  Home,
  ShieldCheck,
  LogOut,
  PlusCircle,
  Bell,
} from 'lucide-react-native';

export const ProfileScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { user, logout } = useAuth();

  const handleConfirmLogout = () => {
    Alert.alert(
      'Выход из аккаунта',
      'Вы уверены, что хотите выйти? Сессия будет отозвана на сервере.',
      [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Выйти', style: 'destructive', onPress: logout },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>Профиль жильца</Text>
        </View>

        {/* User Card */}
        <Card style={styles.userCard}>
          <View style={styles.userRow}>
            <View style={styles.avatarCircle}>
              <User color="#FFFFFF" size={36} />
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.userName}>
                {user?.firstName} {user?.lastName}
              </Text>
              <View style={styles.phoneRow}>
                <Phone color={Colors.textMuted} size={14} />
                <Text style={styles.userPhone}>{user?.phone}</Text>
              </View>
            </View>
          </View>
        </Card>

        {/* Housing Units (Ownerships) */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeading}>Мои объекты ({user?.ownerships?.length || 0})</Text>
          <Button
            title="+ Добавить"
            onPress={() => navigation.navigate('ClaimUnit')}
            variant="outline"
            size="sm"
          />
        </View>

        {user?.ownerships && user.ownerships.length > 0 ? (
          user.ownerships.map((o) => (
            <Card key={o.id} style={styles.propertyCard}>
              <View style={styles.propertyHeader}>
                <View style={styles.propertyTitleRow}>
                  <Home color={Colors.primary} size={20} />
                  <Text style={styles.propertyTitle}>
                    кв. {o.unit?.unitNumber}
                  </Text>
                </View>
                <Badge
                  label={o.isVerified ? 'Подтверждено' : 'На рассмотрении'}
                  variant={o.isVerified ? 'success' : 'warning'}
                />
              </View>

              <Text style={styles.complexName}>
                {user.tenant?.name || 'ЖК Шаңырақ'} • {o.unit?.building?.blockName || 'Блок А'}
              </Text>

              <View style={styles.propertyMeta}>
                <Text style={styles.metaLabel}>
                  Тип: <Text style={styles.metaValue}>{o.ownershipType === 'OWNER' ? 'Собственник' : 'Арендатор'}</Text>
                </Text>
                <Text style={styles.metaLabel}>
                  Площадь: <Text style={styles.metaValue}>{o.unit?.area} м²</Text>
                </Text>
                <Text style={styles.metaLabel}>
                  Доля: <Text style={styles.metaValue}>{o.sharePercent}%</Text>
                </Text>
              </View>
            </Card>
          ))
        ) : (
          <Card style={styles.emptyCard}>
            <Text style={styles.emptyText}>У вас нет привязанных квартир</Text>
          </Card>
        )}

        {/* Security & System Info */}
        <Text style={styles.sectionHeading}>Безопасность и уведомления</Text>
        <Card style={styles.settingsCard}>
          <View style={styles.settingItem}>
            <Bell color={Colors.primary} size={20} />
            <View style={{ flex: 1 }}>
              <Text style={styles.settingTitle}>Push-уведомления</Text>
              <Text style={styles.settingSub}>Оповещения об авариях и статусе заявок</Text>
            </View>
            <Badge label="Активно" variant="success" />
          </View>

          <View style={styles.separator} />

          <View style={styles.settingItem}>
            <ShieldCheck color={Colors.primary} size={20} />
            <View style={{ flex: 1 }}>
              <Text style={styles.settingTitle}>Цифровая подпись голоса</Text>
              <Text style={styles.settingSub}>SMS-OTP HMAC-SHA256 подтверждение волеизъявления</Text>
            </View>
            <Badge label="Включено" variant="info" />
          </View>
        </Card>

        {/* Logout Button */}
        <Button
          title="Выйти из аккаунта"
          onPress={handleConfirmLogout}
          variant="danger"
          size="lg"
          icon={<LogOut color="#FFFFFF" size={20} />}
          style={styles.logoutButton}
        />

        <Text style={styles.versionText}>Версия приложения 1.0.0 (Build 2026)</Text>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 16,
    marginTop: 4,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.text,
  },
  userCard: {
    marginBottom: 16,
    padding: 20,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  avatarCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  userPhone: {
    fontSize: 14,
    color: Colors.textMuted,
  },
  sectionHeading: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 12,
    marginTop: 16,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 10,
  },
  propertyCard: {
    marginBottom: 10,
  },
  propertyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  propertyTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  propertyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text,
  },
  complexName: {
    fontSize: 13,
    color: Colors.textMuted,
    marginBottom: 10,
  },
  propertyMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  metaLabel: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  metaValue: {
    fontWeight: '700',
    color: Colors.text,
  },
  settingsCard: {
    marginBottom: 24,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 6,
  },
  settingTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  settingSub: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  separator: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 10,
  },
  logoutButton: {
    marginTop: 8,
  },
  versionText: {
    fontSize: 12,
    color: Colors.textLight,
    textAlign: 'center',
    marginTop: 20,
  },
  emptyCard: {
    padding: 16,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: Colors.textMuted,
  },
});
