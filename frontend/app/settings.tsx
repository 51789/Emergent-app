import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
  Modal,
  Pressable,
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
  const [langOpen, setLangOpen] = useState(false);
  const t = TRANSLATIONS[language];
  const currentLang = LANGUAGES.find((l) => l.code === language) || LANGUAGES[0];

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
            {t.account}
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
                      {t.adminPanel}
                    </Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={24} color="#BBB" />
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.settingItem, { marginTop: 8 }]}
                onPress={() => {
                  Alert.alert(
                    t.signOut,
                    t.signOutConfirm,
                    [
                      { text: t.cancel, style: 'cancel' },
                      {
                        text: t.exit,
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
                    {t.signOut}
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
                {t.signInRegister}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Language Section — collapsed selector with dropdown */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.language}</Text>
          <TouchableOpacity
            style={styles.languageSelector}
            onPress={() => setLangOpen(true)}
            activeOpacity={0.7}
            testID="language-selector"
          >
            <View style={styles.langLeft}>
              <FlagCircle flag={currentLang.flag} size={30} />
              <View style={{ flex: 1 }}>
                <Text style={styles.langLabel}>{currentLang.nativeLabel}</Text>
              </View>
            </View>
            <MaterialIcons name="arrow-drop-down" size={26} color="#888" />
          </TouchableOpacity>
        </View>

        {/* Ricerche section — Cronologia + Preferiti */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {t.ricercheSection}
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
                {t.history}
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
                {t.favorites}
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
          <Text style={styles.sectionTitle}>{t.systemStatus}</Text>
          
          {apiStatus && (
            <>
              <View style={styles.statusItem}>
                <MaterialIcons
                  name={apiStatus.status === 'healthy' ? 'check-circle' : 'error'}
                  size={24}
                  color={apiStatus.status === 'healthy' ? '#34C759' : '#FF3B30'}
                />
                <Text style={styles.statusLabel}>
                  {apiStatus.status === 'healthy' ? t.apiOnline : t.apiOffline}
                </Text>
              </View>
              
              <View style={styles.statusItem}>
                <MaterialIcons
                  name={apiStatus.llm_configured ? 'check-circle' : 'error'}
                  size={24}
                  color={apiStatus.llm_configured ? '#34C759' : '#FF3B30'}
                />
                <Text style={styles.statusLabel}>
                  {apiStatus.llm_configured ? t.aiConfigured : t.aiNotConfigured}
                </Text>
              </View>
              
              <View style={styles.statusItem}>
                <MaterialIcons
                  name={apiStatus.serper_configured ? 'check-circle' : 'warning'}
                  size={24}
                  color={apiStatus.serper_configured ? '#34C759' : '#FF9500'}
                />
                <Text style={styles.statusLabel}>
                  {apiStatus.serper_configured ? t.searchApiReady : t.searchApiMock}
                </Text>
              </View>
            </>
          )}
          
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={checkApiHealth}
          >
            <MaterialIcons name="refresh" size={20} color="#007AFF" />
            <Text style={styles.refreshText}>{t.refreshStatus}</Text>
          </TouchableOpacity>
        </View>

        {/* About Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.about}</Text>
          <View style={styles.aboutCard}>
            <Text style={styles.appName}>JARVIS</Text>
            <Text style={styles.appSubtitle}>
              {language === 'it'
                ? 'Il tuo assistente digitale'
                : language === 'es'
                ? 'Tu asistente digital'
                : language === 'fr'
                ? 'Votre assistant numérique'
                : language === 'de'
                ? 'Ihr digitaler Assistent'
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

      {/* Language picker modal */}
      <Modal
        visible={langOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setLangOpen(false)}
      >
        <Pressable style={styles.langModalOverlay} onPress={() => setLangOpen(false)}>
          <Pressable style={styles.langModalCard} onPress={() => { /* prevent close */ }}>
            <View style={styles.langModalHeader}>
              <Text style={styles.langModalTitle}>{t.language}</Text>
              <TouchableOpacity onPress={() => setLangOpen(false)}>
                <MaterialIcons name="close" size={22} color="#666" />
              </TouchableOpacity>
            </View>
            {LANGUAGES.map((lang, idx) => {
              const active = language === lang.code;
              return (
                <TouchableOpacity
                  key={lang.code}
                  style={[
                    styles.langModalRow,
                    idx !== LANGUAGES.length - 1 && styles.langModalRowDivider,
                    active && styles.langModalRowActive,
                  ]}
                  onPress={() => {
                    setLanguage(lang.code);
                    setLangOpen(false);
                  }}
                  activeOpacity={0.7}
                  testID={`lang-${lang.code}`}
                >
                  <FlagCircle flag={lang.flag} size={28} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.langLabel}>{lang.nativeLabel}</Text>
                  </View>
                  {active && (
                    <MaterialIcons name="check-circle" size={20} color="#007AFF" />
                  )}
                </TouchableOpacity>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
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
  languageSelector: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  langModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  langModalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFF',
    borderRadius: 16,
    overflow: 'hidden',
    boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
    elevation: 8,
  },
  langModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EEE',
  },
  langModalTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111',
  },
  langModalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  langModalRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F5F5F5',
  },
  langModalRowActive: {
    backgroundColor: '#F5F9FF',
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