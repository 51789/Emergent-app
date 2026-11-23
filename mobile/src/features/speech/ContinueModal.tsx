import { Modal, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { colors, radius, spacing } from '@/theme';

interface ContinueModalProps {
  visible: boolean;
  /** Zero-based index of the announcement just read. */
  index: number | null;
  total: number;
  onAnswer: (yes: boolean) => void;
}

/** "Vuoi che continui con il prossimo?" Yes/No prompt shown between two announcements. */
export function ContinueModal({ visible, index, total, onAnswer }: ContinueModalProps) {
  const { t } = useTranslation();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => onAnswer(false)}>
      <View style={styles.overlay}>
        <View style={styles.card} accessibilityViewIsModal>
          {index !== null ? (
            <AppText variant="label" color="primary" align="center">
              {t('speech.readingOf', { current: index + 1, total })}
            </AppText>
          ) : null}
          <AppText variant="heading" align="center" style={styles.question}>
            {t('speech.continueQuestion')}
          </AppText>
          <View style={styles.buttons}>
            <Button label={t('speech.continueYes')} onPress={() => onAnswer(true)} testID="continue-yes" />
            <Button
              label={t('speech.continueNo')}
              variant="secondary"
              onPress={() => onAnswer(false)}
              testID="continue-no"
            />
          </View>
        </View>
      </View>
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
    maxWidth: 380,
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.sm,
  },
  question: { marginTop: spacing.xs },
  buttons: { marginTop: spacing.lg, gap: spacing.sm },
});
