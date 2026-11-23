import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useMarkAllSeen, useMarkResultSeen, useUnseenCount } from '@/api/hooks';
import type { Result } from '@/api/types';
import { AppText } from '@/components/AppText';
import { BrandHeader } from '@/components/BrandHeader';
import { Button } from '@/components/Button';
import { dialog } from '@/components/dialog/dialog';
import { Screen } from '@/components/Screen';
import { ResultFeed } from '@/features/results/ResultFeed';
import { useErrorMessage } from '@/i18n/useErrorMessage';
import { spacing } from '@/theme';

/** Unseen results only. Tapping one marks it seen and opens its search; a push opens this screen. */
export function NotificationsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const errorMessage = useErrorMessage();
  const { data: unseen = 0 } = useUnseenCount();
  const markSeen = useMarkResultSeen();
  const markAll = useMarkAllSeen();

  const handleMarkAll = async () => {
    const confirmed = await dialog.confirm({
      title: t('notifications.markAllRead'),
      message: t('notifications.markAllReadConfirm'),
    });
    if (!confirmed) return;
    try {
      await markAll.mutateAsync(undefined);
    } catch (error) {
      void dialog.alert(t('common.retry'), errorMessage(error));
    }
  };

  const openResult = (result: Result) => {
    markSeen.mutate(result.id);
    router.push({ pathname: '/search/[id]', params: { id: result.search_id } });
  };

  return (
    <Screen>
      <BrandHeader />
      <ResultFeed
        params={{ unseen: true }}
        emptyIcon="notifications-none"
        emptyTitle={t('notifications.emptyTitle')}
        emptyText={t('notifications.emptyText')}
        onPressResult={openResult}
        header={
          <View style={styles.header}>
            <AppText variant="title">{t('notifications.title')}</AppText>
            {unseen > 0 ? (
              <>
                <AppText variant="body" color="textMuted" accessibilityLiveRegion="polite">
                  {t('notifications.unseen', { count: unseen })}
                </AppText>
                <Button
                  label={t('notifications.markAllRead')}
                  icon="done-all"
                  variant="secondary"
                  loading={markAll.isPending}
                  onPress={handleMarkAll}
                />
              </>
            ) : null}
          </View>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.md, paddingBottom: spacing.lg },
});
