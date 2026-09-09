import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
  Alert,
  Image,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Camera,
  X,
  Tag,
  CheckCircle2,
} from 'lucide-react-native';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/common/Button';
import {
  CommunityBoardApi,
  ListingType,
} from '../../api/community-board';
import { getApiErrorMessage } from '../../api/client';

export const CreateListingScreen: React.FC = () => {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { user } = useAuth();

  const tenantId = user?.tenantId || (user?.ownerships?.[0] as any)?.unit?.building?.tenantId;

  const [type, setType] = useState<ListingType>('SELL');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priceStr, setPriceStr] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const categories: Array<{ type: ListingType; label: string }> = [
    { type: 'SELL', label: t('communityBoard.typeSell') },
    { type: 'RENT', label: t('communityBoard.typeRent') },
    { type: 'GIVE_AWAY', label: t('communityBoard.typeGiveAway') },
    { type: 'OTHER', label: t('communityBoard.typeOther') },
  ];

  const handleAddSamplePhoto = () => {
    // Demonstration attachment photo simulating MinIO upload, matching CreateRequestScreen
    const mockUrl = `http://localhost:9000/shanyraq-media/listing_${Date.now()}.jpg`;
    setPhotos((prev) => [...prev, mockUrl]);
  };

  const handleRemovePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
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
      const num = parseFloat(priceStr.replace(/\s+/g, ''));
      if (isNaN(num) || num < 0) {
        setErrorMsg(t('communityBoard.priceValidation'));
        return;
      }
      parsedPrice = num;
    }

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

      Alert.alert(
        t('common.success'),
        t('communityBoard.createSuccessMessage'),
        [{ text: t('common.ok'), onPress: () => navigation.goBack() }],
      );
    } catch (e: any) {
      setErrorMsg(getApiErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <ArrowLeft size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('communityBoard.createTitle')}</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Category Picker */}
        <Text style={styles.sectionLabel}>{t('communityBoard.selectTypeLabel')}</Text>
        <View style={styles.typeSelectorRow}>
          {categories.map((cat) => {
            const isSelected = type === cat.type;
            return (
              <TouchableOpacity
                key={cat.type}
                style={[styles.typeOption, isSelected && styles.typeOptionSelected]}
                onPress={() => setType(cat.type)}
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
                onChangeText={(v) => {
                  setPriceStr(v);
                  setErrorMsg(null);
                }}
                placeholder={t('communityBoard.pricePlaceholder')}
                placeholderTextColor={Colors.textMuted}
                keyboardType="numeric"
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
        <View style={styles.photosGrid}>
          {photos.map((uri, idx) => (
            <View key={idx} style={styles.photoThumbContainer}>
              <Image source={{ uri }} style={styles.photoThumb} resizeMode="cover" />
              <TouchableOpacity
                style={styles.removePhotoBtn}
                onPress={() => handleRemovePhoto(idx)}
              >
                <X size={12} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          ))}

          <TouchableOpacity style={styles.addPhotoBtn} onPress={handleAddSamplePhoto}>
            <Camera size={22} color={Colors.primary} />
            <Text style={styles.addPhotoText}>{t('communityBoard.addPhotoAction')}</Text>
          </TouchableOpacity>
        </View>

        {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}

        <View style={styles.submitSection}>
          <Button
            title={t('communityBoard.publishAction')}
            onPress={handleSubmit}
            loading={submitting}
          />
        </View>
      </ScrollView>
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
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
  },
  typeOptionSelected: {
    borderColor: Colors.primary,
    backgroundColor: '#EEF2FF',
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
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
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
    height: 100,
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
