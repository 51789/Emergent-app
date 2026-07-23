import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth, AuthUser } from '../../src/services/auth';

type EditMode = 'create' | 'edit';

export default function AdminUsersScreen() {
  const { user: currentAdmin, authFetch } = useAuth();
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'admin' | 'user'>('all');

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [mode, setMode] = useState<EditMode>('create');
  const [editing, setEditing] = useState<AuthUser | null>(null);
  const [fEmail, setFEmail] = useState('');
  const [fPassword, setFPassword] = useState('');
  const [fRole, setFRole] = useState<'user' | 'admin'>('user');
  const [fActive, setFActive] = useState(true);
  const [fPlan, setFPlan] = useState<'free' | 'pro' | 'premium'>('free');
  const [fPlanStatus, setFPlanStatus] = useState<'active' | 'inactive' | 'canceled'>('inactive');
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data: AuthUser[] = await authFetch('/admin/users');
      setUsers(data);
    } catch (err: any) {
      Alert.alert('Errore', err?.message || 'Impossibile caricare gli utenti');
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const openCreate = () => {
    setMode('create');
    setEditing(null);
    setFEmail('');
    setFPassword('');
    setFRole('user');
    setFActive(true);
    setFPlan('free');
    setFPlanStatus('inactive');
    setModalError(null);
    setModalOpen(true);
  };

  const openEdit = (u: AuthUser) => {
    setMode('edit');
    setEditing(u);
    setFEmail(u.email);
    setFPassword('');
    setFRole(u.role);
    setFActive(u.is_active);
    setFPlan((u.plan as any) || 'free');
    setFPlanStatus((u.plan_status as any) || 'inactive');
    setModalError(null);
    setModalOpen(true);
  };

  const submit = async () => {
    setModalError(null);
    if (!fEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fEmail.trim())) {
      setModalError('Email non valida');
      return;
    }
    if (mode === 'create' && !fPassword.trim()) {
      setModalError('Password obbligatoria per creazione');
      return;
    }
    setSaving(true);
    try {
      if (mode === 'create') {
        // 1) Create as user
        const created: AuthUser = await authFetch('/admin/users', {
          method: 'POST',
          body: JSON.stringify({ email: fEmail.trim(), password: fPassword }),
        });
        // 2) Patch role / plan if not defaults
        const patch: any = {};
        if (fRole !== 'user') patch.role = fRole;
        if (fPlan !== 'free') patch.plan = fPlan;
        if (fPlanStatus !== 'inactive') patch.plan_status = fPlanStatus;
        if (!fActive) patch.is_active = false;
        if (Object.keys(patch).length > 0) {
          await authFetch(`/admin/users/${created.id}`, {
            method: 'PATCH',
            body: JSON.stringify(patch),
          });
        }
      } else if (editing) {
        const patch: any = {};
        if (fEmail.trim().toLowerCase() !== editing.email.toLowerCase()) patch.email = fEmail.trim();
        if (fPassword) patch.password = fPassword;
        if (fRole !== editing.role) patch.role = fRole;
        if (fActive !== editing.is_active) patch.is_active = fActive;
        if (fPlan !== (editing.plan || 'free')) patch.plan = fPlan;
        if (fPlanStatus !== (editing.plan_status || 'inactive')) patch.plan_status = fPlanStatus;
        if (Object.keys(patch).length === 0) {
          setModalOpen(false);
          setSaving(false);
          return;
        }
        await authFetch(`/admin/users/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify(patch),
        });
      }
      setModalOpen(false);
      await load();
    } catch (err: any) {
      setModalError(err?.message || 'Errore durante il salvataggio');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (u: AuthUser) => {
    if (u.id === currentAdmin?.id) {
      Alert.alert('Non consentito', 'Non puoi eliminare te stesso.');
      return;
    }
    Alert.alert(
      'Elimina utente',
      `Sei sicuro di voler eliminare ${u.email}? L'azione è irreversibile.`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina',
          style: 'destructive',
          onPress: async () => {
            try {
              await authFetch(`/admin/users/${u.id}`, { method: 'DELETE' });
              setUsers((prev) => prev.filter((x) => x.id !== u.id));
            } catch (err: any) {
              Alert.alert('Errore', err?.message || "Impossibile eliminare l'utente");
            }
          },
        },
      ]
    );
  };

  const filtered = users.filter((u) => (filter === 'all' ? true : u.role === filter));

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <MaterialIcons name="arrow-back" size={26} color="#333" />
        </TouchableOpacity>
        <Text style={styles.title}>Utenti</Text>
        <TouchableOpacity onPress={openCreate} style={styles.iconBtn} testID="admin-create-user">
          <MaterialIcons name="person-add-alt" size={24} color="#007AFF" />
        </TouchableOpacity>
      </View>

      {/* Filters */}
      <View style={styles.filters}>
        {(['all', 'admin', 'user'] as const).map((k) => (
          <TouchableOpacity
            key={k}
            style={[styles.filterChip, filter === k && styles.filterChipActive]}
            onPress={() => setFilter(k)}
          >
            <Text style={[styles.filterText, filter === k && styles.filterTextActive]}>
              {k === 'all' ? 'Tutti' : k === 'admin' ? 'Admin' : 'Utenti'}
            </Text>
          </TouchableOpacity>
        ))}
        <View style={{ flex: 1 }} />
        <Text style={styles.counter}>{filtered.length}</Text>
      </View>

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#007AFF" />}
        >
          {filtered.map((u) => (
            <View key={u.id} style={styles.userCard} testID={`user-row-${u.id}`}>
              <View style={styles.userAvatar}>
                <MaterialIcons
                  name={u.role === 'admin' ? 'admin-panel-settings' : 'person'}
                  size={22}
                  color={u.role === 'admin' ? '#B8860B' : '#007AFF'}
                />
              </View>
              <View style={styles.userInfo}>
                <View style={styles.userTopRow}>
                  <Text style={styles.userEmail} numberOfLines={1}>
                    {u.email}
                  </Text>
                  {u.id === currentAdmin?.id && (
                    <View style={styles.youBadge}>
                      <Text style={styles.youBadgeText}>TU</Text>
                    </View>
                  )}
                </View>
                <View style={styles.userMeta}>
                  <View style={[styles.roleTag, u.role === 'admin' && styles.roleTagAdmin]}>
                    <Text style={[styles.roleText, u.role === 'admin' && styles.roleTextAdmin]}>
                      {u.role.toUpperCase()}
                    </Text>
                  </View>
                  <View style={[styles.planTag, planStyle(u.plan)]}>
                    <Text style={styles.planText}>{(u.plan || 'free').toUpperCase()}</Text>
                  </View>
                  {!u.is_active && (
                    <View style={styles.inactiveTag}>
                      <Text style={styles.inactiveText}>DISATTIVO</Text>
                    </View>
                  )}
                </View>
              </View>
              <View style={styles.userActions}>
                <TouchableOpacity onPress={() => openEdit(u)} style={styles.actionBtn} testID={`edit-${u.id}`}>
                  <MaterialIcons name="edit" size={20} color="#007AFF" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => confirmDelete(u)}
                  style={styles.actionBtn}
                  disabled={u.id === currentAdmin?.id}
                  testID={`delete-${u.id}`}
                >
                  <MaterialIcons
                    name="delete-outline"
                    size={20}
                    color={u.id === currentAdmin?.id ? '#DDD' : '#D14343'}
                  />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Modal */}
      <Modal
        visible={modalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setModalOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {mode === 'create' ? 'Nuovo account' : `Modifica ${editing?.email}`}
              </Text>
              <TouchableOpacity onPress={() => setModalOpen(false)}>
                <MaterialIcons name="close" size={22} color="#666" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 16 }}>
              <Label>Email</Label>
              <TextInput
                value={fEmail}
                onChangeText={setFEmail}
                placeholder="email@esempio.com"
                autoCapitalize="none"
                keyboardType="email-address"
                style={styles.modalInput}
                testID="modal-email"
              />

              <Label>{mode === 'create' ? 'Password' : 'Nuova password (opzionale)'}</Label>
              <TextInput
                value={fPassword}
                onChangeText={setFPassword}
                placeholder={mode === 'create' ? 'Almeno 6 caratteri' : 'Lascia vuoto per non cambiare'}
                secureTextEntry
                autoCapitalize="none"
                style={styles.modalInput}
                testID="modal-password"
              />

              <Label>Ruolo</Label>
              <SegmentedControl
                options={[
                  { key: 'user', label: 'User' },
                  { key: 'admin', label: 'Admin' },
                ]}
                value={fRole}
                onChange={(v) => setFRole(v as any)}
              />

              <Label>Piano</Label>
              <SegmentedControl
                options={[
                  { key: 'free', label: 'Free' },
                  { key: 'pro', label: 'Pro' },
                  { key: 'premium', label: 'Premium' },
                ]}
                value={fPlan}
                onChange={(v) => setFPlan(v as any)}
              />

              <Label>Stato piano</Label>
              <SegmentedControl
                options={[
                  { key: 'inactive', label: 'Inattivo' },
                  { key: 'active', label: 'Attivo' },
                  { key: 'canceled', label: 'Cancellato' },
                ]}
                value={fPlanStatus}
                onChange={(v) => setFPlanStatus(v as any)}
              />

              <TouchableOpacity onPress={() => setFActive((v) => !v)} style={styles.toggleRow}>
                <MaterialIcons
                  name={fActive ? 'toggle-on' : 'toggle-off'}
                  size={30}
                  color={fActive ? '#2BB673' : '#BBB'}
                />
                <Text style={styles.toggleLabel}>Account attivo</Text>
              </TouchableOpacity>

              {!!modalError && (
                <View style={styles.errorBox}>
                  <MaterialIcons name="error-outline" size={16} color="#D14343" />
                  <Text style={styles.errorText}>{modalError}</Text>
                </View>
              )}

              <TouchableOpacity
                onPress={submit}
                disabled={saving}
                style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                testID="modal-save"
              >
                {saving ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.saveBtnText}>
                    {mode === 'create' ? 'Crea account' : 'Salva modifiche'}
                  </Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

