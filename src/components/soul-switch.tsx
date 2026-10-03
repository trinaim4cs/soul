import { Platform, Switch, type SwitchProps } from 'react-native';

import { useTheme } from '@/theme';

type Props = Pick<SwitchProps, 'value' | 'disabled' | 'onValueChange' | 'accessibilityLabel'>;

/**
 * SOUL switch: monochrome, an ink track when on. react-native-web paints the "on" thumb teal
 * unless it is given its own active colours, so those are passed on the web.
 */
export function SoulSwitch(props: Props) {
  const { colors } = useTheme();
  const web =
    Platform.OS === 'web'
      ? { activeThumbColor: colors.background, activeTrackColor: colors.inverseSurface }
      : {};
  return (
    <Switch
      {...props}
      trackColor={{ false: colors.border, true: colors.inverseSurface }}
      thumbColor={colors.background}
      {...web}
    />
  );
}
