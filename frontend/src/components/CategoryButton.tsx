import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Category } from '../types';

interface CategoryButtonProps {
  category: Category;
  isSelected: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}

export const CategoryButton: React.FC<CategoryButtonProps> = ({
  category,
  isSelected,
  onPress,
  onLongPress,
}) => {
  return (
    <TouchableOpacity
      style={[styles.button, isSelected && styles.buttonSelected]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      activeOpacity={0.7}
      testID={`category-button-${category.id}`}
    >
      {isSelected && (
        <View style={styles.checkmark} testID={`selected-badge-${category.id}`}>
          <MaterialIcons name="check-circle" size={18} color="#007AFF" />
        </View>
      )}
      <MaterialIcons
        name={category.icon}
        size={28}
        color={isSelected ? '#007AFF' : '#666'}
        style={styles.icon}
      />
      <Text style={[styles.label, isSelected && styles.labelSelected]}>
        {category.label}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#F5F5F5',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 120,
    borderWidth: 2,
    borderColor: 'transparent',
    position: 'relative',
  },
  buttonSelected: {
    backgroundColor: '#E3F2FD',
    borderColor: '#007AFF',
  },
  checkmark: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  icon: {
    marginBottom: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  labelSelected: {
    color: '#007AFF',
  },
});
