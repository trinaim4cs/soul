import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { StyleSheet, View } from 'react-native';

import { FieldError } from '@/components/field-error';
import { SoulChip } from '@/components/soul-chip';
import { SoulInput } from '@/components/soul-input';
import { SoulText } from '@/components/soul-text';
import {
  ABOUT_MAX,
  GENDERS,
  GENDER_LABEL,
  HOOK_MAX,
  missingFormFields,
  NAME_MAX,
  SHOW_ME_LABEL,
  toggleGender,
  type MissingField,
  type ProfileFormValues,
} from '@/features/profile/model/profile';
import { spacing } from '@/theme';

type Props = {
  values: ProfileFormValues;
  /** A state setter: every change merges into the latest values, so quick taps never overwrite each other. */
  onChange: Dispatch<SetStateAction<ProfileFormValues>>;
  /** Fields the last save attempt found missing. */
  missing: MissingField[];
};

const FIELD_ERROR: Partial<Record<MissingField, string>> = {
  name: 'Add the name you want people to see.',
  gender: 'Choose one.',
  show_me: 'Choose at least one.',
  hook: 'Add a line about you.',
};

/** Name, gender, who to see, hook and About Me: the whole profile, kept simple (spec 15). */
export function ProfileForm({ values, onChange, missing }: Props) {
  const set = (patch: Partial<ProfileFormValues>) => onChange((prev) => ({ ...prev, ...patch }));
  // An error from the last save attempt shows only while that field is still missing, so it
  // clears as soon as the person fixes it.
  const stillMissing = missingFormFields(values);
  const errorFor = (field: MissingField) =>
    missing.includes(field) && stillMissing.includes(field) ? FIELD_ERROR[field] : undefined;

  return (
    <View style={styles.root}>
      <SoulInput
        label="Your first name"
        value={values.name}
        onChangeText={(name) => set({ name })}
        maxLength={NAME_MAX}
        autoCapitalize="words"
        autoComplete="given-name"
        textContentType="givenName"
        error={errorFor('name')}
      />

      <ChoiceGroup label="I am" error={errorFor('gender')}>
        {GENDERS.map((gender) => (
          <SoulChip
            key={gender}
            label={GENDER_LABEL[gender]}
            selected={values.gender === gender}
            onPress={() => set({ gender })}
          />
        ))}
      </ChoiceGroup>

      <ChoiceGroup label="Show me" error={errorFor('show_me')}>
        {GENDERS.map((gender) => (
          <SoulChip
            key={gender}
            kind="checkbox"
            label={SHOW_ME_LABEL[gender]}
            selected={values.showMe.includes(gender)}
            onPress={() =>
              onChange((prev) => ({ ...prev, showMe: toggleGender(prev.showMe, gender) }))
            }
          />
        ))}
      </ChoiceGroup>

      <SoulInput
        label="What makes you interesting?"
        value={values.hook}
        onChangeText={(hook) => set({ hook })}
        maxLength={HOOK_MAX}
        showCount
        error={errorFor('hook')}
      />

      <SoulInput
        label="About me"
        helper="Write anything you want. Optional."
        value={values.about}
        onChangeText={(about) => set({ about })}
        maxLength={ABOUT_MAX}
        showCount
        multiline
      />
    </View>
  );
}

function ChoiceGroup({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.group} role="radiogroup" aria-label={label}>
      <SoulText variant="supporting" tone="secondary">
        {label}
      </SoulText>
      <View style={styles.chips}>{children}</View>
      {error ? <FieldError>{error}</FieldError> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.lg },
  group: { gap: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});
