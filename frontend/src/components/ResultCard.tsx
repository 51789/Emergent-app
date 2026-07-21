import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { SearchResult } from '../types';
import { useAppStore } from '../store';
import { TRANSLATIONS } from '../constants/categories';

interface ResultCardProps {
  result: SearchResult;
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  onLongPress?: () => void;
}

/**
 * Extract a friendly host label from a URL (e.g. "immobiliare.it")
 * Falls back to the raw string if URL parsing fails.
 */
const getSourceLabel = (url: string): string => {
  if (!url) return '';
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^https?:\/\//, '').split('/')[0];
  }
};

export const ResultCard: React.FC<ResultCardProps> = ({
  result,
  selectionMode = false,
  isSelected = false,
  onToggleSelect,
  onLongPress,
}) => {
  const { language } = useAppStore();
  const t = TRANSLATIONS[language];

  const handleOpenLink = () => {
    if (result.source_link) {
      Linking.openURL(result.source_link).catch(() => {
        // Silent fail — invalid or unreachable URL.
      });
    }
  };

  const handlePress = () => {
    if (selectionMode && onToggleSelect) {
      onToggleSelect();
    }
  };

  const sourceLabel = getSourceLabel(result.source_link);

  return (
    <TouchableOpacity
      style={[styles.card, isSelected && styles.cardSelected]}
      onPress={handlePress}
      onLongPress={onLongPress}
      delayLongPress={350}
      activeOpacity={selectionMode ? 0.7 : 1}
      testID={`result-card-${result.id}`}
    >
      {selectionMode && (
        <View style={styles.checkboxContainer}>
          <MaterialIcons
            name={isSelected ? 'check-circle' : 'radio-button-unchecked'}
            size={24}
            color={isSelected ? '#007AFF' : '#BBB'}
            testID={`result-checkbox-${result.id}`}
          />
        </View>
      )}

      <View style={styles.contentContainer}>
        <Text style={styles.title}>{result.title}</Text>
        <Text style={styles.summary}>{result.summary}</Text>

        {/* Source Reference Section */}
        {result.source_link ? (
          <View style={styles.sourceSection}>
            <View style={styles.sourceRow}>
              <MaterialIcons name="link" size={16} color="#666" />
              <Text style={styles.sourceLabel}>
                {language === 'it' ? 'Fonte:' : 'Source:'}
              </Text>
              <Text style={styles.sourceDomain} numberOfLines={1}>
                {sourceLabel}
              </Text>
            </View>
            <Text style={styles.sourceUrl} numberOfLines={1}>
              {result.source_link}
            </Text>
          </View>
        ) : null}

        {result.contacts && result.contacts.length > 0 && (
          <View style={styles.contactsContainer}>
            <Text style={styles.sectionLabel}>{t.contacts}:</Text>
            {result.contacts.map((contact, index) => (
              <Text key={index} style={styles.contactText}>
                {contact}
              </Text>
            ))}
          </View>
        )}

        {!selectionMode && result.source_link ? (
          <TouchableOpacity
            style={styles.linkButton}
            onPress={handleOpenLink}
            testID={`open-link-${result.id}`}
          >
            <MaterialIcons name="open-in-new" size={18} color="#007AFF" />
            <Text style={styles.linkText}>
              {language === 'it' ? 'Vai al sito' : 'Visit site'}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  cardSelected: {
    borderColor: '#007AFF',
    backgroundColor: '#F0F7FF',
  },
  checkboxContainer: {
    marginRight: 12,
    paddingTop: 2,
  },
  contentContainer: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  summary: {
    fontSize: 14,
    color: '#555',
    marginBottom: 12,
    lineHeight: 21,
  },
  sourceSection: {
    backgroundColor: '#F5F7FA',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#007AFF',
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  sourceLabel: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
  },
  sourceDomain: {
    fontSize: 13,
    color: '#007AFF',
    fontWeight: '700',
    flex: 1,
  },
  sourceUrl: {
    fontSize: 11,
    color: '#888',
    marginLeft: 22,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
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
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  linkText: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '600',
  },
});
