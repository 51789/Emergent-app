import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/AppText';
import { BrandHeader } from '@/components/BrandHeader';
import { BrandLogo } from '@/components/BrandLogo';
import { BrandTagline } from '@/components/BrandTagline';
import { dialog } from '@/components/dialog/dialog';
import { LanguageModal } from '@/components/LanguageModal';
import { Screen } from '@/components/Screen';
import { Segmented } from '@/components/Segmented';
import { deleteAccount, signOut, useSession } from '@/features/auth/session';
import { getLanguageOption } from '@/i18n/languages';
import { useErrorMessage } from '@/i18n/useErrorMessage';
import { usePrefs } from '@/store/prefs';
import { spacing } from '@/theme';

import { SettingsRow, SettingsSection } from './SettingsRow';
import { useChangeLanguage, useChangeVoiceGender } from './usePreferenceSync';

/** Language, voice, account info, plan, admin entry, sign-out and account deletion. */
export function SettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const errorMessage = useErrorMessage();
  const user = useSession((state) => state.user);
  const language = usePrefs((state) => state.language);
  const voiceGender = usePrefs((state) => state.voiceGender);
  const changeLanguage = useChangeLanguage();
  const changeVoiceGender = useChangeVoiceGender();
  const [pickerOpen, setPickerOpen] = useState(false);

  const handleSignOut = async () => {
    const confirmed = await dialog.confirm({
      title: t('settings.signOut'),
      message: t('settings.signOutConfirm'),
      confirmLabel: t('settings.exit'),
    });
    if (confirmed) await signOut();
  };

  const handleDeleteAccount = async () => {
    const confirmed = await dialog.confirm({
      title: t('settings.deleteAccountTitle'),
      message: t('settings.deleteAccountMessage'),
      confirmLabel: t('settings.deleteAccountConfirm'),
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await deleteAccount();
    } catch (error) {
      void dialog.alert(t('common.retry'), errorMessage(error));
    }
  };

  const providers = (user?.auth_providers ?? []).map((provider) => t(`settings.provider.${provider}`)).join(', ');
  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <Screen>
      <BrandHeader />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <AppText variant="title">{t('settings.title')}</AppText>

        <SettingsSection title={t('settings.account')}>
          <SettingsRow icon="alternate-email" label={t('settings.email')} value={user?.email} />
          {user?.name ? <SettingsRow icon="person" label={t('settings.name')} value={user.name} /> : null}
          <SettingsRow icon="login" label={t('settings.signInMethod')} value={providers} />
          <SettingsRow
            icon="workspace-premium"
            label={t('settings.plan')}
            value={user ? user.plan.toUpperCase() : undefined}
            onPress={() => router.push('/subscribe')}
            testID="settings-plan"
          />
        </SettingsSection>

        <SettingsSection title={t('settings.language')}>
          <SettingsRow
            icon="language"
            label={t('settings.language')}
            value={`${getLanguageOption(language).flag}  ${getLanguageOption(language).nativeLabel}`}
            onPress={() => setPickerOpen(true)}
            testID="settings-language"
          />
        </SettingsSection>

        <SettingsSection title={t('settings.voiceAssistant')}>
          <View style={styles.voice}>
            <AppText variant="subheading">{t('settings.voiceGender')}</AppText>
            <Segmented
              value={voiceGender}
              onChange={changeVoiceGender}
              options={[
                { value: 'female', label: t('settings.voiceFemale') },
                { value: 'male', label: t('settings.voiceMale') },
              ]}
            />
          </View>
        </SettingsSection>

        {user?.role === 'admin' ? (
          <SettingsSection>
            <SettingsRow
              icon="admin-panel-settings"
              label={t('settings.adminPanel')}
              onPress={() => router.push('/admin')}
              testID="settings-admin"
            />
          </SettingsSection>
        ) : null}

        <SettingsSection>
          <SettingsRow icon="logout" label={t('settings.signOut')} onPress={handleSignOut} testID="settings-sign-out" />
          <SettingsRow
            icon="delete-forever"
            label={t('settings.deleteAccount')}
            destructive
            onPress={handleDeleteAccount}
            testID="settings-delete-account"
          />
        </SettingsSection>

        <View style={styles.about}>
          <BrandLogo height={22} />
          <BrandTagline size={10} />
          <AppText variant="caption" color="textSubtle" align="center">
            {t('settings.version', { version })}
          </AppText>
        </View>
      </ScrollView>

      <LanguageModal
        visible={pickerOpen}
        selected={language}
        onSelect={changeLanguage}
        onClose={() => setPickerOpen(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.xl },
  voice: { padding: spacing.lg, gap: spacing.md },
  about: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
});
