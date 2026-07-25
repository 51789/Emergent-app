import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Dimensions, Animated, Easing, Platform } from 'react-native';
import { BrandLogo } from './BrandLogo';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface AnimatedSplashProps {
  onFinish: () => void;
}

type Phase = 'logo' | 'tagline' | 'done';

// Font family with system fallback in case Inter didn't load
const FONT_MEDIUM = Platform.select({
  ios: 'Inter-Medium',
  android: 'Inter-Medium',
  default: 'Inter-Medium, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
});

export const AnimatedSplash: React.FC<AnimatedSplashProps> = ({ onFinish }) => {
  const [phase, setPhase] = useState<Phase>('logo');
  const finishedRef = useRef(false);

  // Logo animation values
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.85)).current;
  const cursorOpacity = useRef(new Animated.Value(0)).current;

  // Tagline animation values
  const taglineTranslateX = useRef(new Animated.Value(SCREEN_WIDTH)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;

  const safeFinish = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setPhase('done');
    onFinish();
  };

  useEffect(() => {
    // ===== PHASE 1: LOGO IN =====
    Animated.parallel([
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 800,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(logoScale, {
        toValue: 1,
        duration: 900,
        easing: Easing.out(Easing.back(1.4)),
        useNativeDriver: true,
      }),
    ]).start();

    // Blinking cursor
    Animated.loop(
      Animated.sequence([
        Animated.timing(cursorOpacity, {
          toValue: 1,
          duration: 500,
          delay: 400,
          useNativeDriver: true,
        }),
        Animated.timing(cursorOpacity, {
          toValue: 0.2,
          duration: 500,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // ===== PHASE 2: LOGO OUT =====
    const logoOutTimer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(logoOpacity, {
          toValue: 0,
          duration: 500,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(logoScale, {
          toValue: 1.15,
          duration: 500,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(() => {
        setPhase('tagline');
      });
    }, 1800);

    // ===== PHASE 3: TAGLINE IN =====
    const taglineInTimer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(taglineOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(taglineTranslateX, {
          toValue: 0,
          duration: 900,
          easing: Easing.out(Easing.exp),
          useNativeDriver: true,
        }),
      ]).start();
    }, 2350);

    // ===== PHASE 4: TAGLINE OUT + FINISH =====
    const finishTimer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(taglineOpacity, {
          toValue: 0,
          duration: 500,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(taglineTranslateX, {
          toValue: -SCREEN_WIDTH * 0.4,
          duration: 500,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(() => {
        safeFinish();
      });
    }, 4200);

    // ===== HARD SAFETY FALLBACK =====
    // If for any reason animations don't fire their callbacks (e.g. component
    // is backgrounded on Android and JS timers pause), always exit the splash
    // by 6 seconds so the user is never stuck on a blank screen.
    const hardFallback = setTimeout(() => {
      safeFinish();
    }, 6000);

    return () => {
      clearTimeout(logoOutTimer);
      clearTimeout(taglineInTimer);
      clearTimeout(finishTimer);
      clearTimeout(hardFallback);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase === 'done') return null;

  return (
    <View style={styles.container} testID="animated-splash" pointerEvents="none">
      {/* CONNECTA Wordmark */}
      <Animated.View
        style={[
          styles.logoContainer,
          {
            opacity: logoOpacity,
            transform: [{ scale: logoScale }],
          },
        ]}
      >
        <BrandLogo size={56} color="#0A0A0A" letterSpacing={3} testID="splash-logo" />
        <Animated.View
          style={[styles.cursorDot, { opacity: cursorOpacity }]}
        />
      </Animated.View>

      {/* Scrolling Tagline */}
      <Animated.View
        style={[
          styles.taglineContainer,
          {
            opacity: taglineOpacity,
            transform: [{ translateX: taglineTranslateX }],
          },
        ]}
      >
        <Text style={[styles.tagline, { fontFamily: FONT_MEDIUM }]} testID="splash-tagline">
          il tuo assistente digitale a portata di click
        </Text>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  logoContainer: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
  },
  logo: {
    fontSize: 64,
    fontWeight: '800',
    letterSpacing: 4,
    color: '#0A0A0A',
    textAlign: 'center',
  },
  cursorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#007AFF',
    marginLeft: 8,
    marginTop: 28,
  },
  taglineContainer: {
    position: 'absolute',
    width: '100%',
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  tagline: {
    fontSize: 18,
    fontWeight: '500',
    color: '#333',
    textAlign: 'center',
    letterSpacing: 0.3,
    lineHeight: 26,
  },
});
