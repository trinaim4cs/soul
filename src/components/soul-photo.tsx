import { Image, type ImageSource } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { createThemedStyles, durations, radii, sizes } from '@/theme';

type Props = {
  source?: ImageSource | null;
  /** Blurhash from the server for an instant, private-safe placeholder. */
  blurhash?: string;
  /** Width / height. Profile photography defaults to 4:5 portrait; `null` fills the parent. */
  aspectRatio?: number | null;
  rounded?: boolean;
  /** Stable key inside recycled list cells. */
  recyclingKey?: string;
  /** Anonymous mode: the source is already a tiny (24 px) derivative; this softens it further. */
  blurRadius?: number;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/** Photo surface: cached, placeholder-first, cropped to fill, rounded by the shape lock. */
export function SoulPhoto({
  source,
  blurhash,
  aspectRatio = sizes.photoAspect,
  rounded = true,
  recyclingKey,
  blurRadius,
  accessibilityLabel,
  style,
}: Props) {
  const styles = useStyles();
  return (
    <View
      style={[
        styles.frame,
        aspectRatio !== null && { aspectRatio },
        rounded && styles.rounded,
        style,
      ]}>
      {source ? (
        <Image
          source={source}
          placeholder={blurhash ? { blurhash } : undefined}
          contentFit="cover"
          transition={durations.small}
          recyclingKey={recyclingKey}
          blurRadius={blurRadius}
          style={StyleSheet.absoluteFill}
          accessibilityLabel={accessibilityLabel}
          accessible={Boolean(accessibilityLabel)}
        />
      ) : null}
    </View>
  );
}

type AvatarProps = Omit<Props, 'aspectRatio' | 'rounded' | 'style'> & {
  size?: keyof typeof sizes.avatar;
};

export function SoulAvatar({ size = 'md', ...rest }: AvatarProps) {
  const px = sizes.avatar[size];
  return (
    <SoulPhoto
      {...rest}
      aspectRatio={1}
      rounded={false}
      style={{ width: px, borderRadius: radii.full }}
    />
  );
}

const useStyles = createThemedStyles(({ colors }) =>
  StyleSheet.create({
    frame: { width: '100%', overflow: 'hidden', backgroundColor: colors.skeleton },
    rounded: { borderRadius: radii.lg },
  }),
);
