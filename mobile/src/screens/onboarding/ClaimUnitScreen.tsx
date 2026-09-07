import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import {
  PropertiesApi,
  TenantSearchResult,
  TenantStructureResponse,
  UnitInfo,
} from '../../api/properties';
import { getApiErrorMessage } from '../../api/client';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Colors } from '../../constants/colors';
import {
  Search,
  Building,
  CheckCircle2,
  Clock,
  LogOut,
  ChevronRight,
} from 'lucide-react-native';

export const ClaimUnitScreen: React.FC = () => {
  const { user, refreshProfile, logout } = useAuth();

  // Search & structure state
  const [searchQuery, setSearchQuery] = useState('');
  const [tenants, setTenants] = useState<TenantSearchResult[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<TenantSearchResult | null>(null);
  const [structure, setStructure] = useState<TenantStructureResponse | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<UnitInfo | null>(null);

  // Form state
  const [ownershipType, setOwnershipType] = useState<'OWNER' | 'TENANT'>('OWNER');
  const [sharePercent, setSharePercent] = useState('100');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Existing claim status
  const existingOwnership = user?.ownerships && user.ownerships.length > 0 ? user.ownerships[0] : null;

  useEffect(() => {
    // Initial search
    searchTenants('');
  }, []);

  const searchTenants = async (q: string) => {
    try {
      const results = await PropertiesApi.searchTenants(q);
      setTenants(results);
    } catch (err) {
      console.warn('Search tenants error:', err);
    }
  };

  const handleSelectTenant = async (t: TenantSearchResult) => {
    setSelectedTenant(t);
    setSelectedUnit(null);
    try {
      const struct = await PropertiesApi.getTenantStructure(t.id);
      setStructure(struct);
    } catch (err: any) {
      Alert.alert('Ошибка', getApiErrorMessage(err));
    }
  };

  const handleSubmitClaim = async () => {
    if (!selectedUnit) {
      setError('Пожалуйста, выберите вашу квартиру из списка');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      await PropertiesApi.claimOwnership({
        unitId: selectedUnit.id,
        ownershipType,
        sharePercent: ownershipType === 'OWNER' ? parseFloat(sharePercent) || 100 : undefined,
      });

      await refreshProfile();
      Alert.alert('Успешно', 'Заявка на привязку квартиры отправлена на рассмотрение в УК!');
    } catch (err: any) {
      setError(getApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  // State 2: Claim already submitted and Pending Verification
  if (existingOwnership && !existingOwnership.isVerified) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.statusWrapper}>
          <View style={styles.iconContainerYellow}>
            <Clock color="#D97706" size={48} />
          </View>
          <Text style={styles.statusTitle}>Заявка на рассмотрении УК</Text>
          <Text style={styles.statusSubtitle}>
            Вы подали заявку на привязку квартиры №{existingOwnership.unit?.unitNumber} (
            {existingOwnership.unit?.building?.blockName || 'ЖК'}).
          </Text>

          <Card style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Статус:</Text>
              <Badge label="На проверке" variant="warning" />
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Тип владения:</Text>
              <Text style={styles.infoValue}>
                {existingOwnership.ownershipType === 'OWNER' ? 'Собственник' : 'Арендатор'}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Площадь:</Text>
              <Text style={styles.infoValue}>{existingOwnership.unit?.area} м²</Text>
            </View>
          </Card>

          <Text style={styles.warningNotice}>
            До подтверждения прав управляющей компанией доступ к открытию шлагбаумов, камерам и
            голосованиям ОСС ограничен в целях безопасности жителей.
          </Text>

          <View style={styles.actionsBlock}>
            <Button
              title="Обновить статус"
              onPress={refreshProfile}
              variant="primary"
              size="lg"
            />
            <Button
              title="Выйти из аккаунта"
              onPress={logout}
              variant="outline"
              size="md"
              icon={<LogOut color={Colors.primary} size={18} />}
              style={styles.logoutBtn}
            />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // State 1: Claim form
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.topHeader}>
          <Text style={styles.headerTitle}>Привязка квартиры</Text>
          <Text style={styles.headerSubtitle}>
            Для доступа к функциям ЖК выберите ваш дом и номер квартиры
          </Text>
        </View>

        {/* Step 1: Complex search */}
        <Text style={styles.sectionHeading}>1. Выберите жилой комплекс</Text>
        <Input
          placeholder="Поиск по названию или адресу..."
          value={searchQuery}
          onChangeText={(val) => {
            setSearchQuery(val);
            searchTenants(val);
          }}
          leftIcon={<Search color={Colors.textMuted} size={18} />}
        />

        {tenants.map((t) => (
          <TouchableOpacity
            key={t.id}
            style={[
              styles.tenantItem,
              selectedTenant?.id === t.id && styles.tenantItemSelected,
            ]}
            onPress={() => handleSelectTenant(t)}
          >
            <Building
              color={selectedTenant?.id === t.id ? Colors.primary : Colors.textMuted}
              size={24}
            />
            <View style={styles.tenantInfo}>
              <Text style={styles.tenantName}>{t.name}</Text>
              <Text style={styles.tenantAddress}>
                {t.city}, {t.address}
              </Text>
            </View>
            <ChevronRight color={Colors.textLight} size={20} />
          </TouchableOpacity>
        ))}

        {/* Step 2: Building & Unit selection */}
        {structure && (
          <View style={styles.stepBlock}>
            <Text style={styles.sectionHeading}>2. Выберите квартиру</Text>
            {structure.buildings.map((b) => (
              <View key={b.id} style={styles.buildingSection}>
                <Text style={styles.buildingName}>{b.blockName}</Text>
                <View style={styles.unitsGrid}>
                  {b.units.map((u) => {
                    const isSelected = selectedUnit?.id === u.id;
                    return (
                      <TouchableOpacity
                        key={u.id}
                        style={[
                          styles.unitChip,
                          isSelected && styles.unitChipSelected,
                        ]}
                        onPress={() => setSelectedUnit(u)}
                      >
                        <Text
                          style={[
                            styles.unitChipText,
                            isSelected && styles.unitChipTextSelected,
                          ]}
                        >
                          кв. {u.unitNumber}
                        </Text>
                        <Text
                          style={[
                            styles.unitAreaText,
                            isSelected && styles.unitAreaTextSelected,
                          ]}
                        >
                          {u.area} м²
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Step 3: Ownership role */}
        {selectedUnit && (
          <View style={styles.stepBlock}>
            <Text style={styles.sectionHeading}>3. Тип владения</Text>
            <View style={styles.roleTabs}>
              <TouchableOpacity
                style={[
                  styles.roleTab,
                  ownershipType === 'OWNER' && styles.roleTabActive,
                ]}
                onPress={() => setOwnershipType('OWNER')}
              >
                <Text
                  style={[
                    styles.roleTabText,
                    ownershipType === 'OWNER' && styles.roleTabTextActive,
                  ]}
                >
                  Собственник
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.roleTab,
                  ownershipType === 'TENANT' && styles.roleTabActive,
                ]}
                onPress={() => setOwnershipType('TENANT')}
              >
                <Text
                  style={[
                    styles.roleTabText,
                    ownershipType === 'TENANT' && styles.roleTabTextActive,
                  ]}
                >
                  Арендатор
                </Text>
              </TouchableOpacity>
            </View>

            {ownershipType === 'OWNER' && (
              <Input
                label="Доля собственности (%)"
                value={sharePercent}
                onChangeText={setSharePercent}
                keyboardType="numeric"
                helper="По умолчанию 100%, если владеете квартирой полностью"
              />
            )}

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <Button
              title="Отправить заявку в УК"
              onPress={handleSubmitClaim}
              loading={submitting}
              size="lg"
              style={styles.submitBtn}
            />
          </View>
        )}
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
    padding: 20,
    paddingBottom: 40,
  },
  topHeader: {
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.text,
  },
  headerSubtitle: {
    fontSize: 14,
    color: Colors.textMuted,
    marginTop: 4,
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 12,
    marginTop: 16,
  },
  tenantItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.border,
    marginBottom: 10,
    gap: 12,
  },
  tenantItemSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryBg,
  },
  tenantInfo: {
    flex: 1,
  },
  tenantName: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  tenantAddress: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 2,
  },
  stepBlock: {
    marginTop: 16,
  },
  buildingSection: {
    marginBottom: 16,
  },
  buildingName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textMuted,
    marginBottom: 8,
  },
  unitsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  unitChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  unitChipSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  unitChipText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  unitChipTextSelected: {
    color: '#FFFFFF',
  },
  unitAreaText: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  unitAreaTextSelected: {
    color: '#D1FAE5',
  },
  roleTabs: {
    flexDirection: 'row',
    backgroundColor: Colors.border,
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  roleTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  roleTabActive: {
    backgroundColor: Colors.surface,
  },
  roleTabText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  roleTabTextActive: {
    color: Colors.text,
  },
  submitBtn: {
    marginTop: 12,
  },
  errorText: {
    color: Colors.danger,
    fontSize: 13,
    marginBottom: 10,
  },
  statusWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  iconContainerYellow: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  statusTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
  },
  statusSubtitle: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
    maxWidth: 300,
  },
  infoCard: {
    width: '100%',
    marginTop: 24,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  infoLabel: {
    fontSize: 14,
    color: Colors.textMuted,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  warningNotice: {
    fontSize: 13,
    color: '#92400E',
    backgroundColor: '#FEF3C7',
    padding: 14,
    borderRadius: 12,
    marginTop: 16,
    lineHeight: 18,
    textAlign: 'center',
  },
  actionsBlock: {
    width: '100%',
    marginTop: 24,
    gap: 12,
  },
  logoutBtn: {
    marginTop: 4,
  },
});
