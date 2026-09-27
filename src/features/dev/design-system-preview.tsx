import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { HotPersonBadge, SoulBadge, VerifiedBadge } from '@/components/badges';
import { EmptyState, LoadingState } from '@/components/states';
import { SoulButton } from '@/components/soul-button';
import { SoulIcon, type IconName } from '@/components/soul-icon';
import { SoulInput } from '@/components/soul-input';
import { SoulLogo } from '@/components/soul-logo';
import { SoulAvatar, SoulPhoto } from '@/components/soul-photo';
import { SoulScreen } from '@/components/soul-screen';
import { SoulText } from '@/components/soul-text';
import {
  createThemedStyles,
  layout,
  radii,
  sizes,
  spacing,
  typeScale,
  useTheme,
  type ColorToken,
  type TypeVariant,
} from '@/theme';

const TYPE_SAMPLES: Record<TypeVariant, string> = {
  display: 'Only for SRM.',
  title: 'Discover',
  section: 'About me',
  subheading: 'What makes you interesting?',
  body: 'Write anything you want. Hobbies, humour, what you are looking for.',
  bodyStrong: 'Verified students only.',
  button: 'Continue with SRMIST email',
  label: 'Continue discovering',
  supporting: 'Your exact location is never shown.',
  caption: '~450 m away · Active today',
  micro: 'HOT PERSON',
};

const SWATCHES: ColorToken[] = [
  'background',
  'surfaceSubtle',
  'textPrimary',
  'textSecondary',
  'textTertiary',
  'border',
  'divider',
  'inverseSurface',
  'accent',
  'moment',
];

const ICONS: IconName[] = [
  'style',
  'near_me',
  'chat_bubble',
  'person',
  'favorite',
  'close',
  'tune',
  'verified',
  'lock',
  'flag',
  'block',
  'photo_camera',
];

