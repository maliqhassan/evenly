import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';

import { Button, Field, GoogleLogo, InfoNote, Screen, Text } from '@/components';
import { AvatarPicker } from '@/features/profile/AvatarPicker';
import { chooseImage } from '@/lib/media';
import { profileSchema, type ProfileForm } from '@/schemas';
import { useOnboardingDraft } from '@/stores/drafts';
import { useSession } from '@/stores/session';
import { colors, spacing } from '@/theme';

/** 04 — Complete profile (first sign-in only). Saved together with 06. */
export default function CompleteProfile() {
  const profile = useSession((s) => s.me!.profile);
  const draft = useOnboardingDraft();

  const { control, handleSubmit, formState } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: { fullName: draft.fullName || profile.fullName, phone: draft.phone },
    mode: 'onChange',
  });

  useEffect(() => {
    if (!draft.avatarUri && profile.avatarUrl) draft.set({ avatarUri: profile.avatarUrl });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickPhoto = async () => {
    const file = await chooseImage('Profile photo', true);
    if (file) draft.set({ avatarUri: file.uri, avatarMime: file.mimeType });
  };

  const onContinue = handleSubmit((v) => {
    draft.set({ fullName: v.fullName.trim(), phone: v.phone?.trim() ?? '' });
    router.push('/preferences');
  });

  return (
    <Screen
      padding={spacing.screenAuth}
      gap={22}
      footer={<Button label="Continue" onPress={onContinue} disabled={!formState.isValid} />}
    >
      <View style={{ gap: 6 }}>
        <Text variant="h1" accessibilityRole="header">
          You’re in
        </Text>
        <Text variant="bodyLg" color={colors.textMuted}>
          Confirm how friends will see you.
        </Text>
      </View>

      {profile.email ? (
        <View style={styles.emailChip} accessibilityLabel={`Signed in with Google as ${profile.email}`}>
          <GoogleLogo size={14} />
          <Text variant="secondary">{profile.email}</Text>
        </View>
      ) : null}

      <View style={styles.photoRow}>
        <AvatarPicker uri={draft.avatarUri} id={profile.id} name={profile.fullName} onPress={pickPhoto} />
        <View style={{ gap: 2 }}>
          <Text variant="bodyLgStrong">Profile photo</Text>
          <Text variant="secondary" color={colors.textMuted}>
            {draft.avatarUri && draft.avatarUri === profile.avatarUrl
              ? 'Imported from Google'
              : draft.avatarUri
                ? 'Looking good'
                : 'Add a photo'}
          </Text>
        </View>
      </View>

      <Controller
        control={control}
        name="fullName"
        render={({ field, fieldState }) => (
          <Field
            label="Display name"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
            returnKeyType="next"
            error={fieldState.error?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="phone"
        render={({ field, fieldState }) => (
          <Field
            label="Phone (optional)"
            placeholder="Helps friends find you"
            value={field.value ?? ''}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            error={fieldState.error?.message}
          />
        )}
      />

      <InfoNote>
        Friends can always add you with your invite link — your email is only shown to people in your groups.
      </InfoNote>
    </Screen>
  );
}

const styles = StyleSheet.create({
  emailChip: {
    alignSelf: 'flex-start',
    height: 36,
    paddingLeft: 10,
    paddingRight: 14,
    borderRadius: 18,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
});
