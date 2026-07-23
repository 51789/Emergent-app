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
import { router } from 'expo-router';
import { useAuth } from '../src/services/auth';

type Mode = 'signin' | 'signup';

export default function LoginScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const isSignup = mode === 'signup';

  const validate = (): string | null => {
    if (!email.trim()) return 'Inserisci la tua email';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Email non valida';
    if (!password) return 'Inserisci la password';
    if (isSignup && password.length < 6) return 'La password deve avere almeno 6 caratteri';
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
      setError(e?.message || 'Errore. Riprova.');
    } finally {
      setLoading(false);
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
            <Text style={styles.brand}>JARVIS</Text>
            <Text style={styles.title}>
              {isSignup ? 'Crea il tuo account' : 'Bentornato'}
            </Text>
            <Text style={styles.subtitle}>
              {isSignup
                ? 'Registrati per gestire il tuo piano e le tue ricerche'
                : 'Accedi al tuo account per continuare'}
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <View style={styles.inputWrap}>
              <MaterialIcons name="email" size={18} color="#888" />
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="tuaemail@esempio.com"
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
                placeholder="Password"
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
                    {isSignup ? 'Crea account' : 'Accedi'}
                  </Text>
                  <MaterialIcons name="arrow-forward" size={18} color="#FFF" />
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
                {isSignup ? 'Hai già un account?' : 'Non hai un account?'}{' '}
                <Text style={styles.switchLink}>
                  {isSignup ? 'Accedi' : 'Registrati'}
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
