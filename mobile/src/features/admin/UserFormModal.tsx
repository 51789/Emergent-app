import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { AdminCreateUserBody, AdminUpdateUserBody, PlanId, Role, User } from '@/api/types';
import { AppText } from '@/components/AppText';
import { Banner } from '@/components/StateViews';
import { Button } from '@/components/Button';
import { IconButton } from '@/components/IconButton';
import { Segmented } from '@/components/Segmented';
import { TextField } from '@/components/TextField';
import { colors, radius, spacing } from '@/theme';
import { checkPassword, isValidEmail } from '@/utils/validation';

interface UserFormModalProps {
  visible: boolean;
  /** The user being edited, or null to create one. */
  user: User | null;
  saving: boolean;
  /** Server error to show inside the modal (e.g. duplicate email). */
  serverError: string | null;
  isSelf: boolean;
  onClose: () => void;
  onCreate: (body: AdminCreateUserBody) => void;
  onUpdate: (id: string, body: AdminUpdateUserBody) => void;
  onDelete: (user: User) => void;
}

/** Create / edit / delete a user. Mount it with `key={user?.id ?? 'new'}` so the form resets per user. */
export function UserFormModal({
  visible,
  user,
  saving,
  serverError,
  isSelf,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
}: UserFormModalProps) {
  const { t } = useTranslation();
  const editing = user !== null;

  const [email, setEmail] = useState(user?.email ?? '');
  const [password, setPassword] = useState('');
  const [name, setName] = useState(user?.name ?? '');
  const [role, setRole] = useState<Role>(user?.role ?? 'user');
  const [plan, setPlan] = useState<PlanId>(user?.plan ?? 'free');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  const submit = () => {
    const next: typeof errors = {};
    if (!isValidEmail(email)) next.email = t('auth.invalidEmail');
    // On edit the password is optional (empty = unchanged); on create it must be a valid one.
    if (!editing || password) {
      const problem = checkPassword(password, true);
      if (problem === 'required') next.password = t('auth.passwordRequired');
      if (problem === 'tooShort') next.password = t('auth.passwordTooShort');
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    if (editing) {
      onUpdate(user.id, {
        email: email.trim(),
        name: name.trim(),
        role,
        plan,
        ...(password ? { password } : {}),
      });
    } else {
      onCreate({ email: email.trim(), password, name: name.trim() || undefined, role, plan });
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.overlay} onPress={onClose} accessibilityLabel={t('common.close')}>
          <Pressable style={styles.sheet} onPress={() => undefined} accessibilityViewIsModal>
            <View style={styles.header}>
              <AppText variant="heading">{editing ? t('admin.users.edit') : t('admin.users.create')}</AppText>
              <IconButton icon="close" size={22} onPress={onClose} accessibilityLabel={t('common.close')} />
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form}>
              {serverError ? <Banner tone="danger" message={serverError} /> : null}
              <TextField
                label={t('admin.users.email')}
                value={email}
                onChangeText={setEmail}
                error={errors.email}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TextField
                label={t('admin.users.password')}
                value={password}
                onChangeText={setPassword}
                error={errors.password}
                hint={editing ? t('admin.users.passwordEditHint') : t('auth.passwordHint')}
                secureTextEntry
                autoCapitalize="none"
              />
              <TextField
                label={`${t('admin.users.name')} (${t('common.optional')})`}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />
              <View style={styles.group}>
                <AppText variant="captionStrong" color="textMuted">
                  {t('admin.users.role')}
                </AppText>
                <Segmented
                  value={role}
                  onChange={setRole}
                  options={[
                    { value: 'user', label: t('admin.users.roleUser') },
                    { value: 'admin', label: t('admin.users.roleAdmin') },
                  ]}
                />
              </View>
              <View style={styles.group}>
                <AppText variant="captionStrong" color="textMuted">
                  {t('admin.users.plan')}
                </AppText>
                <Segmented
                  value={plan}
                  onChange={setPlan}
                  options={[
                    { value: 'free', label: 'FREE' },
                    { value: 'pro', label: 'PRO' },
                    { value: 'premium', label: 'PREMIUM' },
                  ]}
                />
              </View>

              <Button label={t('common.save')} onPress={submit} loading={saving} testID="user-save" />
              {editing && !isSelf ? (
                <Button
                  label={t('common.delete')}
                  icon="delete-outline"
                  variant="dangerOutline"
                  disabled={saving}
                  onPress={() => onDelete(user)}
                  testID="user-delete"
                />
              ) : null}
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  overlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '92%',
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  form: { gap: spacing.md, paddingBottom: spacing.lg },
  group: { gap: 6 },
});
