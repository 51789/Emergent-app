import { Link } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Banner } from '@/components/StateViews';
import { TextField } from '@/components/TextField';
import { useErrorMessage } from '@/i18n/useErrorMessage';
import { usePrefs } from '@/store/prefs';
import { colors, spacing } from '@/theme';
import { checkPassword, isValidEmail } from '@/utils/validation';

import { AuthLayout } from './AuthLayout';
import { GoogleButton } from './google/GoogleButton';
import { registerWithPassword, signInWithGoogleIdToken, signInWithPassword } from './session';

interface AuthFormProps {
  mode: 'login' | 'register';
}

interface FieldErrors {
  email?: string;
  password?: string;
}

/** Email/password form shared by the login and register screens, plus the Google button. */
export function AuthForm({ mode }: AuthFormProps) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const language = usePrefs((state) => state.language);
  const isRegister = mode === 'register';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const validate = (): boolean => {
    const errors: FieldErrors = {};
    if (!isValidEmail(email)) errors.email = t('auth.invalidEmail');
    const problem = checkPassword(password, isRegister);
    if (problem === 'required') errors.password = t('auth.passwordRequired');
    if (problem === 'tooShort') errors.password = t('auth.passwordTooShort');
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // On success the auth guard in the root layout switches to the app: no navigation needed here.
  const submit = async () => {
    setFormError(null);
    if (!validate()) return;
    setSubmitting(true);
    try {
      if (isRegister) {
        await registerWithPassword({
          email: email.trim(),
          password,
          name: name.trim() || undefined,
          language,
        });
      } else {
        await signInWithPassword({ email: email.trim(), password });
      }
    } catch (error) {
      setFormError(errorMessage(error));
      setSubmitting(false);
    }
  };

  const handleGoogle = async (idToken: string) => {
    setFormError(null);
    setSubmitting(true);
    try {
      await signInWithGoogleIdToken(idToken);
    } catch (error) {
      setFormError(errorMessage(error));
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title={isRegister ? t('auth.createAccount') : t('auth.welcomeBack')}
      subtitle={isRegister ? t('auth.signUpSubtitle') : t('auth.signInSubtitle')}
    >
      {formError ? <Banner tone="danger" message={formError} /> : null}

      <View style={styles.fields}>
        {isRegister ? (
          <TextField
            label={`${t('auth.name')} (${t('common.optional')})`}
            value={name}
            onChangeText={setName}
            placeholder={t('auth.namePlaceholder')}
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
            returnKeyType="next"
          />
        ) : null}
        <TextField
          label={t('auth.email')}
          value={email}
          onChangeText={setEmail}
          placeholder={t('auth.emailPlaceholder')}
          error={fieldErrors.email}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="next"
        />
        <TextField
          label={t('auth.password')}
          value={password}
          onChangeText={setPassword}
          placeholder={t('auth.passwordPlaceholder')}
          error={fieldErrors.password}
          hint={isRegister ? t('auth.passwordHint') : undefined}
          secureTextEntry
          autoCapitalize="none"
          autoComplete={isRegister ? 'new-password' : 'current-password'}
          textContentType={isRegister ? 'newPassword' : 'password'}
          returnKeyType="go"
          onSubmitEditing={submit}
        />
      </View>

      <Button
        label={isRegister ? t('auth.signUp') : t('auth.signIn')}
        onPress={submit}
        loading={submitting}
        testID="auth-submit"
      />

      <View style={styles.divider}>
        <View style={styles.line} />
        <AppText variant="caption" color="textSubtle">
          {t('common.or')}
        </AppText>
        <View style={styles.line} />
      </View>

      <GoogleButton onIdToken={handleGoogle} onError={setFormError} disabled={submitting} />

      <View style={styles.switchRow}>
        <AppText variant="body" color="textMuted">
          {isRegister ? t('auth.haveAccount') : t('auth.noAccount')}
        </AppText>
        <Link href={isRegister ? '/' : '/register'} replace>
          <AppText variant="bodyStrong" color="primary">
            {isRegister ? t('auth.signIn') : t('auth.signUp')}
          </AppText>
        </Link>
      </View>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  fields: { gap: spacing.md },
  divider: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  switchRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, paddingTop: spacing.sm },
});