/** Internal, development-only design system preview (Phase 2). Not reachable in production. */
export function DesignSystemPreview() {
  const styles = useStyles();
  const { colors, scheme } = useTheme();
  const [hook, setHook] = useState('Late chai, early runs');
  const [about, setAbout] = useState('');

  return (
    <SoulScreen scroll>
      <SoulText variant="caption" tone="tertiary">
        Design system · {scheme} appearance
      </SoulText>

      <Section title="Brand">
        <View style={styles.brandLight}>
          <SoulLogo width={150} on="light-surface" />
        </View>
        <View style={styles.brandDark}>
          <SoulLogo width={150} on="dark-surface" />
          <SoulText variant="subheading" italic style={{ color: colors.onMoment }}>
            Only for SRM.
          </SoulText>
        </View>
      </Section>

      <Section title="Type">
        {(Object.keys(TYPE_SAMPLES) as TypeVariant[]).map((variant) => (
          <View key={variant} style={styles.typeRow}>
            <SoulText variant="micro" tone="tertiary">
              {variant} · {typeScale[variant].fontSize}
            </SoulText>
            <SoulText variant={variant} italic={variant === 'subheading'}>
              {TYPE_SAMPLES[variant]}
            </SoulText>
          </View>
        ))}
        <SoulText numeric variant="bodyStrong">
          12:04 · ₹199 / month · ~1.2 km
        </SoulText>
      </Section>

      <Section title="Colour">
        <View style={styles.swatches}>
          {SWATCHES.map((token) => (
            <View key={token} style={styles.swatch}>
              <View style={[styles.chip, { backgroundColor: colors[token] }]} />
              <SoulText variant="caption" tone="secondary" numberOfLines={1}>
                {token}
              </SoulText>
            </View>
          ))}
        </View>
      </Section>

      <Section title="Buttons">
        <SoulButton label="Continue with SRM email" block onPress={() => {}} />
        <SoulButton label="Continue discovering" variant="secondary" block onPress={() => {}} />
        <View style={styles.row}>
          <SoulButton label="Report" variant="ghost" icon="flag" size="md" onPress={() => {}} />
          <SoulButton label="Saving" size="md" loading />
          <SoulButton label="Disabled" size="md" variant="secondary" disabled />
        </View>
      </Section>

      <Section title="Like and match">
        <View style={styles.row}>
          <View style={styles.passButton}>
            <SoulIcon name="close" size="lg" weight="regular" />
          </View>
          <View style={[styles.likeButton, { backgroundColor: colors.accent }]}>
            <SoulIcon name="favorite" size="lg" color="onAccent" weight="regular" />
          </View>
        </View>
        <View style={styles.matchCard}>
          <SoulText variant="title" align="center" style={{ color: colors.onMoment }}>
            It&apos;s{' '}
            <SoulText variant="title" italic style={{ color: colors.accentOnMoment }}>
              mutual.
            </SoulText>
          </SoulText>
          <SoulText variant="supporting" align="center" style={{ color: colors.onMomentSecondary }}>
            You and Profile 01 liked each other.
          </SoulText>
        </View>
      </Section>

      <Section title="Inputs">
        <SoulInput
          label="What makes you interesting?"
          value={hook}
          onChangeText={setHook}
          maxLength={30}
          showCount
          autoCapitalize="sentences"
        />
        <SoulInput
          label="About me"
          placeholder="Write anything you want"
          value={about}
          onChangeText={setAbout}
          multiline
          helper="Interests, humour, what you are looking for."
        />
        <SoulInput
          label="SRM email"
          value="student@gmail.com"
          error="Use your @srmist.edu.in address."
          keyboardType="email-address"
          autoComplete="email"
          textContentType="emailAddress"
          autoCapitalize="none"
        />
      </Section>

      <Section title="Badges">
        <View style={styles.row}>
          <VerifiedBadge />
          <HotPersonBadge />
          <SoulBadge label="Verified" icon="verified" />
        </View>
      </Section>

      <Section title="Photography">
        <View style={styles.photoWrap}>
          <SoulPhoto accessibilityLabel="Profile photo placeholder" />
          <View style={styles.photoOverlay}>
            <View style={styles.row}>
              <SoulText variant="bodyStrong" tone="onPhoto">
                21
              </SoulText>
              <VerifiedBadge onPhoto />
              <HotPersonBadge onPhoto />
            </View>
            <SoulText variant="subheading" italic tone="onPhoto">
              Late chai, early runs
            </SoulText>
          </View>
        </View>
        <View style={styles.row}>
          <SoulAvatar size="lg" />
          <SoulAvatar size="md" />
          <SoulAvatar size="sm" />
        </View>
      </Section>

      <Section title="Icons">
        <View style={styles.row}>
          {ICONS.map((name) => (
            <SoulIcon key={name} name={name} />
          ))}
        </View>
      </Section>

      <Section title="States">
        <View style={styles.stateBox}>
          <EmptyState
            icon="style"
            title="You're all caught up"
            body="New verified students join every day. Check back soon."
            action={{ label: 'Adjust filters', onPress: () => {} }}
          />
        </View>
        <LoadingState />
      </Section>
    </SoulScreen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.section}>
      <SoulText variant="section">{title}</SoulText>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

const useStyles = createThemedStyles(({ colors }) =>
  StyleSheet.create({
    section: { gap: spacing.md, marginTop: layout.sectionGap },
    sectionBody: { gap: spacing.md },
    brandLight: {
      alignItems: 'center',
      paddingVertical: spacing.xxl,
      borderRadius: radii.lg,
      backgroundColor: colors.paper,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    brandDark: {
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.xxl,
      borderRadius: radii.lg,
      backgroundColor: colors.moment,
    },
    typeRow: { gap: spacing.xxs },
    swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
    swatch: { width: 96, gap: spacing.xxs },
    chip: {
      height: 48,
      borderRadius: radii.sm,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md },
    passButton: {
      width: 64,
      height: 64,
      borderRadius: radii.full,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    likeButton: {
      width: 64,
      height: 64,
      borderRadius: radii.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    matchCard: {
      gap: spacing.xs,
      paddingVertical: spacing.xxl,
      paddingHorizontal: spacing.lg,
      borderRadius: radii.lg,
      backgroundColor: colors.moment,
    },
    photoWrap: { borderRadius: radii.lg, overflow: 'hidden' },
    photoOverlay: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      gap: spacing.xxs,
      padding: spacing.lg,
      backgroundColor: colors.photoScrim,
    },
    stateBox: {
      minHeight: sizes.listRow * 5,
      borderRadius: radii.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
  }),
);
