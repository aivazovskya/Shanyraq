import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChevronLeft,
  AlertCircle,
  Tag,
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
} from '../../api/community-board';
import { getApiErrorMessage } from '../../api/client';

export const CreateListingScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const tenantId = user?.tenantId || (user?.ownerships?.[0] as any)?.unit?.building?.tenantId;

  const [type, setType] = useState<ListingType>('SELL');
  const [title, setTitle] = useState('');
  const [titleError, setTitleError] = useState<string | undefined>();
  const [description, setDescription] = useState('');
  const [descError, setDescError] = useState<string | undefined>();
  const [priceStr, setPriceStr] = useState('');
  const [priceError, setPriceError] = useState<string | undefined>();
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);

  const categories: Array<{ value: ListingType; label: string }> = [
    { value: 'SELL', label: t('communityBoard.typeSell') },
    { value: 'RENT', label: t('communityBoard.typeRent') },
    { value: 'GIVE_AWAY', label: t('communityBoard.typeGiveAway') },
    { value: 'OTHER', label: t('communityBoard.typeOther') },
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

    let parsedPrice: number | undefined = undefined;
    if (type !== 'GIVE_AWAY' && priceStr.trim()) {
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
        price: type === 'GIVE_AWAY' ? undefined : parsedPrice,
        photoUrls: photos.length > 0 ? photos : undefined,
      });

      safeHaptic.notification(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        t('common.success'),
        t('communityBoard.createSuccessMessage'),
        [{ text: t('common.ok'), onPress: () => navigation.goBack() }],
      );
    } catch (e: any) {
      safeHaptic.notification(Haptics.NotificationFeedbackType.Error);
      setGeneralError(getApiErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

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
                if (v === 'GIVE_AWAY') {
                  setPriceStr('');
                  setPriceError(undefined);
                }
              }}
            />
          </View>

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

          {/* Price Input (Hidden if GIVE_AWAY) */}
          {type !== 'GIVE_AWAY' && (
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
