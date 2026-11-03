import React, { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { changeAppLanguage, SUPPORTED_LOCALES, SupportedLocale } from '../../i18n';
import { Colors } from '../../constants/colors';

const labels: Record<SupportedLocale, string> = { kk: 'Қазақша', ru: 'Русский', en: 'English' };

export function LanguageSelector({ onChange }: { onChange?: () => void }) {
  const { t, i18n } = useTranslation();
  const [busy, setBusy] = useState(false);
  const changing = useRef(false);
  const select = async (language: SupportedLocale) => {
    if (changing.current || i18n.language.slice(0, 2) === language) return;
    changing.current = true;
    setBusy(true);
    try {
      await changeAppLanguage(language);
      onChange?.();
    } finally {
      changing.current = false;
      setBusy(false);
    }
  };
  return <View style={styles.container} role="radiogroup" accessibilityLabel={t('common.language')}>
    {SUPPORTED_LOCALES.map((language) => {
      const selected = i18n.language.slice(0, 2) === language;
      return <TouchableOpacity key={language} accessibilityRole="radio"
        aria-checked={selected} aria-disabled={busy}
        accessibilityState={{ checked: selected, disabled: busy }} disabled={busy}
        style={[styles.option, selected && styles.selected]} onPress={() => void select(language)}>
        <Text style={[styles.label, selected && styles.selectedLabel]}>{labels[language]}</Text>
      </TouchableOpacity>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', flexWrap: 'wrap', alignSelf: 'center', gap: 4, marginHorizontal: 16, marginTop: 12, padding: 4, borderRadius: 16, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  option: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center', alignItems: 'center', borderRadius: 12 },
  selected: { backgroundColor: Colors.primaryBg },
  label: { color: Colors.textMuted, fontSize: 13, fontWeight: '500' },
  selectedLabel: { color: Colors.primary, fontWeight: '700' },
});
