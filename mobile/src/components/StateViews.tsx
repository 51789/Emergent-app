import { MaterialIcons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { IconName } from '@/constants/icons';
import { colors, radius, spacing } from '@/theme';

import { AppText } from './AppText';
import { Button } from './Button';

export function LoadingState({ style }: { style?: StyleProp<ViewStyle> }) {
  const { t } = useTranslation();
  return (
    <View style={[styles.center, style]} accessibilityLabel={t('common.loading')} accessibilityRole="progressbar">
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

interface EmptyStateProps {
  icon: IconName;
  title: string;
  text?: string;
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Centred illustration-less empty state (icon, title, hint, optional action). */
export function EmptyState({ icon, title, text, action, style }: EmptyStateProps) {
  return (
    <View style={[styles.center, style]}>
      <MaterialIcons name={icon} size={56} color={colors.borderStrong} />
      <AppText variant="heading" align="center" style={styles.title}>
        {title}
      </AppText>
      {text ? (
        <AppText variant="body" color="textMuted" align="center" style={styles.text}>
          {text}
        </AppText>
      ) : null}
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function ErrorState({ message, onRetry, style }: ErrorStateProps) {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon="error-outline"
      title={message}
      style={style}
      action={onRetry ? <Button label={t('common.retry')} variant="secondary" onPress={onRetry} fullWidth={false} /> : null}
    />
  );
}

type BannerTone = 'info' | 'warning' | 'danger' | 'success';

const bannerTones: Record<BannerTone, { bg: string; fg: string; border: string; icon: IconName }> = {
  info: { bg: colors.primarySoft, fg: colors.primary, border: colors.primarySoft, icon: 'info-outline' },
  warning: { bg: colors.warningSoft, fg: colors.warning, border: colors.warningBorder, icon: 'warning-amber' },
  danger: { bg: colors.dangerSoft, fg: colors.danger, border: colors.danger, icon: 'error-outline' },
  success: { bg: colors.successSoft, fg: colors.success, border: colors.successBorder, icon: 'check-circle-outline' },
};

interface BannerProps {
  tone?: BannerTone;
  title?: string;
  message: string;
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Inline notice used for run errors, rate limiting and "provider not configured". */
export function Banner({ tone = 'info', title, message, action, style }: BannerProps) {
  const { bg, fg, border, icon } = bannerTones[tone];
  return (
    <View
      style={[styles.banner, { backgroundColor: bg, borderColor: border }, style]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <MaterialIcons name={icon} size={22} color={fg} style={styles.bannerIcon} />
      <View style={styles.bannerBody}>
        {title ? (
          <AppText variant="bodyStrong" style={{ color: fg }}>
            {title}
          </AppText>
        ) : null}
        <AppText variant="body" color="textMuted">
          {message}
        </AppText>
        {action ? <View style={styles.bannerAction}>{action}</View> : null}
      </View>
    </View>
  );
}

/** Spinner row shown under an infinite list while the next page loads. */
export function ListFooter({ loading }: { loading: boolean }) {
  if (!loading) return <View style={styles.footerSpace} />;
  return (
    <View style={styles.footer}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  title: { marginTop: spacing.md },
  text: { marginTop: spacing.sm, maxWidth: 320 },
  action: { marginTop: spacing.lg },
  banner: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  bannerIcon: { marginTop: 1 },
  bannerBody: { flex: 1, gap: 2 },
  bannerAction: { marginTop: spacing.sm, alignSelf: 'flex-start' },
  footer: { paddingVertical: spacing.lg },
  footerSpace: { height: spacing.xl },
});
