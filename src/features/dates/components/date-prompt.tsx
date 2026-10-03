import { router } from 'expo-router';
import { StyleSheet } from 'react-native';

import { SoulIcon, type IconName } from '@/components/soul-icon';
import { SoulText } from '@/components/soul-text';
import { PressableScale } from '@/components/pressable-scale';
import { useDateState } from '@/features/dates/api/dates';
import { createThemedStyles, layout, sizes, spacing } from '@/theme';

type Props = {
  otherId: string;
  name: string;
  /** Both people have written in the chat: only then is "Did you meet?" worth asking. */
  talked: boolean;
};

/**
 * A quiet row under a chat header (spec 35: "a lightweight Did you meet? flow"). It looks the
 * same whatever the other person answered, so it never gives their answer away.
 */
export function DatePrompt({ otherId, name, talked }: Props) {
  const styles = useStyles();
  const state = useDateState(otherId);
  const data = state.data;
  if (!data) return null;

  let icon: IconName;
  let text: string;
  if (data.state === 'waiting') {
    icon = 'hourglass_empty';
    text = `Waiting for ${name} to confirm your date`;
  } else if (data.state === 'confirmed') {
    icon = 'check';
    text = 'You both said you met';
  } else {
    if (!talked) return null;
    icon = 'chat_bubble';
    text = `Did you meet ${name}?`;
  }

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={text}
      onPress={() => router.push({ pathname: '/date/[id]', params: { id: otherId } })}
      style={styles.row}>
      <SoulIcon name={icon} size="sm" color="textSecondary" weight="regular" />
      <SoulText variant="supporting" tone="secondary" numberOfLines={1} style={styles.text}>
        {text}
      </SoulText>
      <SoulIcon name="chevron_right" size="sm" color="textTertiary" />
    </PressableScale>
  );
}

const useStyles = createThemedStyles(({ colors }) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      minHeight: sizes.touchTarget,
      paddingHorizontal: layout.screenGutter,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.divider,
    },
    text: { flex: 1 },
  }),
);
