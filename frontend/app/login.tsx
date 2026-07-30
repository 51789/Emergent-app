import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import { router } from 'expo-router';
import { useAuth } from '../src/services/auth';
import { useAppStore } from '../src/store';
import { TRANSLATIONS } from '../src/constants/categories';
import { BrandLogo } from '../src/components/BrandLogo';

/** Official 4-color Google "G" glyph. */
const GoogleGlyph: React.FC<{ size?: number }> = ({ size = 20 }) => (
  <Svg width={size} height={size} viewBox="0 0 48 48">
    <Path
      fill="#4285F4"
      d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C33.5 6.5 29 5 24 5 12.4 5 3 14.4 3 26s9.4 21 21 21 21-9.4 21-21c0-1.6-.2-3.1-.4-4.5z"
    />
    <Path
      fill="#34A853"
      d="M6.3 14.7l6.6 4.8c1.8-4.4 6-7.5 11.1-7.5 3.1 0 5.9 1.2 8 3l5.7-5.7C33.5 6.5 29 5 24 5 16.6 5 10.2 9.3 6.3 14.7z"
    />
    <Path
      fill="#FBBC05"
      d="M24 47c5 0 9.5-1.7 12.7-4.5l-5.9-5c-1.9 1.3-4.3 2-6.8 2-5.3 0-9.7-3.4-11.3-8l-6.6 5.1C9.9 42.4 16.5 47 24 47z"
    />
    <Path
      fill="#EA4335"
      d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.6l5.9 5c-.4.3 6.1-4.4 6.1-12.6 0-1.6-.2-3.1-.4-4.5z"
    />
  </Svg>
);

type Mode = 'signin' | 'signup';

