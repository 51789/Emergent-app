import type { ReactNode } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { colors } from '@/theme';

interface ScreenProps {
  children: ReactNode;
  /** Safe-area edges to pad. Tab screens leave `bottom` to the tab bar. */
  edges?: readonly Edge[];
  style?: StyleProp<ViewStyle>;
}

const DEFAULT_EDGES: readonly Edge[] = ['top', 'left', 'right'];

/** White full-screen container that respects the device safe areas. */
export function Screen({ children, edges = DEFAULT_EDGES, style }: ScreenProps) {
  return (
    <SafeAreaView style={[styles.root, style]} edges={edges}>
      {children}
    </SafeAreaView>
  );
}

/** Edges for screens that are not inside the tab bar (stack screens). */
export const STACK_EDGES: readonly Edge[] = ['top', 'left', 'right', 'bottom'];

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
});
