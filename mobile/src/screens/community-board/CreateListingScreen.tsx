import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { Text } from '../../components/ui/AppText';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChevronLeft,
  AlertCircle,
  Briefcase,
  Sparkles,
} from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeContext';
import * as Haptics from 'expo-haptics';
import { safeHaptic } from '../../lib/haptics';
import {
  Button,
  Input,
  SegmentedControl,
  AnimatedEntrance,
} from '../../components/ui';
import { PhotoAttachments } from '../../components/common/PhotoAttachments';
import { useAuth } from '../../context/AuthContext';
import {
  CommunityBoardApi,
  ListingType,
  AdPricing,
} from '../../api/community-board';
import { getApiErrorMessage } from '../../api/client';

export const CreateListingScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const tenantId = user?.tenantId || (user?.ownerships?.[0] as any)?.unit?.building?.tenantId;
  const isStaff =
    user?.role === 'SUPERADMIN' ||
    user?.role === 'HOA_ADMIN' ||
    user?.role === 'HOA_CHAIRMAN' ||
    user?.role === 'DISPATCHER';

  const [type, setType] = useState<ListingType>('SELL');
  const [title, setTitle] = useState('');
  const [titleError, setTitleError] = useState<string | undefined>();
  const [description, setDescription] = useState('');
  const [descError, setDescError] = useState<string | undefined>();
  const [priceStr, setPriceStr] = useState('');
  const [priceError, setPriceError] = useState<string | undefined>();

  // Ad fields
  const [adBusinessName, setAdBusinessName] = useState('');
  const [adBusinessNameError, setAdBusinessNameError] = useState<string | undefined>();
  const [adContactPhone, setAdContactPhone] = useState('');
  const [adMonths, setAdMonths] = useState<number>(1);
  const [pricing, setPricing] = useState<AdPricing | null>(null);
  const [isTrial, setIsTrial] = useState(false);

  const [photos, setPhotos] = useState<string[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) return;

    // Load pricing and check trial status
    const initPricing = async () => {
      try {
        const [pData, myListings] = await Promise.all([
          CommunityBoardApi.getAdPricing(tenantId).catch(() => null),
          CommunityBoardApi.getMyListings().catch(() => []),
        ]);

        if (pData) {
          setPricing(pData);
        }

        // Resident with no previous ads of type AD gets trial
        if (!isStaff && (pData?.adTrialDays ?? 30) > 0) {
          const hasPriorAds = (myListings || []).some((l) => l.type === 'AD');
          setIsTrial(!hasPriorAds);
        } else {
          setIsTrial(false);
        }
      } catch (err) {
        console.warn('Failed to load ad pricing/trial status:', err);
      }
    };

    initPricing();
  }, [tenantId, isStaff]);

  const categories: Array<{ value: ListingType; label: string }> = [
    { value: 'SELL', label: t('communityBoard.typeSell') },
    { value: 'RENT', label: t('communityBoard.typeRent') },
    { value: 'GIVE_AWAY', label: t('communityBoard.typeGiveAway') },
    { value: 'OTHER', label: t('communityBoard.typeOther') },
    { value: 'AD', label: t('communityBoard.typeAd') },
  ];

  const monthOptions = [
    { value: '1', label: t('communityBoard.months1') },
    { value: '3', label: t('communityBoard.months3') },
    { value: '6', label: t('communityBoard.months6') },
    { value: '12', label: t('communityBoard.months12') },
  ];

  const handleSubmit = async () => {
    if (uploadingPhoto || submitting) return;
    if (!tenantId) {
      Alert.alert(t('common.error'), t('common.userNotAuthorizedOrLinked'));
      return;
    }

    let hasErrors = false;

    if (!title.trim() || title.trim().length < 3) {
      setTitleError(t('communityBoard.titleValidation'));
      hasErrors = true;
    } else {
      setTitleError(undefined);
    }

    if (!description.trim() || description.trim().length < 5) {
      setDescError(t('communityBoard.descValidation'));
      hasErrors = true;
    } else {
      setDescError(undefined);
    }

    if (type === 'AD') {
      if (!adBusinessName.trim() || adBusinessName.trim().length < 2) {
        setAdBusinessNameError(t('communityBoard.adBusinessNameValidation'));
        hasErrors = true;
      } else {
        setAdBusinessNameError(undefined);
      }
    }

    let parsedPrice: number | undefined = undefined;
    if (type !== 'GIVE_AWAY' && type !== 'AD' && priceStr.trim()) {
      const num = parseFloat(priceStr.replace(/\s+/g, '').replace(',', '.'));
      if (isNaN(num) || num < 0) {
        setPriceError(t('communityBoard.priceValidation'));
        hasErrors = true;
      } else {
        setPriceError(undefined);
        parsedPrice = num;
      }
    } else {
      setPriceError(undefined);
    }

    if (hasErrors) {
      safeHaptic.notification(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    setSubmitting(true);
    setGeneralError(null);

    try {
      await CommunityBoardApi.createListing(tenantId, {
        type,
        title: title.trim(),
        description: description.trim(),
        price: type === 'GIVE_AWAY' || type === 'AD' ? undefined : parsedPrice,
        photoUrls: photos.length > 0 ? photos : undefined,
        adBusinessName: type === 'AD' ? adBusinessName.trim() : undefined,
        adContactPhone: type === 'AD' && adContactPhone.trim() ? adContactPhone.trim() : undefined,
        adMonths: type === 'AD' ? adMonths : undefined,
      });

      safeHaptic.notification(Haptics.NotificationFeedbackType.Success);
      const successMsg =
        type === 'AD'
          ? t('communityBoard.adSubmittedReviewNotice')
          : t('communityBoard.createSuccessMessage');

      Alert.alert(t('common.success'), successMsg, [
        { text: t('common.ok'), onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      safeHaptic.notification(Haptics.NotificationFeedbackType.Error);
      setGeneralError(getApiErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  const calculatedAdPrice = (pricing?.adPriceMonthly ?? 3000) * adMonths;

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
          {t('communityBoard.createTitle')}
        </Text>
        <View style={styles.headerRightPlaceholder} />
      </View>

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={[styles.contentContainer, { paddingBottom: Math.max(insets.bottom, 24) + 32 }]}
        keyboardShouldPersistTaps="handled"
      >
        <AnimatedEntrance>
          {/* Category Picker */}
          <Text style={[styles.sectionLabel, { color: theme.colors.text }]}>
            {t('communityBoard.selectTypeLabel')}
          </Text>
          <View style={styles.categoryWrap}>
            <SegmentedControl
              options={categories}
              value={type}
              onChange={(v) => {
                safeHaptic.selection();
                setType(v as ListingType);
                if (v === 'GIVE_AWAY' || v === 'AD') {
                  setPriceStr('');
                  setPriceError(undefined);
                }
              }}
            />
          </View>

          {/* Ad Specific Fields */}
          {type === 'AD' && (
            <View style={styles.adSection}>
              {/* Business Name */}
              <Input
                label={`${t('communityBoard.adBusinessNameLabel')} *`}
                value={adBusinessName}
                onChangeText={(v) => {
                  setAdBusinessName(v);
                  if (adBusinessNameError) setAdBusinessNameError(undefined);
                }}
                placeholder={t('communityBoard.adBusinessNamePlaceholder')}
                error={adBusinessNameError}
                leftIcon={<Briefcase size={16} color={theme.colors.textMuted} />}
              />

              {/* Business Phone */}
              <Input
                label={t('communityBoard.adPhoneLabel')}
                value={adContactPhone}
                onChangeText={setAdContactPhone}
                placeholder={t('communityBoard.adPhonePlaceholder')}
                keyboardType="phone-pad"
              />

              {/* Placement Duration */}
              <Text style={[styles.sectionLabel, { color: theme.colors.text, marginTop: 4 }]}>
                {t('communityBoard.adMonthsLabel')}
              </Text>
              <View style={styles.categoryWrap}>
                <SegmentedControl
                  options={monthOptions}
                  value={String(adMonths)}
                  onChange={(v) => {
                    safeHaptic.selection();
                    setAdMonths(parseInt(v, 10) || 1);
                  }}
                />
              </View>

              {/* Trial or Price Banner */}
              <View
                style={[
                  styles.pricingBanner,
                  {
                    backgroundColor: isTrial
                      ? theme.colors.successBg
                      : theme.colors.surfaceSubtle,
                    borderColor: isTrial
                      ? theme.colors.successBorder
                      : theme.colors.border,
                  },
                ]}
              >
                <Sparkles
                  size={18}
                  color={isTrial ? theme.colors.success : theme.colors.primary}
                />
                <Text
                  style={[
                    styles.pricingBannerText,
                    {
                      color: isTrial
                        ? theme.colors.success
                        : theme.colors.text,
                    },
                  ]}
                >
                  {isTrial
                    ? t('communityBoard.firstAdFree', {
                        days: pricing?.adTrialDays ?? 30,
                      })
                    : t('communityBoard.adCalculatedCost', {
                        price: calculatedAdPrice.toLocaleString(),
                      })}
                </Text>
              </View>
            </View>
          )}

          {/* Title Input */}
          <Input
            label={`${t('communityBoard.titleLabel')} *`}
            value={title}
            onChangeText={(v) => {
              setTitle(v);
              if (titleError) setTitleError(undefined);
            }}
            placeholder={t('communityBoard.titlePlaceholder')}
            maxLength={150}
            error={titleError}
          />

          {/* Price Input (Hidden if GIVE_AWAY or AD) */}
          {type !== 'GIVE_AWAY' && type !== 'AD' && (
            <Input
              label={t('communityBoard.priceLabel')}
              value={priceStr}
              onChangeText={(v) => {
                setPriceStr(v);
                if (priceError) setPriceError(undefined);
              }}
              placeholder={t('communityBoard.pricePlaceholder')}
              keyboardType="numeric"
              error={priceError}
              rightIcon={
                <Text style={[styles.currencyText, { color: theme.colors.textMuted }]}>
                  ₸
                </Text>
              }
            />
          )}

          {/* Description Input */}
          <Input
            label={`${t('communityBoard.descLabel')} *`}
            value={description}
            onChangeText={(v) => {
              setDescription(v);
              if (descError) setDescError(undefined);
            }}
            placeholder={t('communityBoard.descPlaceholder')}
            multiline
            numberOfLines={4}
            error={descError}
            inputStyle={styles.textAreaInput}
          />

          {/* Photo Attachments */}
          <Text style={[styles.sectionLabel, { color: theme.colors.text, marginTop: 12 }]}>
            {t('communityBoard.photosLabel')}
          </Text>
          <PhotoAttachments
            value={photos}
            onChange={setPhotos}
            onBusyChange={setUploadingPhoto}
            disabled={submitting}
            maxPhotos={5}
          />

          {/* General Error Banner */}
          {Boolean(generalError) && (
            <View
              style={[
                styles.errorBanner,
                {
                  backgroundColor: theme.colors.dangerBg,
                  borderColor: theme.colors.dangerBorder,
                },
              ]}
            >
              <AlertCircle color={theme.colors.danger} size={16} />
              <Text style={[styles.errorBannerText, { color: theme.colors.danger }]}>
                {generalError}
              </Text>
            </View>
          )}

          {/* Publish Button */}
          <Button
            title={t('communityBoard.publishAction')}
            onPress={handleSubmit}
            loading={submitting}
            disabled={uploadingPhoto}
            size="lg"
            style={styles.submitButton}
          />
        </AnimatedEntrance>
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
  scrollArea: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  categoryWrap: {
    marginBottom: 16,
  },
  adSection: {
    marginBottom: 8,
  },
  pricingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  pricingBannerText: {
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  currencyText: {
    fontSize: 16,
    fontWeight: '700',
    paddingHorizontal: 4,
  },
  textAreaInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 10,
    marginBottom: 10,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 13,
  },
  submitButton: {
    marginTop: 18,
  },
});
