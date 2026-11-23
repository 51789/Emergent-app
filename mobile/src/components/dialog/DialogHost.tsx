import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '@/theme';

import { AppText } from '../AppText';
import { Button } from '../Button';
import { useDialogStore, type DialogButton } from './dialog';

function variantFor(style: DialogButton['style']) {
  if (style === 'destructive') return 'danger' as const;
  if (style === 'cancel') return 'secondary' as const;
  return 'primary' as const;
}

/** Renders the dialog at the head of the queue. Mount once, near the root of the app. */
export function DialogHost() {
  const current = useDialogStore((state) => state.queue[0]);
  const close = useDialogStore((state) => state.close);

  const dismiss = () => {
    if (!current) return;
    const cancel = current.buttons.find((button) => button.style === 'cancel');
    close(current.id, cancel?.value ?? current.buttons[0].value);
  };

  return (
    <Modal visible={!!current} transparent animationType="fade" onRequestClose={dismiss}>
      <Pressable style={styles.overlay} onPress={dismiss} accessibilityLabel="dismiss">
        {current ? (
          <Pressable style={styles.card} onPress={() => undefined} accessibilityViewIsModal>
            <AppText variant="heading" align="center">
              {current.title}
            </AppText>
            {current.message ? (
              <AppText variant="body" color="textMuted" align="center" style={styles.message}>
                {current.message}
              </AppText>
            ) : null}
            <View style={styles.buttons}>
              {current.buttons.map((button) => (
                <Button
                  key={button.value}
                  label={button.label}
                  variant={variantFor(button.style)}
                  onPress={() => close(current.id, button.value)}
                />
              ))}
            </View>
          </Pressable>
        ) : null}
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
    maxWidth: 380,
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.sm,
  },
  message: { marginTop: spacing.xs },
  buttons: { marginTop: spacing.lg, gap: spacing.sm },
});
