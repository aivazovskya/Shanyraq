import { FormExitDialog } from '../../components/common/FormExitDialog';
import { ScreenHero } from '../../components/common/ScreenHero';
import { PhotoAttachments } from '../../components/common/PhotoAttachments';
import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Tag,
  CheckCircle2,
} from 'lucide-react-native';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/common/Button';
import { useFormExitGuard } from '../../components/common/useFormExitGuard';
import { parseDecimalInput } from '../../utils/decimal-input';
import {
  CommunityBoardApi,
  ListingType,
} from '../../api/community-board';
import { getApiErrorMessage } from '../../api/client';

export const CreateListingScreen: React.FC = () => {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const { user } = useAuth();

  const tenantId = user?.tenantId || (user?.ownerships?.[0] as any)?.unit?.building?.tenantId;

  const [type, setType] = useState<ListingType>('SELL');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priceStr, setPriceStr] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const posting = useRef(false);
  const [saved, setSaved] = useState(false);
  const locked = submitting || saved;
  const exitGuard = useFormExitGuard(Boolean(title || description || priceStr || photos.length || type !== 'SELL'), submitting || uploadingPhoto, saved);

  const categories: Array<{ type: ListingType; label: string }> = [
    { type: 'SELL', label: t('communityBoard.typeSell') },
    { type: 'RENT', label: t('communityBoard.typeRent') },
    { type: 'GIVE_AWAY', label: t('communityBoard.typeGiveAway') },
    { type: 'OTHER', label: t('communityBoard.typeOther') },
  ];



  const handleSubmit = async () => {
    if (uploadingPhoto || posting.current || saved) return;
    if (!tenantId) {
      Alert.alert(t('common.error'), t('common.userNotAuthorizedOrLinked'));
      return;
    }

    if (!title.trim() || title.trim().length < 3) {
      setErrorMsg(t('communityBoard.titleValidation'));
      return;
    }

    if (!description.trim() || description.trim().length < 5) {
      setErrorMsg(t('communityBoard.descValidation'));
      return;
    }

    let parsedPrice: number | undefined = undefined;
    if (type !== 'GIVE_AWAY' && priceStr.trim()) {
      const num = parseDecimalInput(priceStr.replace(/\s+/g, ''));
      if (num === null) {
        setErrorMsg(t('communityBoard.priceValidation'));
        return;
      }
      parsedPrice = num;
    }

    posting.current = true;
    setSubmitting(true);
    setErrorMsg(null);

    try {
      await CommunityBoardApi.createListing(tenantId, {
        type,
        title: title.trim(),
        description: description.trim(),
        price: type === 'GIVE_AWAY' ? undefined : parsedPrice,
        photoUrls: photos.length > 0 ? photos : undefined,
      });

      setSaved(true);
      Alert.alert(
        t('common.success'),
        t('communityBoard.createSuccessMessage'),
        [{ text: t('access.ok'), onPress: () => navigation.goBack() }],
        { cancelable: false },
      );
    } catch (e: any) {
      posting.current = false;
      setErrorMsg(getApiErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('common.back')} style={styles.backBtn} onPress={() => navigation.goBack()}>
          <ArrowLeft size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('communityBoard.createTitle')}</Text>
        <View style={{ width: 44 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.scrollContent}>
        <ScreenHero title={t('residentUi.listingTitle')} subtitle={t('residentUi.listingHint')} />
        {/* Category Picker */}
        <Text style={styles.sectionLabel}>{t('communityBoard.selectTypeLabel')}</Text>
        <View style={styles.typeSelectorRow}>
          {categories.map((cat) => {
            const isSelected = type === cat.type;
            return (
              <TouchableOpacity
                key={cat.type}
                accessibilityRole="radio"
                aria-checked={isSelected} accessibilityState={{ checked: isSelected, disabled: locked }}
                disabled={locked}
                style={[styles.typeOption, isSelected && styles.typeOptionSelected]}
                onPress={() => { setType(cat.type); setErrorMsg(null); }}
              >
                <Text
                  style={[styles.typeOptionText, isSelected && styles.typeOptionTextSelected]}
                >
                  {cat.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Title */}
        <Text style={styles.sectionLabel}>{t('communityBoard.titleLabel')} *</Text>
        <TextInput
          style={styles.input}
          value={title}
          accessibilityLabel={t('communityBoard.titleLabel')}
          editable={!locked}
          onChangeText={(v) => {
            setTitle(v);
            setErrorMsg(null);
          }}
          placeholder={t('communityBoard.titlePlaceholder')}
          placeholderTextColor={Colors.textMuted}
          maxLength={150}
        />

        {/* Price (Hidden if GIVE_AWAY) */}
        {type !== 'GIVE_AWAY' && (
          <>
            <Text style={styles.sectionLabel}>{t('communityBoard.priceLabel')}</Text>
            <View style={styles.priceInputRow}>
              <TextInput
                style={[styles.input, styles.priceInput]}
                value={priceStr}
                accessibilityLabel={t('communityBoard.priceLabel')}
                editable={!locked}
                onChangeText={(v) => {
                  setPriceStr(v);
                  setErrorMsg(null);
                }}
                placeholder={t('communityBoard.pricePlaceholder')}
                placeholderTextColor={Colors.textMuted}
                keyboardType="decimal-pad"
              />
              <Text style={styles.currencySuffix}>₸</Text>
            </View>
          </>
        )}

        {/* Description */}
        <Text style={styles.sectionLabel}>{t('communityBoard.descLabel')} *</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={description}
          accessibilityLabel={t('communityBoard.descLabel')}
          editable={!locked}
          onChangeText={(v) => {
            setDescription(v);
            setErrorMsg(null);
          }}
          placeholder={t('communityBoard.descPlaceholder')}
          placeholderTextColor={Colors.textMuted}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />

        {/* Photos */}
        <Text style={styles.sectionLabel}>{t('communityBoard.photosLabel')}</Text>
        <PhotoAttachments value={photos} onChange={setPhotos} onBusyChange={setUploadingPhoto} disabled={locked} />

        {errorMsg && <Text accessibilityLiveRegion="polite" style={styles.errorText}>{errorMsg}</Text>}

        <View style={styles.submitSection}>
          <Button
            title={t('communityBoard.publishAction')}
            onPress={handleSubmit}
            loading={submitting}
            disabled={uploadingPhoto || saved}
          />
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
      <FormExitDialog {...exitGuard} />
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
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 8,
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 8,
    marginTop: 14,
  },
  typeSelectorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeOption: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
  },
  typeOptionSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryBg,
  },
  typeOptionText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  typeOptionTextSelected: {
    color: Colors.primary,
    fontWeight: '700',
  },
  input: {
    outlineWidth: 0,
    minHeight: 52,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    color: Colors.text,
  },
  priceInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  priceInput: {
    flex: 1,
  },
  currencySuffix: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  textArea: {
    minHeight: 112,
    textAlignVertical: 'top',
  },
  photosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  photoThumbContainer: {
    position: 'relative',
    width: 80,
    height: 80,
    borderRadius: 8,
    overflow: 'hidden',
  },
  photoThumb: {
    width: '100%',
    height: '100%',
    backgroundColor: Colors.border,
  },
  removePhotoBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 10,
    padding: 3,
  },
  addPhotoBtn: {
    width: 80,
    height: 80,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.primary,
    borderStyle: 'dashed',
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  addPhotoText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.primary,
    textAlign: 'center',
  },
  errorText: {
    color: Colors.danger,
    fontSize: 13,
    marginTop: 14,
    fontWeight: '500',
  },
  submitSection: {
    marginTop: 24,
  },
});
