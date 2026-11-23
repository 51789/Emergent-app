import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { BrandLogo } from '@/components/BrandLogo';
import { Screen } from '@/components/Screen';
import { EmptyState } from '@/components/StateViews';
import { Button } from '@/components/Button';
import { spacing } from '@/theme';

/** Shown when a stored session exists but the server could not be reached at startup. */
export function BootError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <Screen>
      <View style={styles.logo}>
        <BrandLogo height={36} />
      </View>
      <EmptyState
        icon="cloud-off"
        title={t('boot.errorTitle')}
        text={t('boot.errorMessage')}
        action={<Button label={t('common.retry')} onPress={onRetry} fullWidth={false} />}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  logo: { alignItems: 'center', paddingTop: spacing.xl },
});
