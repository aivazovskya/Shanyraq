import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Linking,
  Image,
  Alert,
  TextInput,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChevronLeft,
  ShoppingBag,
  Plus,
  Phone,
  Clock,
  AlertCircle,
  Tag,
  User as UserIcon,
  Search,
  X,
  XCircle,
} from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeContext';
import * as Haptics from 'expo-haptics';
import { safeHaptic } from '../../lib/haptics';
import {
  Card,
  Badge,
  Button,
  SegmentedControl,
  SkeletonList,
  EmptyState,
  ErrorState,
  AnimatedEntrance,
} from '../../components/ui';
import {
  CommunityBoardApi,
  CommunityListing,
  ListingType,
  ListingStatus,
} from '../../api/community-board';
import { getApiErrorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

export const CommunityBoardScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const tenantId = user?.tenantId || (user?.ownerships?.[0] as any)?.unit?.building?.tenantId;
  const verifiedOwnerships = (user?.ownerships || []).filter((o) => o.isVerified);
  const isVerified = verifiedOwnerships.length > 0;

  const [activeTab, setActiveTab] = useState<'FEED' | 'MY'>('FEED');
  const [selectedType, setSelectedType] = useState<ListingType | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [feedListings, setFeedListings] = useState<CommunityListing[]>([]);
  const [myListings, setMyListings] = useState<CommunityListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!tenantId) {
      setLoading(false);
      return;
    }

    try {
      setError(null);
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
      setError(e?.response?.data?.message || e.message || t('common.error'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tenantId, activeTab, selectedType, t]);

  useEffect(() => {
    setLoading(true);
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    safeHaptic.selection();
    loadData();
  };

  const handleCall = (phone?: string) => {
    safeHaptic.selection();
    if (!phone) {
      Alert.alert(t('common.error'), t('communityBoard.phoneNotAvailable'));
      return;
    }
    Linking.openURL(`tel:${phone}`);
  };

  const handleCloseListing = (item: CommunityListing) => {
    safeHaptic.selection();
    const doClose = async () => {
      setActionInProgress(item.id);
      try {
        await CommunityBoardApi.updateListing(item.id, {
          status: 'CLOSED',
        });
        safeHaptic.notification(Haptics.NotificationFeedbackType.Success);
        Alert.alert(t('common.success'), t('communityBoard.closeSuccess'));
        loadData();
      } catch (e: any) {
        Alert.alert(t('common.error'), getApiErrorMessage(e));
      } finally {
        setActionInProgress(null);
      }
    };

    if (Platform.OS === 'web') {
      doClose();
      return;
    }

    Alert.alert(
      t('communityBoard.closeConfirmTitle'),
      t('communityBoard.closeConfirmMessage', { title: item.title }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('communityBoard.closeAction'),
          style: 'destructive',
          onPress: doClose,
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

  const getTypeBadgeVariant = (type: ListingType) => {
    switch (type) {
      case 'SELL':
        return 'primary';
      case 'RENT':
        return 'info';
      case 'GIVE_AWAY':
        return 'success';
      case 'OTHER':
      default:
        return 'neutral';
    }
  };

  const getStatusBadge = (status: ListingStatus) => {
    switch (status) {
      case 'ACTIVE':
        return <Badge label={t('communityBoard.statusActive')} variant="success" size="sm" />;
      case 'CLOSED':
        return <Badge label={t('communityBoard.statusClosed')} variant="neutral" size="sm" />;
      case 'REMOVED':
        return <Badge label={t('communityBoard.statusRemoved')} variant="danger" size="sm" />;
      case 'ARCHIVED':
        return <Badge label={t('communityBoard.statusArchived')} variant="info" size="sm" />;
    }
  };

  // Filter listings by search query
  const filteredFeedListings = useMemo(() => {
    if (!searchQuery.trim()) return feedListings;
    const query = searchQuery.toLowerCase().trim();
    return feedListings.filter(
      (item) =>
        item.title.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query),
    );
  }, [feedListings, searchQuery]);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Top Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: Math.max(insets.top, 16) + 4,
            borderBottomColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
          },
        ]}
      >
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            safeHaptic.selection();
            navigation.goBack();
          }}
          accessibilityRole="button"
          accessibilityLabel={t('common.back', 'Назад')}
        >
          <ChevronLeft color={theme.colors.text} size={24} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
          {t('communityBoard.screenTitle')}
        </Text>
        {isVerified ? (
          <Button
            title={t('communityBoard.postAction')}
            onPress={() => {
              safeHaptic.selection();
              navigation.navigate('CreateListing');
            }}
            variant="primary"
            size="sm"
            leftIcon={<Plus color={theme.colors.onPrimary} size={15} />}
          />
        ) : (
          <View style={styles.headerRightPlaceholder} />
        )}
      </View>

      {/* Unverified resident warning banner */}
      {!isVerified && (
        <View
          style={[
            styles.unverifiedBanner,
            {
              backgroundColor: theme.colors.warningBg,
              borderColor: theme.colors.warningBorder,
            },
          ]}
        >
          <AlertCircle color={theme.colors.warning} size={18} />
          <Text style={[styles.unverifiedText, { color: theme.colors.text }]}>
            {t('communityBoard.unverifiedResidentNotice')}
          </Text>
        </View>
      )}

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <SegmentedControl
          options={[
            { value: 'FEED', label: t('communityBoard.tabFeed') },
            {
              value: 'MY',
              label: `${t('communityBoard.tabMyListings')} (${myListings.length})`,
            },
          ]}
          value={activeTab}
          onChange={(v) => {
            safeHaptic.selection();
            setActiveTab(v as 'FEED' | 'MY');
          }}
        />
      </View>

      {/* Search Input Bar (only on Feed tab) */}
      {activeTab === 'FEED' && (
        <View style={styles.searchBarWrapper}>
          <View
            style={[
              styles.searchBar,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <Search color={theme.colors.textMuted} size={18} style={styles.searchIcon} />
            <TextInput
              style={[styles.searchInput, { color: theme.colors.text }]}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={t('communityBoard.searchPlaceholder')}
              placeholderTextColor={theme.colors.textLight}
              accessibilityLabel={t('communityBoard.searchPlaceholder')}
            />
            {Boolean(searchQuery) && (
              <TouchableOpacity
                onPress={() => {
                  safeHaptic.selection();
                  setSearchQuery('');
                }}
                style={styles.searchClearBtn}
                accessibilityRole="button"
                accessibilityLabel={t('common.clear', 'Очистить')}
              >
                <X color={theme.colors.textMuted} size={16} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Category Filter Chips (only on Feed tab) */}
      {activeTab === 'FEED' && (
        <View style={styles.filterScrollView}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            {(['ALL', 'SELL', 'RENT', 'GIVE_AWAY', 'OTHER'] as const).map((cat) => {
              const isActive = selectedType === cat;
              return (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.filterChip,
                    {
                      backgroundColor: isActive ? theme.colors.primary : theme.colors.surface,
                      borderColor: isActive ? theme.colors.primary : theme.colors.border,
                    },
                  ]}
                  onPress={() => {
                    safeHaptic.selection();
                    setSelectedType(cat);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  accessibilityLabel={cat === 'ALL' ? t('communityBoard.filterAllTypes') : getTypeLabel(cat)}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      {
                        color: isActive ? theme.colors.onPrimary : theme.colors.textMuted,
                        fontWeight: isActive ? '700' : '600',
                      },
                    ]}
                  >
                    {cat === 'ALL' ? t('communityBoard.filterAllTypes') : getTypeLabel(cat)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={[styles.contentContainer, { paddingBottom: Math.max(insets.bottom, 24) + 32 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
          />
        }
      >
        {loading ? (
          <View style={styles.skeletonWrap}>
            <SkeletonList count={3} />
          </View>
        ) : error ? (
          <ErrorState message={error} onRetry={loadData} />
        ) : (
          <AnimatedEntrance>
            {activeTab === 'FEED' ? (
              filteredFeedListings.length === 0 ? (
                <EmptyState
                  title={
                    searchQuery
                      ? t('communityBoard.noSearchResultsTitle')
                      : t('communityBoard.noListingsTitle')
                  }
                  description={
                    searchQuery
                      ? t('communityBoard.noSearchResultsSub')
                      : t('communityBoard.noListingsSub')
                  }
                  actionTitle={isVerified ? t('communityBoard.postAction') : undefined}
                  onActionPress={isVerified ? () => navigation.navigate('CreateListing') : undefined}
                />
              ) : (
                filteredFeedListings.map((item) => {
                  const authorName = item.author
                    ? `${item.author.firstName} ${item.author.lastName}`.trim()
                    : t('communityBoard.authorUnknown');
                  const hasPhotos = item.photoUrls && item.photoUrls.length > 0;

                  return (
                    <Card
                      key={item.id}
                      style={[
                        styles.listingCard,
                        {
                          backgroundColor: theme.colors.surface,
                          borderColor: theme.colors.border,
                        },
                      ]}
                    >
                      {/* Photo preview banner */}
                      {hasPhotos ? (
                        <Image
                          source={{ uri: item.photoUrls[0] }}
                          style={styles.cardImage}
                          resizeMode="cover"
                        />
                      ) : null}

                      <View style={styles.cardBody}>
                        {/* Header Row: Category Badge + Date */}
                        <View style={styles.cardHeaderRow}>
                          <Badge
                            label={getTypeLabel(item.type)}
                            variant={getTypeBadgeVariant(item.type)}
                            size="sm"
                          />
                          <View style={styles.dateMetaRow}>
                            <Clock size={12} color={theme.colors.textMuted} />
                            <Text style={[styles.cardDate, { color: theme.colors.textMuted }]}>
                              {new Date(item.createdAt).toLocaleDateString(i18n.language)}
                            </Text>
                          </View>
                        </View>

                        {/* Title */}
                        <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
                          {item.title}
                        </Text>

                        {/* Price */}
                        <Text
                          style={[
                            styles.cardPrice,
                            {
                              color:
                                item.type === 'GIVE_AWAY'
                                  ? theme.colors.success
                                  : theme.colors.primary,
                            },
                          ]}
                        >
                          {item.type === 'GIVE_AWAY'
                            ? t('communityBoard.typeGiveAway')
                            : item.price != null
                            ? `${item.price.toLocaleString(i18n.language)} ₸`
                            : t('communityBoard.priceNegotiable')}
                        </Text>

                        {/* Description */}
                        <Text
                          style={[styles.cardDesc, { color: theme.colors.textMuted }]}
                          numberOfLines={3}
                        >
                          {item.description}
                        </Text>

                        {/* Author info & Call action */}
                        <View
                          style={[
                            styles.authorRow,
                            { borderTopColor: theme.colors.border },
                          ]}
                        >
                          <View style={styles.authorInfo}>
                            <View
                              style={[
                                styles.authorAvatar,
                                { backgroundColor: theme.colors.surfaceSubtle },
                              ]}
                            >
                              <UserIcon size={14} color={theme.colors.textMuted} />
                            </View>
                            <Text
                              style={[styles.authorName, { color: theme.colors.text }]}
                              numberOfLines={1}
                            >
                              {authorName}
                            </Text>
                          </View>

                          {item.author?.phone ? (
                            <TouchableOpacity
                              style={[
                                styles.callButton,
                                {
                                  backgroundColor: theme.colors.primaryBg,
                                  borderColor: theme.colors.primary,
                                },
                              ]}
                              onPress={() => handleCall(item.author?.phone)}
                              accessibilityRole="button"
                              accessibilityLabel={`${t('communityBoard.callAction')} ${authorName}`}
                            >
                              <Phone size={14} color={theme.colors.primary} />
                              <Text
                                style={[styles.callButtonText, { color: theme.colors.primary }]}
                              >
                                {t('communityBoard.callAction')}
                              </Text>
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
                <EmptyState
                  title={t('communityBoard.noMyListingsTitle')}
                  description={t('communityBoard.noMyListingsSub')}
                  actionTitle={isVerified ? t('communityBoard.postAction') : undefined}
                  onActionPress={isVerified ? () => navigation.navigate('CreateListing') : undefined}
                />
              ) : (
                myListings.map((item) => (
                  <Card
                    key={item.id}
                    style={[
                      styles.listingCard,
                      {
                        backgroundColor: theme.colors.surface,
                        borderColor: theme.colors.border,
                      },
                    ]}
                  >
                    <View style={styles.cardBody}>
                      <View style={styles.cardHeaderRow}>
                        <Badge
                          label={getTypeLabel(item.type)}
                          variant={getTypeBadgeVariant(item.type)}
                          size="sm"
                        />
                        {getStatusBadge(item.status)}
                      </View>

                      <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
                        {item.title}
                      </Text>

                      <Text
                        style={[
                          styles.cardPrice,
                          {
                            color:
                              item.type === 'GIVE_AWAY'
                                ? theme.colors.success
                                : theme.colors.primary,
                          },
                        ]}
                      >
                        {item.type === 'GIVE_AWAY'
                          ? t('communityBoard.typeGiveAway')
                          : item.price != null
                          ? `${item.price.toLocaleString(i18n.language)} ₸`
                          : t('communityBoard.priceNegotiable')}
                      </Text>

                      <Text
                        style={[styles.cardDesc, { color: theme.colors.textMuted }]}
                        numberOfLines={2}
                      >
                        {item.description}
                      </Text>

                      {item.status === 'REMOVED' && item.removedReason ? (
                        <View
                          style={[
                            styles.removedNotice,
                            {
                              backgroundColor: theme.colors.dangerBg,
                              borderColor: theme.colors.dangerBorder,
                            },
                          ]}
                        >
                          <XCircle size={14} color={theme.colors.danger} />
                          <Text style={[styles.removedNoticeText, { color: theme.colors.danger }]}>
                            {t('communityBoard.removedReasonLabel')}: «{item.removedReason}»
                          </Text>
                        </View>
                      ) : null}

                      {item.status === 'ACTIVE' && (
                        <View
                          style={[
                            styles.cardActionsRow,
                            { borderTopColor: theme.colors.border },
                          ]}
                        >
                          <Button
                            title={t('communityBoard.closeAction')}
                            variant="secondary"
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
          </AnimatedEntrance>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 6,
    marginLeft: -4,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  headerRightPlaceholder: {
    width: 44,
  },
  unverifiedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 6,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  unverifiedText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
  },
  tabContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  searchBarWrapper: {
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 44,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    height: '100%',
  },
  searchClearBtn: {
    padding: 4,
  },
  filterScrollView: {
    marginBottom: 10,
  },
  filterRow: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    minHeight: 44,
    justifyContent: 'center',
  },
  filterChipText: {
    fontSize: 13,
  },
  scrollArea: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    gap: 14,
  },
  skeletonWrap: {
    paddingTop: 12,
  },
  listingCard: {
    borderRadius: 18,
    overflow: 'hidden',
    padding: 0,
    borderWidth: 1,
    marginBottom: 2,
  },
  cardImage: {
    width: '100%',
    height: 180,
  },
  cardBody: {
    padding: 16,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  dateMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cardDate: {
    fontSize: 12,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 4,
    lineHeight: 22,
  },
  cardPrice: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
  },
  cardDesc: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 14,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
  },
  authorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    marginRight: 8,
  },
  authorAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  authorName: {
    fontSize: 13,
    fontWeight: '600',
  },
  callButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    minHeight: 38,
  },
  callButtonText: {
    fontSize: 12,
    fontWeight: '700',
  },
  removedNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 8,
  },
  removedNoticeText: {
    fontSize: 12,
    flex: 1,
  },
  cardActionsRow: {
    alignItems: 'flex-end',
    borderTopWidth: 1,
    paddingTop: 10,
    marginTop: 8,
  },
});
