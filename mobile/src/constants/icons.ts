import type { MaterialIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

/** Valid Material Icons glyph names (type-checked against the icon font map). */
export type IconName = ComponentProps<typeof MaterialIcons>['name'];
