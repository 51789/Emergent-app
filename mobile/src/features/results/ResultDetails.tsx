import { MaterialIcons } from '@expo/vector-icons';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { Result } from '@/api/types';
import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { colors, radius, spacing } from '@/theme';
import { daysUntil, formatDateOnly, formatDateTime, localeFor } from '@/utils/date';
import { getResultStatusTone } from '@/utils/searchStatus';
import { classifyContact, getHostLabel, isWebUrl } from '@/utils/url';

import { normalizeSellerType } from './sellerType';
import { selectVerificationBadges } from './verification';

function openExternal(url: string): void {
  Linking.openURL(url).catch(() => {
    // Unreachable / unsupported URL: nothing sensible to show.
  });
}

/** Status + verification badges, dates, price and location. */
export function ResultChips({ result }: { result: Result }) {
  const { t, i18n } = useTranslation();
  const locale = localeFor(i18n.language as Parameters<typeof localeFor>[0]);
  const remaining = daysUntil(result.expiry_date);
  const expired = remaining !== null && remaining < 0;
  const badges = selectVerificationBadges(result);

  return (
    <View style={styles.chips}>
      <Badge
        label={t(`result.status.${result.status}`, { defaultValue: result.status })}
        tone={getResultStatusTone(result.status)}
        dot
        testID={`status-badge-${result.id}`}
      />
      <Badge
        label={badges.status === 'verified' ? t('result.verified') : t('result.unverified')}
        tone={badges.status === 'verified' ? 'navy' : 'slate'}
        icon={badges.status === 'verified' ? 'check' : undefined}
        accessibilityHint={
          badges.verifiedAt ? t('result.verifiedOn', { date: formatDateTime(badges.verifiedAt, locale) }) : undefined
        }
        testID={`verification-badge-${result.id}`}
      />
      {badges.officialSource ? (
        <Badge label={t('result.officialSource')} tone="outline" icon="account-balance" testID={`official-badge-${result.id}`} />
      ) : null}
      {result.posted_date ? (
        <Meta icon="event" text={`${t('result.posted')} ${formatDateOnly(result.posted_date, locale)}`} />
      ) : null}
      {result.expiry_date ? (
        <Meta
          icon="schedule"
          tone={expired ? 'danger' : 'warning'}
          text={`${t('result.expires')} ${formatDateOnly(result.expiry_date, locale)}`}
        />
      ) : null}
      {result.price ? <Meta icon="euro" text={result.price} /> : null}
      {result.location ? <Meta icon="location-on" text={result.location} /> : null}
    </View>
  );
}

function Meta({ icon, text, tone }: { icon: 'event' | 'schedule' | 'euro' | 'location-on'; text: string; tone?: 'warning' | 'danger' }) {
  const fg = tone === 'warning' ? colors.warning : tone === 'danger' ? colors.danger : colors.textMuted;
  const bg = tone === 'warning' ? colors.warningSoft : tone === 'danger' ? colors.dangerSoft : colors.surface;
  return (
    <View style={[styles.meta, { backgroundColor: bg }]}>
      <MaterialIcons name={icon} size={13} color={fg} />
      <AppText variant="captionStrong" style={{ color: fg }} numberOfLines={1}>
        {text}
      </AppText>
    </View>
  );
}

/** Source domain with an "Apri fonte" link. Only http(s) URLs are ever opened. */
export function SourceRow({ result }: { result: Result }) {
  const { t } = useTranslation();
  if (!isWebUrl(result.url)) return null;
  const host = result.source_domain || getHostLabel(result.url);

  return (
    <Pressable
      onPress={() => openExternal(result.url)}
      accessibilityRole="link"
      accessibilityLabel={`${t('result.openSource')}: ${host}`}
      style={({ pressed }) => [styles.source, pressed && styles.pressed]}
      testID={`open-link-${result.id}`}
    >
      <MaterialIcons name="link" size={18} color={colors.primary} />
      <View style={styles.sourceText}>
        <AppText variant="caption" color="textSubtle">
          {t('result.source')}
        </AppText>
        <AppText variant="bodyStrong" color="primary" numberOfLines={1}>
          {host}
        </AppText>
      </View>
      <View style={styles.sourceAction}>
        <AppText variant="captionStrong" color="primary">
          {t('result.openSource')}
        </AppText>
        <MaterialIcons name="open-in-new" size={16} color={colors.primary} />
      </View>
    </Pressable>
  );
}

/** Contacts (tappable mail / phone / link) and the seller type, which is always rendered in black. */
export function ContactsBlock({ result }: { result: Result }) {
  const { t } = useTranslation();
  const sellerKey = normalizeSellerType(result.seller_type);
  const seller = sellerKey ? t(`result.seller.${sellerKey}`) : result.seller_type;
  if (result.contacts.length === 0 && !seller) return null;

  return (
    <View style={styles.contacts}>
      {result.contacts.length > 0 ? (
        <AppText variant="captionStrong" color="textMuted">
          {t('result.contacts')}:
        </AppText>
      ) : null}
      {result.contacts.map((contact, index) => {
        const { href } = classifyContact(contact);
        return href ? (
          <Pressable key={`${contact}-${index}`} onPress={() => openExternal(href)} accessibilityRole="link">
            <AppText variant="body" color="primary">
              {contact}
            </AppText>
          </Pressable>
        ) : (
          <AppText key={`${contact}-${index}`} variant="body" color="textMuted">
            {contact}
          </AppText>
        );
      })}
      {seller ? (
        <View style={styles.seller} testID={`seller-type-${result.id}`}>
          <MaterialIcons name="badge" size={15} color={colors.black} />
          <AppText variant="bodyStrong" color="black">
            {seller}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    maxWidth: '100%',
  },
  source: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  pressed: { opacity: 0.7 },
  sourceText: { flex: 1 },
  sourceAction: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  contacts: { gap: 4 },
  seller: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
});
