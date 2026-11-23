import { MaterialIcons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { LanguageCode } from '@/api/types';
import { LANGUAGES } from '@/i18n/languages';
import { colors, radius, spacing } from '@/theme';

import { AppText } from './AppText';
import { IconButton } from './IconButton';

interface LanguageModalProps {
  visible: boolean;
  selected: LanguageCode;
  onSelect: (language: LanguageCode) => void;
  onClose: () => void;
}

/** Language picker used from the home header and the settings screen. */
export function LanguageModal({ visible, selected, onSelect, onClose }: LanguageModalProps) {
  const { t } = useTranslation();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} accessibilityLabel={t('common.close')}>
        <Pressable style={styles.card} onPress={() => undefined} accessibilityViewIsModal>
          <View style={styles.header}>
            <AppText variant="heading">{t('common.language')}</AppText>
            <IconButton icon="close" size={22} onPress={onClose} accessibilityLabel={t('common.close')} />
          </View>
          {LANGUAGES.map((language, index) => {
            const active = language.code === selected;
            return (
              <Pressable
                key={language.code}
                onPress={() => {
                  onSelect(language.code);
                  onClose();
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={language.nativeLabel}
                style={[styles.row, index < LANGUAGES.length - 1 && styles.rowDivider]}
                testID={`language-${language.code}`}
              >
                <AppText style={styles.flag}>{language.flag}</AppText>
                <AppText variant="subheading" style={styles.name}>
                  {language.nativeLabel}
                </AppText>
                {active ? <MaterialIcons name="check-circle" size={22} color={colors.primary} /> : null}
              </Pressable>
            );
          })}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  flag: { fontSize: 24, lineHeight: 30 },
  name: { flex: 1 },
});
