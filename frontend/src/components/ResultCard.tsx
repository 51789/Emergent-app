import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { SearchResult } from '../types';
import { useAppStore } from '../store';
import { TRANSLATIONS } from '../constants/categories';

interface ResultCardProps {
  result: SearchResult;
}

export const ResultCard: React.FC<ResultCardProps> = ({ result }) => {
  const { language } = useAppStore();
  const t = TRANSLATIONS[language];

  const handleOpenLink = () => {
    if (result.source_link) {
      Linking.openURL(result.source_link);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{result.title}</Text>
      <Text style={styles.summary}>{result.summary}</Text>
      
      {result.keywords.length > 0 && (
        <View style={styles.keywordsContainer}>
          <Text style={styles.sectionLabel}>{t.keywords}:</Text>
          <View style={styles.keywordsList}>
            {result.keywords.slice(0, 5).map((keyword, index) => (
              <View key={index} style={styles.keywordChip}>
                <Text style={styles.keywordText}>{keyword}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {result.contacts.length > 0 && (
        <View style={styles.contactsContainer}>
          <Text style={styles.sectionLabel}>{t.contacts}:</Text>
          {result.contacts.map((contact, index) => (
            <Text key={index} style={styles.contactText}>
              {contact}
            </Text>
          ))}
        </View>
      )}

      <TouchableOpacity style={styles.linkButton} onPress={handleOpenLink}>
        <MaterialIcons name="open-in-new" size={20} color="#007AFF" />
        <Text style={styles.linkText}>{t.viewDetails}</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    marginBottom: 8,
  },
  summary: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
    lineHeight: 20,
  },
  keywordsContainer: {
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
  },
  keywordsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  keywordChip: {
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  keywordText: {
    fontSize: 12,
    color: '#007AFF',
  },
  contactsContainer: {
    marginBottom: 12,
  },
  contactText: {
    fontSize: 13,
    color: '#007AFF',
    marginTop: 4,
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  linkText: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '500',
  },
});