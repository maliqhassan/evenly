import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button, Icon, LinearFill, Pressable, Screen, StripeFill, Text, Wordmark } from '@/components';
import { colors, radii, shadows, spacing } from '@/theme';

/** 02 — Welcome */
export default function Welcome() {
  return (
    <View style={{ flex: 1 }}>
      <LinearFill colors={colors.welcomeGradient} offsets={[0, 0.4, 0.62, 0.8]} />
      <Screen
        bg="transparent"
        padding={spacing.screen}
        gap={0}
        footer={
          <View style={styles.footer}>
            <Button label="Get Started" onPress={() => router.push('/sign-in')} />
            <Pressable
              onPress={() => router.push('/sign-in')}
              accessibilityRole="link"
              scaleOnPress={false}
              hitSlop={10}
            >
              <Text variant="body" color={colors.textMuted}>
                Already use Evenly? <Text variant="bodyStrong">Sign in</Text>
              </Text>
            </Pressable>
          </View>
        }
      >
        <View style={{ paddingTop: 12 }}>
          <Wordmark />
        </View>

        <View style={styles.hero} accessibilityRole="image" accessibilityLabel="Friends sharing a moment">
          <StripeFill a={colors.photoStripe[0]} b={colors.photoStripe[1]} />
          <View style={[styles.chip, shadows.float]}>
            <View style={styles.chipIcon}>
              <Icon name="check" size={20} color={colors.positive} />
            </View>
            <View style={{ gap: 2 }}>
              <Text variant="bodyLgStrong" color={colors.positive} style={{ fontSize: 19 }} tabular>
                $42.50
              </Text>
              <Text variant="caption" color={colors.textSubtle}>
                Successfully settled
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.copy}>
          <Text variant="headline" align="center" accessibilityRole="header">
            Settle with
          </Text>
          <Text variant="headlineItalic" align="center">
            Confidence
          </Text>
          <Text variant="body" color={colors.textMuted} align="center" style={{ marginTop: 14, lineHeight: 21 }}>
            Split bills, track who owes what, and settle up without the awkward conversations.
          </Text>
        </View>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { marginTop: 30, height: 306, borderRadius: radii.photo, overflow: 'hidden' },
  chip: {
    position: 'absolute',
    left: 18,
    right: 70,
    bottom: 22,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 18,
    backgroundColor: colors.frosted,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  chipIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.positiveSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { marginTop: 34, paddingHorizontal: 12 },
  footer: { gap: 14, alignItems: 'center' },
});
