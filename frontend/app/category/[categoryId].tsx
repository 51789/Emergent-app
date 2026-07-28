import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  TextInput,
  ActivityIndicator,
  Platform,
  Animated,
  KeyboardAvoidingView,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useAppStore } from '../../src/store';
import { CATEGORIES, TRANSLATIONS } from '../../src/constants/categories';
import { CATEGORY_KEYWORDS } from '../../src/constants/keywords';
import { api } from '../../src/services/api';
import { BrandLogo } from '../../src/components/BrandLogo';

export default function CategoryDetailScreen() {
  const { categoryId } = useLocalSearchParams<{ categoryId: string }>();
  const { language, addActiveSearch } = useAppStore();
  const [query, setQuery] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const t = TRANSLATIONS[language];

  const category = CATEGORIES.find((cat) => cat.id === categoryId);
  // Fallback chain: current language → English → Italian → []
  // Prevents empty keyword list when a translation is missing for a language.
  const keywordMap = categoryId
    ? CATEGORY_KEYWORDS[categoryId as keyof typeof CATEGORY_KEYWORDS]
    : undefined;
  const keywords =
    (keywordMap && (keywordMap as any)[language]) ||
    (keywordMap && (keywordMap as any).en) ||
    (keywordMap && (keywordMap as any).it) ||
    [];

  useEffect(() => {
    if (isRecording) {
      // Start pulse animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.3,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isRecording, pulseAnim]);

  const handleMicPress = async () => {
    // Voice recording requires native build - show info to user
    if (Platform.OS === 'web') {
      // Use Web Speech API on web
      handleWebSpeechRecognition();
    } else {
      // For native, show info that voice needs full build
      Alert.alert(
        language === 'it' ? 'Registrazione Vocale' : 'Voice Recording',
        language === 'it'
          ? "La registrazione vocale sarà disponibile dopo il deploy dell'app come build nativa. Per ora, digita la tua richiesta."
          : 'Voice recording will be available after deploying the app as a native build. For now, type your request.',
        [{ text: 'OK' }]
      );
    }
  };

  const handleWebSpeechRecognition = () => {
    // @ts-ignore - Web Speech API
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      Alert.alert(
        language === 'it' ? 'Non Disponibile' : 'Not Available',
        t.voiceNotAvailable
      );
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = language === 'it' ? 'it-IT' : 'en-US';
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = () => {
      setIsRecording(true);
    };

    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((result: any) => result[0].transcript)
        .join('');
      setQuery(transcript);
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognition.start();
  };

  const handleSubmit = async () => {
    if (!query.trim() || !categoryId) return;

    try {
      setProcessing(true);
      const result = await api.processSearch(query.trim(), categoryId, language);
      
      addActiveSearch({
        id: result.search_id,
        query: query.trim(),
        category: categoryId,
        language,
        created_at: new Date().toISOString(),
        is_active: true,
      });

      router.push({
        pathname: '/results',
        params: { searchId: result.search_id },
      });
    } catch (error) {
      console.error('Error processing search:', error);
      Alert.alert(
        language === 'it' ? 'Errore' : 'Error',
        language === 'it'
          ? 'Si è verificato un errore durante la ricerca.'
          : 'An error occurred during the search.'
      );
    } finally {
      setProcessing(false);
    }
  };

  const handleAddPress = () => {
    // Focus on the text input - could also show suggestions/templates
    // For now just clear the input to indicate ready to type
    setQuery('');
  };

  if (!category) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.errorText}>Category not found</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        {/* Header */}
        <View style={styles.header} testID="category-header">
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            testID="back-button"
          >
            <MaterialIcons name="arrow-back" size={28} color="#333" />
          </TouchableOpacity>
          <BrandLogo size={20} color="#2E2E2E" letterSpacing={1} />
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Category Title */}
          <Text style={styles.title} testID="category-title">
            {category.label}
          </Text>

          {/* Search Bar */}
          <View
            style={[styles.searchBar, isRecording && styles.searchBarRecording]}
            testID="search-bar"
          >
            {/* + icon on left */}
            <TouchableOpacity
              style={styles.iconButton}
              onPress={handleAddPress}
              testID="add-button"
            >
              <MaterialIcons name="add" size={26} color="#666" />
            </TouchableOpacity>

            {/* Text Input */}
            <TextInput
              style={styles.input}
              value={query}
              onChangeText={setQuery}
              placeholder={isRecording ? t.recording : t.insertRequest}
              placeholderTextColor={isRecording ? '#FF3B30' : '#999'}
              multiline={false}
              editable={!processing}
              testID="search-input"
            />

            {/* Microphone icon */}
            <TouchableOpacity
              style={styles.iconButton}
              onPress={handleMicPress}
              testID="mic-button"
              disabled={processing}
            >
              <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                <MaterialIcons
                  name={isRecording ? 'mic' : 'mic-none'}
                  size={26}
                  color={isRecording ? '#FF3B30' : '#666'}
                />
              </Animated.View>
            </TouchableOpacity>

            {/* Submit button */}
            <TouchableOpacity
              style={[
                styles.submitButton,
                (!query.trim() || processing) && styles.submitButtonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={!query.trim() || processing}
              testID="submit-button"
            >
              {processing ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <MaterialIcons name="arrow-upward" size={22} color="#FFF" />
              )}
            </TouchableOpacity>
          </View>

          {/* Recording indicator */}
          {isRecording && (
            <View style={styles.recordingIndicator} testID="recording-indicator">
              <View style={styles.recordingDot} />
              <Text style={styles.recordingText}>{t.recording}</Text>
            </View>
          )}

          {/* Keywords Section */}
          <View style={styles.keywordsSection}>
            <Text style={styles.keywordsTitle} testID="keywords-title">
              {t.keywordsTitle}
            </Text>

            <View style={styles.keywordsList}>
              {keywords.map((keyword, index) => (
                <View
                  key={index}
                  style={styles.keywordItem}
                  testID={`keyword-${index}`}
                >
                  <View style={styles.keywordIconWrapper}>
                    <MaterialIcons
                      name={keyword.icon as any}
                      size={22}
                      color="#007AFF"
                    />
                  </View>
                  <Text style={styles.keywordText}>{keyword.text}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Helper text */}
          <View style={styles.helperContainer}>
            <MaterialIcons name="info-outline" size={16} color="#999" />
            <Text style={styles.helperText}>
              {language === 'it'
                ? 'Includi queste informazioni nella tua richiesta per risultati migliori'
                : 'Include this information in your request for better results'}
            </Text>
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
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  backButton: {
    padding: 8,
  },
  headerSpacer: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#1A1A1A',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 32,
    letterSpacing: 0.5,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F7',
    borderRadius: 28,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderWidth: 2,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  searchBarRecording: {
    borderColor: '#FF3B30',
    backgroundColor: '#FFF5F5',
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#333',
    paddingHorizontal: 8,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    fontWeight: '500',
  },
  submitButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },
  submitButtonDisabled: {
    backgroundColor: '#CCC',
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    gap: 8,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF3B30',
  },
  recordingText: {
    fontSize: 14,
    color: '#FF3B30',
    fontWeight: '600',
  },
  keywordsSection: {
    marginTop: 40,
  },
  keywordsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 20,
    letterSpacing: 0.8,
  },
  keywordsList: {
    gap: 16,
  },
  keywordItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  keywordIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
  },
  keywordText: {
    flex: 1,
    fontSize: 14,
    color: '#333',
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  helperContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 32,
    paddingHorizontal: 4,
  },
  helperText: {
    flex: 1,
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
    lineHeight: 18,
  },
  errorText: {
    textAlign: 'center',
    fontSize: 16,
    color: '#FF3B30',
    marginTop: 40,
  },
});
