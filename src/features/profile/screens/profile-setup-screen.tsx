import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ErrorState, LoadingState } from '@/components/states';
import { SoulButton } from '@/components/soul-button';
import { SoulScreen } from '@/components/soul-screen';
import { SoulText } from '@/components/soul-text';
import { signOut } from '@/features/auth/api/auth';
import { useCurrentUserId } from '@/features/auth/account-status-provider';
import { saveProfileForm, submitProfile, useMyProfile } from '@/features/profile/api/profile';
import { PhotoGrid } from '@/features/profile/components/photo-grid';
import { ProfileForm } from '@/features/profile/components/profile-form';
import { usePhotoActions } from '@/features/profile/hooks/use-photo-actions';
import {
  formValuesFrom,
  missingFormFields,
  type MissingField,
  type MyProfile,
  type ProfileFormValues,
} from '@/features/profile/model/profile';
import { layout, spacing } from '@/theme';

/**
 * Profile setup, the last onboarding step. First the main photo (a fresh one from the camera
 * is preferred, spec 14), then the rest of the profile. The server decides when it is complete.
 */
export function ProfileSetupScreen() {
  const userId = useCurrentUserId();
  const profile = useMyProfile(userId);

  if (profile.isPending) return <LoadingState />;
  if (profile.isError || !profile.data) {
    return (
      <ErrorState
        title="Couldn't load your profile"
        body="Check your connection and try again."
        onRetry={() => void profile.refetch()}
      />
    );
  }
  return profile.data.photos.length === 0 ? (
    <PhotoStep profile={profile.data} userId={userId} />
  ) : (
    <DetailsStep profile={profile.data} userId={userId} />
  );
}

function PhotoStep({ profile, userId }: { profile: MyProfile; userId: string | null }) {
  const photos = usePhotoActions(userId, profile.photos);
  return (
    <SoulScreen
      footer={
        <View style={styles.footer}>
          <SoulButton
            label="Take a photo"
            icon="photo_camera"
            block
            loading={photos.busy}
            onPress={() => void photos.takePhoto()}
          />
          <SoulButton
            label="Choose from gallery"
            variant="secondary"
            block
            disabled={photos.busy}
            onPress={() => void photos.pickPhoto()}
          />
        </View>
      }>
      <View style={styles.intro}>
        <SoulText variant="title" accessibilityRole="header">
          Add your photo
        </SoulText>
        <SoulText tone="secondary">
          Your main photo should clearly show your face: just you, good light, no filters. A fresh
          one from the camera works best.
        </SoulText>
        {photos.busy ? (
          <SoulText variant="supporting" tone="secondary">
            Uploading your photo…
          </SoulText>
        ) : null}
        {photos.error ? (
          <SoulText variant="supporting" role="alert">
            {photos.error}
          </SoulText>
        ) : null}
      </View>
      <SoulButton label="Sign out" variant="ghost" onPress={() => void signOut()} />
    </SoulScreen>
  );
}

function DetailsStep({ profile, userId }: { profile: MyProfile; userId: string | null }) {
  const [values, setValues] = useState<ProfileFormValues>(() => formValuesFrom(profile));
  const [missing, setMissing] = useState<MissingField[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const photos = usePhotoActions(userId, profile.photos);

  async function finish() {
    if (!userId) return;
    const formMissing = missingFormFields(values);
    setMissing(formMissing);
    if (formMissing.length > 0) return;
    setSaving(true);
    setError(null);
    try {
      await saveProfileForm(userId, values);
      const result = await submitProfile(userId);
      if (!result.ok) {
        setMissing(result.reason === 'missing' ? result.missing : []);
        setError(
          result.reason === 'missing'
            ? 'A few things are still missing.'
            : 'Something went wrong. Try again.',
        );
      }
      // On success the server marks the profile complete and the app opens.
    } catch {
      setError("Couldn't save your profile. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SoulScreen
      keyboard
      footer={
        <SoulButton label="Finish profile" block loading={saving} onPress={() => void finish()} />
      }>
      <View style={styles.intro}>
        <SoulText variant="title" accessibilityRole="header">
          Your profile
        </SoulText>
        <SoulText tone="secondary">Keep it simple. You can change all of this later.</SoulText>
      </View>
      <PhotoGrid
        photos={profile.photos}
        busy={photos.busy}
        onTakePhoto={() => void photos.takePhoto()}
        onPickPhoto={() => void photos.pickPhoto()}
        onMakePrimary={(id) => void photos.makePrimary(id)}
        onRemove={(id) => void photos.remove(id)}
        keepAtLeastOne
      />
      {photos.error ? (
        <SoulText variant="supporting" role="alert">
          {photos.error}
        </SoulText>
      ) : null}
      <ProfileForm values={values} onChange={setValues} missing={missing} />
      {error ? (
        <SoulText variant="supporting" role="alert">
          {error}
        </SoulText>
      ) : null}
    </SoulScreen>
  );
}

const styles = StyleSheet.create({
  intro: { gap: spacing.sm, marginBottom: layout.sectionGap / 2 },
  footer: { gap: spacing.sm },
});
