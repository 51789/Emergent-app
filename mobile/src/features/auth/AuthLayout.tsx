import type { ReactNode } from 'react';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/AppText';
import { BrandLogo } from '@/components/BrandLogo';
import { BrandTagline } from '@/components/BrandTagline';
import { LanguageModal } from '@/components/LanguageModal';
import { Screen, STACK_EDGES } from '@/components/Screen';
import { getLanguageOption } from '@/i18n/languages';
import { usePrefs } from '@/store/prefs';
import { colors, spacing } from '@/theme';

interface AuthLayoutProps {
  title: string;
  subtitle: string;
  children: ReactNode;
}

/** Shared frame of the login and register screens: wordmark, tagline, title and a language picker. */
export function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  const { t } = useTranslation();
  const language = usePrefs((state) => state.language);
  const setLanguage = usePrefs((state) => state.setLanguage);
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <Screen edges={STACK_EDGES}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.topBar}>
            <Pressable
              onPress={() => setPickerOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={t('home.changeLanguage')}
              style={styles.language}
              hitSlop={8}
            >
              <AppText style={styles.flag}>{getLanguageOption(language).flag}</AppText>
              <AppText variant="captionStrong" color="textMuted">
                {language.toUpperCase()}
              </AppText>
            </Pressable>
          </View>

          <View style={styles.brand}>
            <BrandLogo height={64} />
            <BrandTagline size={12} />
          </View>

          <View style={styles.card}>
            <AppText variant="title" align="center">
              {title}
            </AppText>
            <AppText variant="body" color="textMuted" align="center" style={styles.subtitle}>
              {subtitle}
            </AppText>
            {children}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <LanguageModal
        visible={pickerOpen}
        selected={language}
        onSelect={setLanguage}
        onClose={() => setPickerOpen(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
    alignItems: 'center',
  },
  topBar: { alignSelf: 'stretch', alignItems: 'flex-end', minHeight: 44, justifyContent: 'center' },
  language: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: spacing.sm },
  flag: { fontSize: 20, lineHeight: 26 },
  brand: { alignItems: 'center', marginTop: spacing.lg, marginBottom: spacing.xl, gap: spacing.sm },
  card: {
    maxWidth: 420,
    width: '100%',
    gap: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  subtitle: { marginTop: -spacing.sm },
});
