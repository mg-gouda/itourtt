import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StatusBar, StyleSheet, Text, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';

/**
 * The JS half of the launch screen. The native window already shows the same
 * navy gradient + badge (each app's res/drawable/splash_background.xml), so this picks up
 * seamlessly, adds the wordmark and a loader, and fades out once the app has
 * restored its session (`done`).
 */
export function Splash({
  done,
  onHidden,
  appName,
  tagline,
}: {
  done: boolean;
  onHidden: () => void;
  /** Word after "iTour" (Rep / Driver). */
  appName: string;
  tagline: string;
}) {
  const intro = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const out = useRef(new Animated.Value(1)).current;
  const shown = useRef(Date.now());

  useEffect(() => {
    Animated.timing(intro, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [intro, pulse]);

  useEffect(() => {
    if (!done) return;
    // Keep the brand on screen long enough to register (≥ 1.1 s total).
    const wait = Math.max(0, 1100 - (Date.now() - shown.current));
    const h = setTimeout(() => {
      Animated.timing(out, { toValue: 0, duration: 350, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(() => onHidden());
    }, wait);
    return () => clearTimeout(h);
  }, [done, out, onHidden]);

  const textY = intro.interpolate({ inputRange: [0, 1], outputRange: [16, 0] });
  const halo = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  const haloOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.05] });

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity: out }]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <LinearGradient colors={['#0E1A2B', '#13233A', '#1B2A40']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fill}>
        <View style={styles.center}>
          <View style={styles.logoWrap}>
            <Animated.View style={[styles.halo, { opacity: haloOpacity, transform: [{ scale: halo }] }]} />
            <Image source={require('../../assets/logo-badge.png')} style={styles.logo} />
          </View>
          <Animated.View style={{ opacity: intro, transform: [{ translateY: textY }], alignItems: 'center' }}>
            <Text style={styles.title}>
              iTour <Text style={styles.titleAccent}>{appName}</Text>
            </Text>
            <Text style={styles.tagline}>{tagline}</Text>
          </Animated.View>
        </View>
        <Animated.View style={[styles.footer, { opacity: intro }]}>
          <View style={styles.dots}>
            {[0, 1, 2].map((i) => (
              <Animated.View
                key={i}
                style={[
                  styles.dot,
                  {
                    opacity: pulse.interpolate({
                      inputRange: [0, 0.5, 1],
                      outputRange: i === 1 ? [0.4, 1, 0.4] : i === 0 ? [1, 0.4, 0.4] : [0.4, 0.4, 1],
                    }),
                  },
                ]}
              />
            ))}
          </View>
          <Text style={styles.footerText}>iTour Ground Operations</Text>
        </Animated.View>
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logoWrap: { width: 220, height: 220, alignItems: 'center', justifyContent: 'center' },
  halo: { ...StyleSheet.absoluteFillObject, borderRadius: 110, backgroundColor: '#FF7A1A' },
  logo: { width: 144, height: 144 },
  title: { color: '#fff', fontSize: 34, fontWeight: '800', letterSpacing: -0.5, marginTop: 4 },
  titleAccent: { color: '#FF7A1A' },
  tagline: { color: 'rgba(255,255,255,0.7)', fontSize: 14, marginTop: 6, letterSpacing: 0.3 },
  footer: { alignItems: 'center', paddingBottom: 48 },
  dots: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  footerText: { color: 'rgba(255,255,255,0.5)', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase' },
});
