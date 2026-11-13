import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';

import { api, errorMessage } from '@/api';
import { Button, Field, Header, Screen, Text, toast } from '@/components';
import { AvatarPicker } from '@/features/profile/AvatarPicker';
import { t } from '@/i18n';
import { chooseImage } from '@/lib/media';
import { useUpdateProfile } from '@/queries';
import { profileSchema, type ProfileForm } from '@/schemas';
import { useSession } from '@/stores/session';
import { colors } from '@/theme';

/** Personal info: name, phone, photo. Email comes from Google and can't be edited here. */
export default function PersonalInfo() {
  const p = useSession((s) => s.me!.profile);
  const update = useUpdateProfile();
  const [avatar, setAvatar] = useState<{ uri: string; mimeType: string } | null>(null);
  const { control, handleSubmit, formState } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: { fullName: p.fullName, phone: p.phone ?? '' },
    mode: 'onChange',
  });

  const save = handleSubmit(async (v) => {
    try {
      const avatarUrl = avatar ? await api.uploadAvatar(avatar) : undefined;
      await update.mutateAsync({ fullName: v.fullName, phone: v.phone ?? null, ...(avatarUrl ? { avatarUrl } : {}) });
      toast.success(t('Profile updated'));
      router.back();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  });

  return (
    <Screen
      gap={20}
      footer={
        <Button
          label={t('Save')}
          onPress={save}
          loading={update.isPending}
          disabled={!formState.isValid || (!formState.isDirty && !avatar)}
        />
      }
    >
      <Header title={t('Personal info')} />
      <View style={{ alignItems: 'center' }}>
        <AvatarPicker
          uri={avatar?.uri ?? p.avatarUrl}
          id={p.id}
          name={p.fullName}
          onPress={async () => {
            const f = await chooseImage('Profile photo', true);
            if (f) setAvatar({ uri: f.uri, mimeType: f.mimeType });
          }}
        />
      </View>
      <Controller
        control={control}
        name="fullName"
        render={({ field, fieldState }) => (
          <Field
            label={t('Display name')}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            autoCapitalize="words"
            error={fieldState.error?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="phone"
        render={({ field, fieldState }) => (
          <Field
            label={t('Phone (optional)')}
            placeholder={t('Helps friends find you')}
            value={field.value ?? ''}
            onChangeText={field.onChange}
            keyboardType="phone-pad"
            error={fieldState.error?.message}
          />
        )}
      />
      <View style={{ gap: 6 }}>
        <Text variant="secondary" color={colors.textMuted}>
          {t('Email')}
        </Text>
        <Text variant="bodyLg">{p.email ?? '—'}</Text>
        <Text variant="caption" color={colors.textFaint}>
          {t('From your Google account. Only people in your groups can see it.')}
        </Text>
      </View>
    </Screen>
  );
}
