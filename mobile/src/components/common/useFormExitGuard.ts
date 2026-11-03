import { useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';
import { UNSTABLE_usePreventRemove as usePreventRemove, useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';

/** Covers header buttons, Android Back and native stack gestures. */
export function useFormExitGuard(dirty: boolean, busy: boolean, saved: boolean) {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const showing = useRef(false);
  const pending = useRef<any>(null);
  const [visible, setVisible] = useState(false);
  const keepEditing = () => { showing.current = false; pending.current = null; setVisible(false); };
  const discard = () => {
    if (busy || !pending.current) return;
    const action = pending.current;
    keepEditing();
    navigation.dispatch(action);
  };

  usePreventRemove(!saved && (dirty || busy), ({ data }) => {
    if (showing.current) return;
    showing.current = true;
    const dismiss = () => { showing.current = false; };
    // React Native Web's Alert is a no-op; otherwise a blocked transition
    // leaves the form permanently locked without displaying a decision.
    if (Platform.OS === 'web') {
      pending.current = data.action;
      setVisible(true);
      return;
    }
    if (busy) {
      Alert.alert(t('common.savingTitle'), t('common.savingMessage'), [
        { text: t('common.close'), onPress: dismiss },
      ], { cancelable: false });
      return;
    }
    Alert.alert(t('common.unsavedTitle'), t('common.unsavedMessage'), [
      { text: t('common.keepEditing'), style: 'cancel', onPress: dismiss },
      { text: t('common.discardChanges'), style: 'destructive', onPress: () => {
        dismiss();
        navigation.dispatch(data.action);
      } },
    ], { cancelable: false });
  });
  return { visible, busy, onKeepEditing: keepEditing, onDiscard: discard };
}
