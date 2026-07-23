import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAppStore } from '../src/store';
import { TRANSLATIONS, LANGUAGES } from '../src/constants/categories';
import { api } from '../src/services/api';
import { PremiumCard } from '../src/components/PremiumCard';
import { useAuth } from '../src/services/auth';
import { FlagCircle } from '../src/components/FlagCircle';

export default function SettingsScreen() {
  const { language, setLanguage } = useAppStore();
  const { user, signOut } = useAuth();
  const [apiStatus, setApiStatus] = useState<any>(null);
  const t = TRANSLATIONS[language];

  useEffect(() => {
    checkApiHealth();
  }, []);

  const checkApiHealth = async () => {
    try {
      const status = await api.healthCheck();
      setApiStatus(status);
    } catch (error) {
      console.error('Health check failed:', error);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <MaterialIcons name="arrow-back" size={28} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t.settings}</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
      >
        {/* Account Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {language === 'it' ? 'Account' : 'Account'}
          </Text>
          {user ? (
            <>
              <View style={styles.accountCard}>
                <View style={styles.accountAvatar}>
                  <MaterialIcons
                    name={user.role === 'admin' ? 'admin-panel-settings' : 'person'}
                    size={24}
                    color={user.role === 'admin' ? '#B8860B' : '#007AFF'}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.accountEmail} numberOfLines={1}>
                    {user.email}
                  </Text>
                  <View style={styles.accountTags}>
                    <View
                      style={[
                        styles.tag,
                        user.role === 'admin' ? styles.tagAdmin : styles.tagUser,
                      ]}
                    >
                      <Text
                        style={[
                          styles.tagText,
                          user.role === 'admin' && styles.tagTextAdmin,
                        ]}
                      >
                        {user.role.toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.tag}>
                      <Text style={styles.tagText}>
                        {(user.plan || 'free').toUpperCase()}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>

              {user.role === 'admin' && (
                <TouchableOpacity
                  style={[styles.settingItem, { marginTop: 8 }]}
                  onPress={() => router.push('/admin')}
                  activeOpacity={0.7}
                  testID="settings-admin-panel"
                >
                  <View style={styles.settingInfo}>
                    <MaterialIcons name="dashboard" size={24} color="#B8860B" />
                    <Text style={styles.settingLabel}>
                      {language === 'it' ? 'Pannello Admin' : 'Admin Panel'}
                    </Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={24} color="#BBB" />
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.settingItem, { marginTop: 8 }]}
                onPress={() => {
                  Alert.alert(
                    language === 'it' ? 'Disconnetti' : 'Sign out',
                    language === 'it'
                      ? 'Sei sicuro di voler uscire?'
                      : 'Are you sure you want to sign out?',
                    [
                      { text: language === 'it' ? 'Annulla' : 'Cancel', style: 'cancel' },
                      {
                        text: language === 'it' ? 'Esci' : 'Sign out',
                        style: 'destructive',
                        onPress: async () => {
                          await signOut();
                          router.replace('/login');
                        },
                      },
                    ]
                  );
                }}
                activeOpacity={0.7}
                testID="settings-signout"
              >
                <View style={styles.settingInfo}>
                  <MaterialIcons name="logout" size={24} color="#D14343" />
                  <Text style={[styles.settingLabel, { color: '#D14343' }]}>
                    {language === 'it' ? 'Disconnetti' : 'Sign out'}
                  </Text>
                </View>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={styles.loginBtn}
              onPress={() => router.push('/login')}
              activeOpacity={0.85}
              testID="settings-login"
            >
              <MaterialIcons name="login" size={20} color="#FFF" />
              <Text style={styles.loginBtnText}>
                {language === 'it' ? 'Accedi / Registrati' : 'Sign in / Register'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Language Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.language}</Text>
          <View style={styles.languageList}>
            {LANGUAGES.map((lang, idx) => {
              const active = language === lang.code;
              return (
                <TouchableOpacity
                  key={lang.code}
                  style={[
                    styles.langRow,
                    idx !== LANGUAGES.length - 1 && styles.langRowDivider,
                    active && styles.langRowActive,
                  ]}
                  onPress={() => setLanguage(lang.code)}
                  activeOpacity={0.7}
                  testID={`lang-${lang.code}`}
                >
                  <View style={styles.langLeft}>
                    <FlagCircle flag={lang.flag} size={30} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.langLabel}>
                        {language === 'it'
                          ? lang.label
                          : language === 'en' && lang.code === 'it'
                          ? 'Italian'
                          : language === 'en' && lang.code === 'es'
                          ? 'Spanish'
                          : language === 'en' && lang.code === 'fr'
                          ? 'French'
                          : language === 'en' && lang.code === 'de'
                          ? 'German'
                          : lang.label}
                      </Text>
                      <Text style={styles.langNative}>{lang.nativeLabel}</Text>
                    </View>
                  </View>
                  {active ? (
                    <View style={styles.checkedCircle}>
                      <MaterialIcons name="check" size={14} color="#FFF" />
                    </View>
                  ) : (
                    <View style={styles.uncheckedCircle} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Ricerche section — Cronologia + Preferiti */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {language === 'it' ? 'Ricerche' : 'Searches'}
          </Text>
          <TouchableOpacity
            style={styles.settingItem}
            onPress={() => router.push('/history')}
            activeOpacity={0.7}
            testID="history-menu-item"
          >
            <View style={styles.settingInfo}>
              <MaterialIcons name="history" size={24} color="#007AFF" />
              <Text style={styles.settingLabel}>
                {language === 'it' ? 'Cronologia' : 'History'}
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#BBB" />
          </TouchableOpacity>

          <View style={{ height: 8 }} />

          <TouchableOpacity
            style={styles.settingItem}
            onPress={() => router.push('/favorites')}
            activeOpacity={0.7}
            testID="favorites-menu-item"
          >
            <View style={styles.settingInfo}>
              <MaterialIcons name="star" size={24} color="#FFC107" />
              <Text style={styles.settingLabel}>
                {language === 'it' ? 'Preferiti' : 'Favorites'}
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#BBB" />
          </TouchableOpacity>
        </View>

        {/* Premium Subscription — compact card that opens the plans page */}
        <View style={styles.section}>
          <PremiumCard onPress={() => router.push('/subscribe')} />
        </View>

        {/* System Status Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {language === 'it' ? 'Stato Sistema' : 'System Status'}
          </Text>
          
          {apiStatus && (
            <>
              <View style={styles.statusItem}>
                <MaterialIcons
                  name={apiStatus.status === 'healthy' ? 'check-circle' : 'error'}
                  size={24}
                  color={apiStatus.status === 'healthy' ? '#34C759' : '#FF3B30'}
                />
                <Text style={styles.statusLabel}>
                  API: {apiStatus.status === 'healthy' ? 'Online' : 'Offline'}
                </Text>
              </View>
              
              <View style={styles.statusItem}>
                <MaterialIcons
                  name={apiStatus.llm_configured ? 'check-circle' : 'error'}
                  size={24}
                  color={apiStatus.llm_configured ? '#34C759' : '#FF3B30'}
                />
                <Text style={styles.statusLabel}>
                  AI: {apiStatus.llm_configured ? 'Configured' : 'Not Configured'}
                </Text>
              </View>
              
              <View style={styles.statusItem}>
                <MaterialIcons
                  name={apiStatus.serper_configured ? 'check-circle' : 'warning'}
                  size={24}
                  color={apiStatus.serper_configured ? '#34C759' : '#FF9500'}
                />
                <Text style={styles.statusLabel}>
                  Search API: {apiStatus.serper_configured ? 'Configured' : 'Using Mock Data'}
                </Text>
              </View>
            </>
          )}
          
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={checkApiHealth}
          >
            <MaterialIcons name="refresh" size={20} color="#007AFF" />
            <Text style={styles.refreshText}>
              {language === 'it' ? 'Aggiorna Stato' : 'Refresh Status'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* About Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {language === 'it' ? 'Informazioni' : 'About'}
          </Text>
          <View style={styles.aboutCard}>
            <Text style={styles.appName}>JARVIS</Text>
            <Text style={styles.appSubtitle}>
              {language === 'it'
                ? 'Il tuo assistente digitale'
                : 'Your Digital Assistant'}
            </Text>
            <Text style={styles.appVersion}>Version 1.0.0</Text>
          </View>
        </View>

        {/* Instructions */}
        {apiStatus && !apiStatus.serper_configured && (
          <View style={styles.instructionCard}>
            <MaterialIcons name="info" size={24} color="#007AFF" />
            <View style={styles.instructionContent}>
              <Text style={styles.instructionTitle}>
                {language === 'it' ? 'Configura API di Ricerca' : 'Configure Search API'}
              </Text>
              <Text style={styles.instructionText}>
                {language === 'it'
                  ? 'Per risultati reali, ottieni una chiave API gratuita da serper.dev e aggiungila al file .env del backend.'
                  : 'For real results, get a free API key from serper.dev and add it to the backend .env file.'}
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
  },
  placeholder: {
    width: 44,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    marginBottom: 12,
  },
  settingItem: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingLabel: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  statusItem: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  statusLabel: {
    fontSize: 14,
    color: '#333',
  },
  refreshButton: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  refreshText: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '600',
  },
  aboutCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
  },
  appName: {
    fontSize: 28,
    fontWeight: '700',
    color: '#007AFF',
    marginBottom: 8,
  },
  appSubtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 4,
  },
  appVersion: {
    fontSize: 12,
    color: '#999',
  },
  instructionCard: {
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    gap: 12,
  },
  instructionContent: {
    flex: 1,
  },
  instructionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
    marginBottom: 4,
  },
  instructionText: {
    fontSize: 13,
    color: '#333',
    lineHeight: 18,
  },
  accountCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  accountAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountEmail: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111',
    marginBottom: 6,
  },
  accountTags: { flexDirection: 'row', gap: 6 },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#F0F0F0',
  },
  tagText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#666',
    letterSpacing: 0.5,
  },
  tagAdmin: { backgroundColor: '#FFF8E1' },
  tagTextAdmin: { color: '#B8860B' },
  tagUser: { backgroundColor: '#EEF6FF' },
  loginBtn: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loginBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  languageList: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    overflow: 'hidden',
  },
  langRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    gap: 12,
  },
  langRowActive: {
    backgroundColor: '#F5F9FF',
  },
  langRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EEE',
  },
  langLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  langLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111',
  },
  langNative: {
    fontSize: 11,
    color: '#888',
    fontWeight: '500',
    marginTop: 1,
  },
  checkedCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uncheckedCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#DDD',
    backgroundColor: '#FFF',
  },
});