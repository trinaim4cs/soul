import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { HotPersonBadge, VerifiedBadge } from '@/components/badges';
import { SoulPhoto } from '@/components/soul-photo';
import { SoulText } from '@/components/soul-text';
import { layout, spacing } from '@/theme';

/** Everything the viewer may show. Discovery (Phase 6) builds this from its server projection. */
export type ProfileViewModel = {
  /** Null in anonymous mode: the name is hidden (spec 20). */
  name: string | null;
  age: number | null;
  /** Display label, e.g. "Non-binary". */
  gender: string | null;
  verified: boolean;
  hook: string | null;
  about: string | null;
  /** Already filtered by the owner's zodiac visibility. */
  zodiac: string | null;
  hotPerson: boolean;
  /** Signed URLs in display order. In anonymous mode these are the tiny blurred copies. */
  photos: string[];
  anonymous: boolean;
};

type Props = { profile: ProfileViewModel; actions?: ReactNode };

/**
 * Vertical profile viewer (spec 16): photography leads, and text sits between photos instead
 * of being compressed into one card. Rhythm: photo, identity, hook, About Me, photo, zodiac,
 * remaining photos, badges, actions.
 */
export function ProfileView({ profile, actions }: Props) {
  const [first, second, ...rest] = profile.photos;
  const blur = profile.anonymous ? 12 : undefined;
  const title = profile.anonymous ? 'Anonymous' : (profile.name ?? '');

  return (
    <View style={styles.root}>
      <SoulPhoto
        source={first ? { uri: first } : null}
        blurRadius={blur}
        accessibilityLabel={profile.anonymous ? 'Blurred photo' : 'Profile photo'}
      />

      <View style={styles.identity}>
        {/* Name and age are siblings: a long name truncates, the age always stays visible. */}
        <View
          style={styles.nameRow}
          accessible
          accessibilityRole="header"
          accessibilityLabel={`${title}${profile.age !== null ? `, ${profile.age}` : ''}`}>
          <SoulText variant="section" numberOfLines={1} style={styles.name}>
            {title}
          </SoulText>
          {profile.age !== null ? (
            <SoulText variant="section" tone="secondary" style={styles.age}>
              {`, ${profile.age}`}
            </SoulText>
          ) : null}
          <View style={styles.badges}>
            {profile.verified ? <VerifiedBadge /> : null}
            {profile.hotPerson ? <HotPersonBadge /> : null}
          </View>
        </View>
        {profile.gender ? (
          <SoulText variant="supporting" tone="secondary">
            {profile.gender}
          </SoulText>
        ) : null}
        {profile.hook ? (
          <SoulText variant="subheading" italic>
            {profile.hook}
          </SoulText>
        ) : null}
      </View>

      {profile.about ? (
        <View style={styles.block}>
          <SoulText variant="caption" tone="tertiary">
            About me
          </SoulText>
          <SoulText>{profile.about}</SoulText>
        </View>
      ) : null}

      {second ? (
        <SoulPhoto source={{ uri: second }} blurRadius={blur} accessibilityLabel="Photo" />
      ) : null}

      {profile.zodiac ? (
        <View style={styles.block}>
          <SoulText variant="caption" tone="tertiary">
            Zodiac
          </SoulText>
          <SoulText variant="subheading">{profile.zodiac}</SoulText>
        </View>
      ) : null}

      {rest.map((uri, index) => (
        <SoulPhoto
          key={uri}
          source={{ uri }}
          blurRadius={blur}
          accessibilityLabel={`Photo ${index + 3}`}
        />
      ))}

      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: layout.sectionGap / 2 },
  identity: { gap: spacing.xs },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  badges: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
  age: { flexShrink: 0, marginRight: spacing.xs },
  name: { flexShrink: 1 },
  block: { gap: spacing.xxs, maxWidth: layout.maxTextWidth },
  actions: { gap: spacing.sm, marginTop: spacing.md },
});
