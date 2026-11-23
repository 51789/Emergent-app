import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { flattenPages } from '@/api/cache';
import {
  useAdminUsers,
  useCreateAdminUser,
  useDeleteAdminUser,
  useUpdateAdminUser,
} from '@/api/hooks';
import type { AdminCreateUserBody, AdminUpdateUserBody, User } from '@/api/types';
import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { BrandHeader } from '@/components/BrandHeader';
import { Button } from '@/components/Button';
import { dialog } from '@/components/dialog/dialog';
import { Screen, STACK_EDGES } from '@/components/Screen';
import { EmptyState, ErrorState, ListFooter, LoadingState } from '@/components/StateViews';
import { TextField } from '@/components/TextField';
import { useSession } from '@/features/auth/session';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useErrorMessage } from '@/i18n/useErrorMessage';
import { colors, radius, spacing } from '@/theme';
import { formatDateOnly, localeFor } from '@/utils/date';

import { UserFormModal } from './UserFormModal';

/** Users list with search, plus create / edit / delete through a modal. */
export function AdminUsersScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const errorMessage = useErrorMessage();
  const locale = localeFor(i18n.language as Parameters<typeof localeFor>[0]);
  const currentUserId = useSession((state) => state.user?.id);

  const [search, setSearch] = useState('');
  const query = useDebouncedValue(search.trim());
  const users = useAdminUsers(query);
  const items = flattenPages(users.data);

  const createUser = useCreateAdminUser();
  const updateUser = useUpdateAdminUser();
  const deleteUser = useDeleteAdminUser();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const openModal = (user: User | null) => {
    setEditing(user);
    setServerError(null);
    setModalOpen(true);
  };
  const closeModal = () => setModalOpen(false);

  const handleCreate = async (body: AdminCreateUserBody) => {
    setServerError(null);
    try {
      await createUser.mutateAsync(body);
      closeModal();
    } catch (error) {
      setServerError(errorMessage(error));
    }
  };

  const handleUpdate = async (id: string, body: AdminUpdateUserBody) => {
    setServerError(null);
    try {
      await updateUser.mutateAsync({ id, body });
      closeModal();
    } catch (error) {
      setServerError(errorMessage(error));
    }
  };

  const handleDelete = async (user: User) => {
    const confirmed = await dialog.confirm({
      title: t('admin.users.deleteTitle'),
      message: t('admin.users.deleteMessage', { email: user.email }),
      confirmLabel: t('common.delete'),
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await deleteUser.mutateAsync(user.id);
      closeModal();
    } catch (error) {
      setServerError(errorMessage(error));
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    await users.refetch();
    setRefreshing(false);
  };

  return (
    <Screen edges={STACK_EDGES}>
      <BrandHeader onBack={() => router.back()} />

      <FlatList<User>
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={
          <View style={styles.header}>
            <AppText variant="title">{t('admin.usersLink')}</AppText>
            <TextField
              label={t('admin.users.search')}
              value={search}
              onChangeText={setSearch}
              placeholder={t('admin.users.search')}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            <Button label={t('admin.users.create')} icon="person-add" onPress={() => openModal(null)} testID="user-create" />
          </View>
        }
        ListEmptyComponent={
          users.isPending ? (
            <LoadingState style={styles.empty} />
          ) : users.isError ? (
            <ErrorState message={errorMessage(users.error)} onRetry={() => void users.refetch()} style={styles.empty} />
          ) : (
            <EmptyState icon="person-search" title={t('admin.users.emptyTitle')} style={styles.empty} />
          )
        }
        ListFooterComponent={<ListFooter loading={users.isFetchingNextPage} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
        onEndReached={() => {
          if (users.hasNextPage && !users.isFetchingNextPage) void users.fetchNextPage();
        }}
        onEndReachedThreshold={0.4}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => openModal(item)}
            accessibilityRole="button"
            accessibilityLabel={item.email}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            testID={`user-row-${item.id}`}
          >
            <View style={styles.avatar}>
              <MaterialIcons
                name={item.role === 'admin' ? 'admin-panel-settings' : 'person'}
                size={22}
                color={item.role === 'admin' ? colors.warning : colors.primary}
              />
            </View>
            <View style={styles.info}>
              <AppText variant="bodyStrong" numberOfLines={1}>
                {item.email}
              </AppText>
              <AppText variant="caption" color="textMuted" numberOfLines={1}>
                {[item.name, formatDateOnly(item.created_at.slice(0, 10), locale)].filter(Boolean).join(' · ')}
              </AppText>
            </View>
            <View style={styles.tags}>
              {item.id === currentUserId ? <Badge label={t('admin.users.you')} tone="primary" /> : null}
              {item.role === 'admin' ? <Badge label="ADMIN" tone="warning" /> : null}
              <Badge label={item.plan.toUpperCase()} tone={item.plan === 'free' ? 'neutral' : 'success'} />
            </View>
          </Pressable>
        )}
      />

      {modalOpen ? (
        <UserFormModal
          key={editing?.id ?? 'new'}
          visible
          user={editing}
          saving={createUser.isPending || updateUser.isPending || deleteUser.isPending}
          serverError={serverError}
          isSelf={editing?.id === currentUserId}
          onClose={closeModal}
          onCreate={(body) => void handleCreate(body)}
          onUpdate={(id, body) => void handleUpdate(id, body)}
          onDelete={(user) => void handleDelete(user)}
        />
      ) : null}
    </Screen>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, paddingBottom: spacing.xxxl, flexGrow: 1 },
  header: { gap: spacing.md, paddingBottom: spacing.lg },
  separator: { height: spacing.sm },
  empty: { paddingTop: spacing.xxl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  pressed: { opacity: 0.7 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1 },
  tags: { alignItems: 'flex-end', gap: 4 },
});
