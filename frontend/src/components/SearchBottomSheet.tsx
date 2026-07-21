import React, { forwardRef, useCallback, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetView } from '@gorhom/bottom-sheet';
import { useAppStore } from '../store';
import { TRANSLATIONS } from '../constants/categories';

interface SearchBottomSheetProps {
  onSubmit: (query: string, category: string) => void;
}

export const SearchBottomSheet = forwardRef<BottomSheet, SearchBottomSheetProps>(
  ({ onSubmit }, ref) => {
    const { language, selectedCategories } = useAppStore();
    const [query, setQuery] = React.useState('');
    const t = TRANSLATIONS[language];

    const snapPoints = useMemo(() => ['50%', '80%'], []);

    const renderBackdrop = useCallback(
      (props: any) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
        />
      ),
      []
    );

    const handleSubmit = () => {
      if (query.trim() && selectedCategories.length > 0) {
        selectedCategories.forEach((category) => {
          onSubmit(query.trim(), category);
        });
        setQuery('');
        if (ref && typeof ref !== 'function') {
          ref.current?.close();
        }
      }
    };

    return (
      <BottomSheet
        ref={ref}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
      >
        <BottomSheetView style={styles.contentContainer}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.container}
          >
            <Text style={styles.title}>{t.createSearch}</Text>
            <TextInput
              style={styles.input}
              placeholder={t.searchPlaceholder}
              value={query}
              onChangeText={setQuery}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={[styles.button, styles.submitButton]}
                onPress={handleSubmit}
                disabled={!query.trim() || selectedCategories.length === 0}
              >
                <Text style={styles.buttonText}>{t.submit}</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </BottomSheetView>
      </BottomSheet>
    );
  }
);

const styles = StyleSheet.create({
  contentContainer: {
    flex: 1,
  },
  container: {
    flex: 1,
    padding: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
    marginBottom: 16,
  },
  input: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    minHeight: 120,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  buttonContainer: {
    marginTop: 16,
  },
  button: {
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  submitButton: {
    backgroundColor: '#007AFF',
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
});