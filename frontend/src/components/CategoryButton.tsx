import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Category } from '../types';

interface CategoryButtonProps {
  category: Category;
  isSelected: boolean;
  onPress: () => void;
}

export const CategoryButton: React.FC<CategoryButtonProps> = ({
  category,
  isSelected,
  onPress,
}) => {
  return (
    <TouchableOpacity
      style={[styles.button, isSelected && styles.buttonSelected]}
      onPress={onPress}
      activeOpacity={0.7}
    >
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
  },
  buttonSelected: {
    backgroundColor: '#E3F2FD',
    borderColor: '#007AFF',
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