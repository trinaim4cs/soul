import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { SoulButton } from '@/components/soul-button';
import { SoulScreen } from '@/components/soul-screen';
import { SoulText } from '@/components/soul-text';
import { ErrorState, LoadingState } from '@/components/states';
import { useCurrentUserId } from '@/features/auth/account-status-provider';
import { saveProfileForm, useMyProfile } from '@/features/profile/api/profile';
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

export function EditProfileScreen() {
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
  return <EditForm profile={profile.data} userId={userId} />;
}

function EditForm({ profile, userId }: { profile: MyProfile; userId: string | null }) {
  const [values, setValues] = useState<ProfileFormValues>(() => formValuesFrom(profile));
  const [missing, setMissing] = useState<MissingField[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const photos = usePhotoActions(userId, profile.photos);

  async function save() {
    if (!userId) return;
    const formMissing = missingFormFields(values);
    setMissing(formMissing);
    if (formMissing.length > 0) return;
    setSaving(true);
    setError(null);
    try {
      await saveProfileForm(userId, values);
      // Opened from a link (web) there is no screen to go back to.
      if (router.canGoBack()) router.back();
      else router.replace('/you');
    } catch {
      setError("Couldn't save your changes. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SoulScreen
      keyboard
      edges={{ top: false, bottom: true }}
      footer={<SoulButton label="Save" block loading={saving} onPress={() => void save()} />}>
      <View style={styles.intro}>
        <SoulText variant="title" accessibilityRole="header">
          Edit profile
        </SoulText>
      </View>
      <PhotoGrid
        photos={profile.photos}
        busy={photos.busy}
        onTakePhoto={() => void photos.takePhoto()}
        onPickPhoto={() => void photos.pickPhoto()}
        onMakePrimary={(id) => void photos.makePrimary(id)}
        onRemove={(id) => void photos.remove(id)}
        keepAtLeastOne={profile.complete}
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
});
