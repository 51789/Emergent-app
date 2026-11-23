import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

/** Brand name, also used as the accessibility label. */
export const BRAND_NAME = 'Consulens';

const SOURCES = {
  /** Lens-"C" + "ConsuLens". */
  wordmark: require('../../assets/images/brand/logo-wordmark.png'),
  /** Just the magnifying-glass "C". */
  mark: require('../../assets/images/brand/logo-mark.png'),
} as const;

/** width / height of the source images, so the logo is always rendered undistorted. */
const ASPECT = {
  wordmark: 1185 / 302,
  mark: 277 / 298,
} as const;

interface BrandLogoProps {
  /** Rendered height in dp; the width follows from the image aspect ratio. */
  height?: number;
  variant?: keyof typeof SOURCES;
  testID?: string;
}

/** The official Consulens logo as an image (header, auth screens, boot error). */
export function BrandLogo({ height = 28, variant = 'wordmark', testID }: BrandLogoProps) {
  return (
    <View style={styles.row} testID={testID}>
      <Image
        source={SOURCES[variant]}
        style={{ height, width: height * ASPECT[variant] }}
        contentFit="contain"
        transition={0}
        accessible
        accessibilityRole="image"
        accessibilityLabel={BRAND_NAME}
        alt={BRAND_NAME}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', justifyContent: 'center' },
});
