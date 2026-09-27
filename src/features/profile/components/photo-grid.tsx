import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { SoulButton } from '@/components/soul-button';
import { SoulIcon } from '@/components/soul-icon';
import { SoulPhoto } from '@/components/soul-photo';
import { SoulText } from '@/components/soul-text';
import { PHOTO_BUCKET, usePhotoUrls } from '@/features/profile/api/profile';
import { MAX_PHOTOS, type ProfilePhoto } from '@/features/profile/model/profile';
import { borders, createThemedStyles, radii, sizes, spacing } from '@/theme';

type Selection = { kind: 'add' } | { kind: 'photo'; id: string } | null;

type Props = {
  photos: ProfilePhoto[];
  busy: boolean;
  onTakePhoto: () => void;
  onPickPhoto: () => void;
  onMakePrimary: (photoId: string) => void;
  onRemove: (photoId: string) => void;
  /** The last photo of a completed profile cannot be removed (the server refuses it too). */
  keepAtLeastOne: boolean;
};

const STATUS_LABEL: Partial<Record<ProfilePhoto['status'], string>> = {
  pending: 'In review',
  rejected: 'Not approved',
};

/**
 * Up to six photos. Tapping a photo shows its actions below the grid; tapping an empty slot
 * offers the camera or the gallery. The first photo is the main one.
 */
export function PhotoGrid({
  photos,
  busy,
  onTakePhoto,
  onPickPhoto,
  onMakePrimary,
  onRemove,
  keepAtLeastOne,
}: Props) {
  const styles = useStyles();
  const [selection, setSelection] = useState<Selection>(null);
  const urls = usePhotoUrls(
    PHOTO_BUCKET,
    photos.map((photo) => photo.storage_path),
  );
  const selectedPhoto =
    selection?.kind === 'photo' ? photos.find((photo) => photo.id === selection.id) : undefined;
  const slots = Array.from({ length: MAX_PHOTOS }, (_, index) => photos[index] ?? null);
  const firstEmpty = photos.length;

  return (
    <View style={styles.root}>
      <View style={styles.grid}>
        {slots.map((photo, index) =>
          photo ? (
            <PressableScale
              key={photo.id}
              style={[
                styles.slot,
                selection?.kind === 'photo' && selection.id === photo.id && styles.slotSelected,
              ]}
              accessibilityRole="button"
              accessibilityLabel={index === 0 ? 'Main photo' : `Photo ${index + 1}`}
              onPress={() => setSelection({ kind: 'photo', id: photo.id })}>
              <SoulPhoto
                source={
                  urls.data?.[photo.storage_path] ? { uri: urls.data[photo.storage_path] } : null
                }
                rounded={false}
              />
              {index === 0 ? (
                <View style={styles.tag}>
                  <SoulText variant="micro" tone="inverse">
                    MAIN
                  </SoulText>
                </View>
              ) : null}
              {STATUS_LABEL[photo.status] ? (
                <View style={[styles.tag, styles.statusTag]}>
                  <SoulText variant="micro" tone="inverse">
                    {STATUS_LABEL[photo.status]?.toUpperCase()}
                  </SoulText>
                </View>
              ) : null}
            </PressableScale>
          ) : (
            <PressableScale
              key={`empty-${index}`}
              style={[styles.slot, styles.empty]}
              disabled={busy || index !== firstEmpty}
              accessibilityRole="button"
              accessibilityLabel="Add a photo"
              onPress={() => setSelection({ kind: 'add' })}>
              {index === firstEmpty ? (
                <SoulIcon name="add" size="lg" color="textSecondary" />
              ) : null}
            </PressableScale>
          ),
        )}
      </View>

      {selection?.kind === 'add' ? (
        <View style={styles.actions}>
          <SoulButton
            label="Take a photo"
            icon="photo_camera"
            size="md"
            loading={busy}
            onPress={() => {
              setSelection(null);
              onTakePhoto();
            }}
          />
          <SoulButton
            label="Choose from gallery"
            icon="photo_library"
            variant="secondary"
            size="md"
            disabled={busy}
            onPress={() => {
              setSelection(null);
              onPickPhoto();
            }}
          />
        </View>
      ) : null}

      {selectedPhoto ? (
        <View style={styles.actions}>
          {selectedPhoto.position !== 0 ? (
            <SoulButton
              label="Make main photo"
              size="md"
              disabled={busy}
              onPress={() => {
                setSelection(null);
                onMakePrimary(selectedPhoto.id);
              }}
            />
          ) : null}
          <SoulButton
            label="Remove"
            variant="secondary"
            size="md"
            disabled={busy || (keepAtLeastOne && photos.length <= 1)}
            onPress={() => {
              setSelection(null);
              onRemove(selectedPhoto.id);
            }}
          />
          <SoulButton label="Cancel" variant="ghost" size="md" onPress={() => setSelection(null)} />
        </View>
      ) : null}

      {busy ? (
        <SoulText variant="supporting" tone="secondary">
          Uploading your photo…
        </SoulText>
      ) : null}
    </View>
  );
}

const useStyles = createThemedStyles(({ colors }) =>
  StyleSheet.create({
    root: { gap: spacing.md },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
    slot: {
      width: '31.8%',
      aspectRatio: sizes.photoAspect,
      borderRadius: radii.md,
      overflow: 'hidden',
      backgroundColor: colors.surfaceSubtle,
    },
    slotSelected: { borderWidth: borders.strong, borderColor: colors.borderStrong },
    empty: {
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: borders.hairline,
      borderColor: colors.border,
      borderStyle: 'dashed',
    },
    tag: {
      position: 'absolute',
      left: spacing.xs,
      top: spacing.xs,
      paddingHorizontal: spacing.xs,
      paddingVertical: spacing.xxs / 2,
      borderRadius: radii.full,
      backgroundColor: colors.scrim,
    },
    statusTag: { top: undefined, bottom: spacing.xs },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  }),
);