function SegmentedControl({
  options,
  value,
  onChange,
}: {
  options: { key: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={styles.segment}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <TouchableOpacity
            key={o.key}
            style={[styles.segmentItem, active && styles.segmentItemActive]}
            onPress={() => onChange(o.key)}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function planStyle(plan?: string | null) {
  switch (plan) {
    case 'pro':
      return { backgroundColor: '#EEF6FF' };
    case 'premium':
      return { backgroundColor: '#FFF8E1' };
    default:
      return { backgroundColor: '#F0F0F0' };
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '700', color: '#1A1A1A' },
  filters: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DDD',
    backgroundColor: '#FFF',
  },
  filterChipActive: { backgroundColor: '#007AFF', borderColor: '#007AFF' },
  filterText: { fontSize: 12, fontWeight: '700', color: '#666' },
  filterTextActive: { color: '#FFF' },
  counter: { color: '#999', fontSize: 12, fontWeight: '700' },
  list: { padding: 12, paddingBottom: 40, gap: 8 },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EEE',
    padding: 12,
  },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userInfo: { flex: 1, gap: 6 },
  userTopRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  userEmail: { fontSize: 14, fontWeight: '700', color: '#111', flexShrink: 1 },
  youBadge: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  youBadgeText: { color: '#FFF', fontSize: 9, fontWeight: '800', letterSpacing: 0.6 },
  userMeta: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  roleTag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: '#EEF6FF' },
  roleText: { fontSize: 10, fontWeight: '800', color: '#007AFF', letterSpacing: 0.5 },
  roleTagAdmin: { backgroundColor: '#FFF8E1' },
  roleTextAdmin: { color: '#B8860B' },
  planTag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  planText: { fontSize: 10, fontWeight: '800', color: '#333', letterSpacing: 0.5 },
  inactiveTag: {
    backgroundColor: '#FFF0F0',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  inactiveText: { fontSize: 10, fontWeight: '800', color: '#D14343', letterSpacing: 0.5 },
  userActions: { flexDirection: 'row', gap: 4 },
  actionBtn: { padding: 8 },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#111', flex: 1, marginRight: 8 },
  label: { fontSize: 12, fontWeight: '800', color: '#666', letterSpacing: 0.5, marginTop: 14, marginBottom: 6 },
  modalInput: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111',
    backgroundColor: '#FAFAFA',
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: '#F0F0F0',
    borderRadius: 10,
    padding: 3,
    gap: 3,
  },
  segmentItem: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  segmentItemActive: { backgroundColor: '#FFF' },
  segmentText: { fontSize: 12, fontWeight: '700', color: '#888' },
  segmentTextActive: { color: '#007AFF' },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
  },
  toggleLabel: { fontSize: 14, fontWeight: '600', color: '#333' },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFF0F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 14,
  },
  errorText: { color: '#D14343', fontSize: 13, fontWeight: '600', flex: 1 },
  saveBtn: {
    marginTop: 20,
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnText: { color: '#FFF', fontSize: 15, fontWeight: '800', letterSpacing: 0.5 },
});
