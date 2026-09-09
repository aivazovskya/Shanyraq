import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  SafeAreaView,
  Alert,
  Linking,
  Image,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  ShoppingBag,
  Plus,
  Phone,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Tag,
  User as UserIcon,
  Image as ImageIcon,
} from 'lucide-react-native';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../context/AuthContext';
import { LoadingState } from '../../components/common/LoadingState';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import {
  CommunityBoardApi,
  CommunityListing,
  ListingType,
  ListingStatus,
} from '../../api/community-board';
import { getApiErrorMessage } from '../../api/client';

export const CommunityBoardScreen: React.FC = () => {
  const navigation = useNavigation();
  const { t, i18n } = useTranslation();
  const { user } = useAuth();

  const tenantId = user?.tenantId || (user?.ownerships?.[0] as any)?.unit?.building?.tenantId;
  const verifiedOwnerships = (user?.ownerships || []).filter((o) => o.isVerified);
  const isVerified = verifiedOwnerships.length > 0;

  const [activeTab, setActiveTab] = useState<'FEED' | 'MY'>('FEED');
  const [selectedType, setSelectedType] = useState<ListingType | 'ALL'>('ALL');
  const [feedListings, setFeedListings] = useState<CommunityListing[]>([]);
  const [myListings, setMyListings] = useState<CommunityListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!tenantId) {
      setLoading(false);
      return;
    }

    try {
      if (activeTab === 'FEED') {
        const typeParam = selectedType === 'ALL' ? undefined : selectedType;
        const data = await CommunityBoardApi.getListings(tenantId, typeParam);
        setFeedListings(data || []);
      } else {
        const myData = await CommunityBoardApi.getMyListings();
        setMyListings(myData || []);
      }
    } catch (e: any) {
      console.warn('Failed to load listings:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tenantId, activeTab, selectedType]);

  useEffect(() => {
    setLoading(true);
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleCall = (phone?: string) => {
    if (!phone) {
      Alert.alert(t('common.error'), t('communityBoard.phoneNotAvailable'));
      return;
    }
    Linking.openURL(`tel:${phone}`);
  };

  const handleCloseListing = (item: CommunityListing) => {
    Alert.alert(
      t('communityBoard.closeConfirmTitle'),
      t('communityBoard.closeConfirmMessage', { title: item.title }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('communityBoard.closeAction'),
          style: 'destructive',
          onPress: async () => {
            setActionInProgress(item.id);
            try {
              await CommunityBoardApi.updateListing(item.id, {
                status: 'CLOSED',
              });
              Alert.alert(t('common.success'), t('communityBoard.closeSuccess'));
              loadData();
            } catch (e: any) {
              Alert.alert(t('common.error'), getApiErrorMessage(e));
            } finally {
              setActionInProgress(null);
            }
          },
        },
      ],
    );
  };

  const getTypeLabel = (type: ListingType) => {
    switch (type) {
      case 'SELL':
        return t('communityBoard.typeSell');
      case 'RENT':
        return t('communityBoard.typeRent');
      case 'GIVE_AWAY':
        return t('communityBoard.typeGiveAway');
      case 'OTHER':
      default:
        return t('communityBoard.typeOther');
    }
  };

  const getStatusBadge = (status: ListingStatus) => {
    switch (status) {
      case 'ACTIVE':
        return <Badge label={t('communityBoard.statusActive')} variant="success" />;
      case 'CLOSED':
        return <Badge label={t('communityBoard.statusClosed')} variant="default" />;
      case 'REMOVED':
        return <Badge label={t('communityBoard.statusRemoved')} variant="danger" />;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <ArrowLeft size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('communityBoard.screenTitle')}</Text>
        {isVerified && (
          <TouchableOpacity
            style={styles.createBtn}
            onPress={() => (navigation as any).navigate('CreateListing')}
          >
            <Plus size={18} color="#FFFFFF" />
            <Text style={styles.createBtnText}>{t('communityBoard.postAction')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Verification Warning if unverified */}
      {!isVerified && (
        <View style={styles.unverifiedBanner}>
          <AlertCircle size={20} color={Colors.warning} />
          <Text style={styles.unverifiedText}>
            {t('communityBoard.unverifiedResidentNotice')}
          </Text>
        </View>
      )}

      {/* Tab Selector */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'FEED' && styles.tabButtonActive]}
          onPress={() => setActiveTab('FEED')}
        >
          <Text style={[styles.tabText, activeTab === 'FEED' && styles.tabTextActive]}>
            {t('communityBoard.tabFeed')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'MY' && styles.tabButtonActive]}
          onPress={() => setActiveTab('MY')}
        >
          <Text style={[styles.tabText, activeTab === 'MY' && styles.tabTextActive]}>
            {t('communityBoard.tabMyListings')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Categories Filter (Only on Feed tab) */}
      {activeTab === 'FEED' && (
        <View style={styles.filterScrollView}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            {(['ALL', 'SELL', 'RENT', 'GIVE_AWAY', 'OTHER'] as const).map((cat) => {
              const isActive = selectedType === cat;
              return (
                <TouchableOpacity
                  key={cat}
                  style={[styles.filterChip, isActive && styles.filterChipActive]}
                  onPress={() => setSelectedType(cat)}
                >
                  <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                    {cat === 'ALL' ? t('communityBoard.filterAllTypes') : getTypeLabel(cat)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {loading ? (
        <LoadingState message={t('common.loading')} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[Colors.primary]}
              tintColor={Colors.primary}
            />
          }
        >
          {activeTab === 'FEED' ? (
            feedListings.length === 0 ? (
              <Card style={styles.emptyCard}>
                <ShoppingBag size={48} color={Colors.textMuted} style={styles.emptyIcon} />
                <Text style={styles.emptyTitle}>{t('communityBoard.noListingsTitle')}</Text>
                <Text style={styles.emptySub}>{t('communityBoard.noListingsSub')}</Text>
              </Card>
            ) : (
              feedListings.map((item) => {
                const authorName = item.author
                  ? `${item.author.firstName} ${item.author.lastName}`.trim()
                  : t('communityBoard.authorUnknown');
                const hasPhotos = item.photoUrls && item.photoUrls.length > 0;

                return (
                  <Card key={item.id} style={styles.listingCard}>
                    {hasPhotos ? (
                      <Image
                        source={{ uri: item.photoUrls[0] }}
                        style={styles.cardImage}
                        resizeMode="cover"
                      />
                    ) : null}

                    <View style={styles.cardBody}>
                      <View style={styles.cardHeaderRow}>
                        <View style={styles.typeBadgeContainer}>
                          <Tag size={12} color={Colors.primary} />
                          <Text style={styles.typeBadgeText}>{getTypeLabel(item.type)}</Text>
                        </View>
                        <Text style={styles.cardDate}>
                          {new Date(item.createdAt).toLocaleDateString(i18n.language)}
                        </Text>
                      </View>

                      <Text style={styles.cardTitle}>{item.title}</Text>

                      <Text style={styles.cardPrice}>
                        {item.type === 'GIVE_AWAY'
                          ? t('communityBoard.typeGiveAway')
                          : item.price != null
                          ? `${item.price.toLocaleString(i18n.language)} ₸`
                          : t('communityBoard.priceNegotiable')}
                      </Text>

                      <Text style={styles.cardDesc} numberOfLines={3}>
                        {item.description}
                      </Text>

                      <View style={styles.authorRow}>
                        <View style={styles.authorInfo}>
                          <UserIcon size={14} color={Colors.textMuted} />
                          <Text style={styles.authorName}>{authorName}</Text>
                        </View>

                        {item.author?.phone ? (
                          <TouchableOpacity
                            style={styles.callButton}
                            onPress={() => handleCall(item.author?.phone)}
                          >
                            <Phone size={14} color="#FFFFFF" />
                            <Text style={styles.callButtonText}>{t('communityBoard.callAction')}</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    </View>
                  </Card>
                );
              })
            )
          ) : (
            myListings.length === 0 ? (
              <Card style={styles.emptyCard}>
                <ShoppingBag size={48} color={Colors.textMuted} style={styles.emptyIcon} />
                <Text style={styles.emptyTitle}>{t('communityBoard.noMyListingsTitle')}</Text>
                <Text style={styles.emptySub}>{t('communityBoard.noMyListingsSub')}</Text>
              </Card>
            ) : (
              myListings.map((item) => (
                <Card key={item.id} style={styles.listingCard}>
                  <View style={styles.cardBody}>
                    <View style={styles.cardHeaderRow}>
                      <View style={styles.typeBadgeContainer}>
                        <Text style={styles.typeBadgeText}>{getTypeLabel(item.type)}</Text>
                      </View>
                      {getStatusBadge(item.status)}
                    </View>

                    <Text style={styles.cardTitle}>{item.title}</Text>

                    <Text style={styles.cardPrice}>
                      {item.type === 'GIVE_AWAY'
                        ? t('communityBoard.typeGiveAway')
                        : item.price != null
                        ? `${item.price.toLocaleString(i18n.language)} ₸`
                        : t('communityBoard.priceNegotiable')}
                    </Text>

                    <Text style={styles.cardDesc} numberOfLines={2}>
                      {item.description}
                    </Text>

                    {item.status === 'REMOVED' && item.removedReason ? (
                      <View style={styles.removedNotice}>
                        <XCircle size={14} color={Colors.danger} />
                        <Text style={styles.removedNoticeText}>
                          {t('communityBoard.removedReasonLabel')}: «{item.removedReason}»
                        </Text>
                      </View>
                    ) : null}

                    {item.status === 'ACTIVE' && (
                      <View style={styles.cardActionsRow}>
                        <Button
                          title={t('communityBoard.closeAction')}
                          variant="outline"
                          size="sm"
                          loading={actionInProgress === item.id}
                          onPress={() => handleCloseListing(item)}
                        />
                      </View>
                    )}
                  </View>
                </Card>
              ))
            )
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  createBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  unverifiedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },
  unverifiedText: {
    flex: 1,
    fontSize: 12,
    color: '#92400E',
    lineHeight: 16,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabButtonActive: {
    borderBottomColor: Colors.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  tabTextActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
  filterScrollView: {
    backgroundColor: Colors.card,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  filterRow: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  listingCard: {
    marginBottom: 14,
    padding: 0,
    overflow: 'hidden',
  },
  cardImage: {
    width: '100%',
    height: 180,
    backgroundColor: Colors.border,
  },
  cardBody: {
    padding: 14,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  typeBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
  },
  cardDate: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 4,
  },
  cardPrice: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.primary,
    marginBottom: 6,
  },
  cardDesc: {
    fontSize: 13,
    color: Colors.textMuted,
    lineHeight: 18,
    marginBottom: 12,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  authorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  authorName: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
  },
  callButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.success,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  callButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  removedNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    padding: 8,
    borderRadius: 6,
    gap: 6,
    marginTop: 8,
  },
  removedNoticeText: {
    flex: 1,
    fontSize: 12,
    color: Colors.danger,
    fontStyle: 'italic',
  },
  cardActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  emptyCard: {
    padding: 32,
    alignItems: 'center',
    marginTop: 24,
  },
  emptyIcon: {
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 4,
  },
  emptySub: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
  },
});