export default function LoginScreen() {
  const { signIn, signUp, signInWithGoogle } = useAuth();
  const { language } = useAppStore();
  const t = TRANSLATIONS[language];
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const isSignup = mode === 'signup';

  const validate = (): string | null => {
    if (!email.trim()) return language === 'it' ? 'Inserisci la tua email' :
      language === 'es' ? 'Ingresa tu correo' :
      language === 'fr' ? 'Saisissez votre email' :
      language === 'de' ? 'E-Mail eingeben' : 'Enter your email';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      return language === 'it' ? 'Email non valida' :
        language === 'es' ? 'Email no válido' :
        language === 'fr' ? 'Email invalide' :
        language === 'de' ? 'Ungültige E-Mail' : 'Invalid email';
    if (!password) return language === 'it' ? 'Inserisci la password' :
      language === 'es' ? 'Ingresa la contraseña' :
      language === 'fr' ? 'Saisissez le mot de passe' :
      language === 'de' ? 'Passwort eingeben' : 'Enter password';
    if (isSignup && password.length < 6)
      return language === 'it' ? 'La password deve avere almeno 6 caratteri' :
        language === 'es' ? 'La contraseña debe tener al menos 6 caracteres' :
        language === 'fr' ? 'Le mot de passe doit contenir au moins 6 caractères' :
        language === 'de' ? 'Passwort mindestens 6 Zeichen' : 'Password must be at least 6 characters';
    return null;
  };

  const onSubmit = async () => {
    setError(null);
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setLoading(true);
    try {
      if (isSignup) {
        await signUp(email.trim(), password);
      } else {
        await signIn(email.trim(), password);
      }
      router.replace('/');
    } catch (e: any) {
      setError(e?.message ||
        (language === 'it' ? 'Errore. Riprova.' :
         language === 'es' ? 'Error. Reintenta.' :
         language === 'fr' ? 'Erreur. Réessayez.' :
         language === 'de' ? 'Fehler. Erneut versuchen.' : 'Error. Try again.'));
    } finally {
      setLoading(false);
    }
  };

  const onGoogleSignIn = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
      // On web the browser navigates away and this line never runs.
      // On native we return here with a valid session.
      router.replace('/');
    } catch (e: any) {
      // Ignore silent cancel
      const msg = e?.message || '';
      if (!/cancel/i.test(msg)) {
        setError(msg ||
          (language === 'it' ? 'Errore Google. Riprova.' :
           language === 'es' ? 'Error de Google. Reintenta.' :
           language === 'fr' ? 'Erreur Google. Réessayez.' :
           language === 'de' ? 'Google-Fehler. Erneut versuchen.' :
           'Google error. Try again.'));
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Top: close */}
          <View style={styles.top}>
            <TouchableOpacity
              onPress={() => router.canGoBack() ? router.back() : router.replace('/')}
              style={styles.closeBtn}
              hitSlop={{ top: 8, left: 8, right: 8, bottom: 8 }}
            >
              <MaterialIcons name="close" size={26} color="#333" />
            </TouchableOpacity>
          </View>

          {/* Hero */}
          <View style={styles.hero}>
            <View style={styles.logoWrap}>
              <MaterialIcons name="verified-user" size={30} color="#007AFF" />
            </View>
            <View style={{ marginBottom: 12 }}>
              <BrandLogo size={26} color="#0A0A0A" letterSpacing={2} />
            </View>
            <Text style={styles.title}>
              {isSignup ? t.createAccount : t.welcomeBack}
            </Text>
            <Text style={styles.subtitle}>
              {isSignup ? t.signUpSubtitle : t.signInSubtitle}
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <View style={styles.inputWrap}>
              <MaterialIcons name="email" size={18} color="#888" />
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder={t.emailPlaceholder}
                placeholderTextColor="#AAA"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                style={styles.input}
                testID="login-email"
              />
            </View>

            <View style={styles.inputWrap}>
              <MaterialIcons name="lock" size={18} color="#888" />
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder={t.passwordPlaceholder}
                placeholderTextColor="#AAA"
                secureTextEntry={!showPw}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType={isSignup ? 'newPassword' : 'password'}
                style={styles.input}
                testID="login-password"
              />
              <TouchableOpacity
                onPress={() => setShowPw((v) => !v)}
                hitSlop={{ top: 8, left: 8, right: 8, bottom: 8 }}
              >
                <MaterialIcons
                  name={showPw ? 'visibility-off' : 'visibility'}
                  size={20}
                  color="#888"
                />
              </TouchableOpacity>
            </View>

            {!!error && (
              <View style={styles.errorBox}>
                <MaterialIcons name="error-outline" size={16} color="#D14343" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
              onPress={onSubmit}
              disabled={loading}
              activeOpacity={0.85}
              testID="login-submit"
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Text style={styles.primaryBtnText}>
                    {isSignup ? t.signUp : t.signIn}
                  </Text>
                  <MaterialIcons name="arrow-forward" size={18} color="#FFF" />
                </>
              )}
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>
                {language === 'it' ? 'oppure' :
                 language === 'es' ? 'o' :
                 language === 'fr' ? 'ou' :
                 language === 'de' ? 'oder' : 'or'}
              </Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Google sign-in button */}
            <TouchableOpacity
              style={[styles.googleBtn, googleLoading && styles.googleBtnDisabled]}
              onPress={onGoogleSignIn}
              disabled={googleLoading || loading}
              activeOpacity={0.85}
              testID="login-google"
            >
              {googleLoading ? (
                <ActivityIndicator color="#4285F4" />
              ) : (
                <>
                  <GoogleGlyph size={20} />
                  <Text style={styles.googleBtnText}>
                    {language === 'it' ? 'Continua con Google' :
                     language === 'es' ? 'Continuar con Google' :
                     language === 'fr' ? 'Continuer avec Google' :
                     language === 'de' ? 'Mit Google fortfahren' :
                     'Continue with Google'}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.switchBtn}
              onPress={() => {
                setMode(isSignup ? 'signin' : 'signup');
                setError(null);
              }}
              testID="login-toggle-mode"
            >
              <Text style={styles.switchText}>
                {isSignup ? t.haveAccount : t.noAccount}{' '}
                <Text style={styles.switchLink}>
                  {isSignup ? t.signIn : t.signUp}
                </Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF',
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  top: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingVertical: 8,
  },
  closeBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hero: {
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 32,
  },
  logoWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#EEF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  brand: {
    fontSize: 12,
    letterSpacing: 3,
    color: '#007AFF',
    fontWeight: '800',
    marginBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1A1A1A',
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 300,
  },
  form: {
    gap: 12,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#FAFAFA',
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#111',
    padding: 0,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFF0F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorText: {
    color: '#D14343',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  primaryBtn: {
    marginTop: 4,
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryBtnDisabled: {
    opacity: 0.6,
  },
  primaryBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 18,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  dividerText: {
    fontSize: 12,
    color: '#8B8B8B',
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'lowercase',
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#DADCE0',
    paddingVertical: 12,
    borderRadius: 12,
    minHeight: 48,
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
  },
  googleBtnDisabled: {
    opacity: 0.6,
  },
  googleBtnText: {
    color: '#3C4043',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  switchBtn: {
    marginTop: 8,
    alignItems: 'center',
    paddingVertical: 10,
  },
  switchText: {
    color: '#666',
    fontSize: 14,
  },
  switchLink: {
    color: '#007AFF',
    fontWeight: '700',
  },
});
