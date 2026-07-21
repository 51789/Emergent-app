import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Switch,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAppStore } from '../src/store';
import { TRANSLATIONS } from '../src/constants/categories';
import { api } from '../src/services/api';

export default function SettingsScreen() {
  const { language, setLanguage } = useAppStore();
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
        {/* Language Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.language}</Text>
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <MaterialIcons name="language" size={24} color="#007AFF" />
              <Text style={styles.settingLabel}>
                {language === 'it' ? 'Italiano' : 'English'}
              </Text>
            </View>
            <Switch
              value={language === 'en'}
              onValueChange={(value) => setLanguage(value ? 'en' : 'it')}
              trackColor={{ false: '#E0E0E0', true: '#007AFF' }}
              thumbColor="#FFF"
            />
          </View>
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
});