import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet,
  ActivityIndicator, Alert, Modal, Platform, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  productsApi, usersApi, notificationsApi, customerLinkApi,
} from '../api/services';
import { useAuthStore } from '../store/authStore';
import { useWsEvents } from '../hooks/useWsEvents';
import { useNotificationStore } from '../store/notificationStore';
import {
  Product, User, STATUS_LABELS, STATUS_ORDER, STATUS_COLORS, ProductStatus,
} from '../types';
import { formatDateTime } from '../utils/helpers';
import { PORTAL_BASE_URL } from '../utils/config';
import Avatar from '../components/Avatar';
import StatusChip from '../components/StatusChip';
import TimelineFeed from '../components/timeline/TimelineFeed';
import { RootStackParamList } from '../navigation';
import { useThemeStore } from '../store/themeStore';
import { darkColors, lightColors, ThemeColors } from '../theme';
import { Feather } from '@expo/vector-icons';

type RouteT = RouteProp<RootStackParamList, 'ProductDetail'>;
type TabId = 'details' | 'timeline';

function resolveInitialTab(raw?: string): TabId {
  if (raw === 'details') return 'details';
  // All other values (comments, attachments, customer-files, customer-messages, timeline) → timeline
  return 'timeline';
}

// ─── Status picker modal ──────────────────────────────────────────────────────

function StatusPickerModal({
  current, visible, onSelect, onClose,
}: { current: ProductStatus; visible: boolean; onSelect: (s: ProductStatus) => void; onClose: () => void }) {
  const isDark = useThemeStore((s) => s.isDark);
  const c = isDark ? darkColors : lightColors;
  const styles = useMemo(() => makeModalStyles(c), [c]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Change Status</Text>
          {STATUS_ORDER.map((s) => {
            const colors = STATUS_COLORS[s];
            const active = s === current;
            return (
              <TouchableOpacity
                key={s}
                style={[styles.option, active && { backgroundColor: colors.bg }]}
                onPress={() => { onSelect(s); onClose(); }}
              >
                <View style={[styles.dot, { backgroundColor: colors.dot }]} />
                <Text style={[styles.optionText, { color: active ? colors.text : '#CBD5E1' }]}>
                  {STATUS_LABELS[s]}
                </Text>
                {active && <Text style={[styles.check, { color: colors.text }]}>✓</Text>}
              </TouchableOpacity>
            );
          })}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

function makeModalStyles(c: ThemeColors) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: c.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 4 },
    title: { fontSize: 15, fontWeight: '700', color: c.textSec, marginBottom: 10, textAlign: 'center' },
    option: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 12 },
    dot: { width: 10, height: 10, borderRadius: 99 },
    optionText: { fontSize: 15, fontWeight: '600', flex: 1 },
    check: { fontSize: 16, fontWeight: '700' },
  });
}

// ─── Customer Link Section ────────────────────────────────────────────────────

function CustomerLinkSection({ productId }: { productId: number }) {
  const isDark = useThemeStore((s) => s.isDark);
  const c = isDark ? darkColors : lightColors;
  const { canCreateProduct } = useAuthStore();
  const [link, setLink] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [copied, setCopied] = useState(false);

  const portalBase = PORTAL_BASE_URL;

  const load = async () => {
    try {
      const res = await customerLinkApi.get(productId);
      setLink(res.data?.link ?? null);
    } catch { setLink(null); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [productId]);

  if (!canCreateProduct()) return null;

  const isExpired = link ? new Date(link.expires_at).getTime() < Date.now() : false;
  const portalUrl = link ? `${portalBase}/portal/${link.token}` : '';

  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await customerLinkApi.create(productId);
      setLink(res.data?.link ?? null);
    } catch { Alert.alert('Error', 'Failed to create customer link'); }
    setCreating(false);
  };

  const handleRevoke = async () => {
    if (!link || revoking) return;
    setRevoking(true);
    try {
      await customerLinkApi.deactivate(productId, link.id);
      setLink(null);
    } catch { Alert.alert('Error', 'Failed to revoke link'); }
    setRevoking(false);
  };

  const handleCopy = async () => {
    if (Platform.OS === 'web') {
      (navigator as any).clipboard?.writeText(portalUrl);
    } else {
      try {
        const Clipboard = await import('expo-clipboard');
        await Clipboard.setStringAsync(portalUrl);
      } catch {
        Linking.openURL(portalUrl);
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <View style={clsStyles(c).linkSection}>
      <View style={clsStyles(c).linkHeader}>
        <Feather name="link-2" size={14} color={c.textMuted} />
        <Text style={clsStyles(c).linkLabel}>CUSTOMER PORTAL LINK</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={c.brand} size="small" style={{ marginVertical: 8 }} />
      ) : link ? (
        <View style={{ gap: 8 }}>
          {isExpired && (
            <View style={clsStyles(c).expiredBanner}>
              <Text style={clsStyles(c).expiredText}>Link Expired — generate a new one</Text>
            </View>
          )}
          <View style={[clsStyles(c).urlRow, isExpired && { opacity: 0.5 }]}>
            <Text style={[clsStyles(c).urlText, isExpired && { textDecorationLine: 'line-through' }]} numberOfLines={1}>
              {portalUrl}
            </Text>
            <TouchableOpacity onPress={handleCopy} disabled={isExpired} style={clsStyles(c).copyBtn}>
              <Feather name={copied ? 'check' : 'copy'} size={14} color={copied ? '#34D399' : c.brandLight} />
              <Text style={[clsStyles(c).copyText, copied && { color: '#34D399' }]}>
                {copied ? 'Copied!' : 'Copy'}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={clsStyles(c).expiryText}>
              {isExpired ? 'Expired' : 'Expires'} {new Date(link.expires_at).toLocaleDateString()}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {isExpired && (
                <TouchableOpacity onPress={handleCreate} disabled={creating}>
                  <Text style={clsStyles(c).generateText}>{creating ? 'Generating…' : 'New Link'}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={handleRevoke} disabled={revoking}>
                <Text style={clsStyles(c).revokeText}>{revoking ? 'Removing…' : isExpired ? 'Remove' : 'Revoke'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          style={[clsStyles(c).generateBtn, creating && { opacity: 0.6 }]}
          onPress={handleCreate}
          disabled={creating}
        >
          {creating
            ? <ActivityIndicator color={c.brandLight} size="small" />
            : <>
                <Feather name="link" size={14} color={c.brandLight} />
                <Text style={clsStyles(c).generateBtnText}>Generate Customer Link</Text>
              </>
          }
        </TouchableOpacity>
      )}
    </View>
  );
}

function clsStyles(c: ThemeColors) {
  return StyleSheet.create({
    linkSection: { borderTopWidth: 1, borderTopColor: c.surface2, paddingTop: 16, gap: 8 },
    linkHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    linkLabel: { fontSize: 10, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
    expiredBanner: { backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)', borderRadius: 8, padding: 8 },
    expiredText: { fontSize: 12, color: '#FCA5A5' },
    urlRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
    urlText: { flex: 1, fontSize: 12, color: c.textSec, fontFamily: 'monospace' },
    copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 },
    copyText: { fontSize: 12, color: c.brandLight, fontWeight: '600' },
    expiryText: { fontSize: 11, color: c.textMuted },
    generateText: { fontSize: 12, color: c.brandLight, fontWeight: '600' },
    revokeText: { fontSize: 12, color: '#EF4444', fontWeight: '600' },
    generateBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      backgroundColor: 'rgba(99,102,241,0.1)', borderWidth: 1, borderColor: c.brand,
      borderRadius: 10, paddingVertical: 11,
    },
    generateBtnText: { color: c.brandLight, fontSize: 14, fontWeight: '600' },
  });
}

// ─── Details tab ──────────────────────────────────────────────────────────────

function DetailsTab({
  product, users, canEdit, onProductUpdated, productId,
}: { product: Product; users: User[]; canEdit: boolean; onProductUpdated: (p: Product) => void; productId: number }) {
  const isDark = useThemeStore((s) => s.isDark);
  const c = isDark ? darkColors : lightColors;
  const styles = useMemo(() => makeDetailsStyles(c), [c]);

  const [editing, setEditing] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [form, setForm] = useState({
    product_id: product.product_id,
    customer_name: product.customer_name,
    customer_phone: product.customer_phone || '',
    description: product.description || '',
    delivery_at: product.delivery_at ? product.delivery_at.slice(0, 16) : '',
    assignee_ids: product.assignees?.map((a) => a.id) ?? [],
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await productsApi.update(product.id, {
        product_id: form.product_id,
        customer_name: form.customer_name,
        customer_phone: form.customer_phone,
        description: form.description,
        delivery_at: form.delivery_at ? new Date(form.delivery_at).toISOString() : null,
        assignee_ids: form.assignee_ids,
      });
      onProductUpdated(res.data);
      setEditing(false);
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error || 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const toggleAssignee = (id: number) => {
    setForm((f) => ({
      ...f,
      assignee_ids: f.assignee_ids.includes(id)
        ? f.assignee_ids.filter((x) => x !== id)
        : [...f.assignee_ids, id],
    }));
  };

  if (editing) {
    return (
      <ScrollView style={styles.scroll} contentContainerStyle={{ gap: 16, paddingBottom: 40 }}>
        <Text style={styles.sectionTitle}>Edit Product</Text>

        {[
          { label: 'Product ID *', key: 'product_id', placeholder: 'e.g. PRD-001' },
          { label: 'Customer Name *', key: 'customer_name', placeholder: 'Customer name' },
          { label: 'Customer Phone', key: 'customer_phone', placeholder: '+1 234 567 8900' },
        ].map(({ label, key, placeholder }) => (
          <View key={key}>
            <Text style={styles.label}>{label}</Text>
            <TextInput
              style={styles.input}
              value={(form as any)[key]}
              onChangeText={(v) => setForm((f) => ({ ...f, [key]: v }))}
              placeholder={placeholder}
              placeholderTextColor={c.textMuted}
            />
          </View>
        ))}

        <View>
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
            value={form.description}
            onChangeText={(v) => setForm((f) => ({ ...f, description: v }))}
            placeholder="Description..."
            placeholderTextColor={c.textMuted}
            multiline
          />
        </View>

        <View>
          <Text style={styles.label}>Delivery Date & Time</Text>
          <TouchableOpacity
            style={[styles.input, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
            onPress={() => setShowDatePicker(true)}
          >
            <Text style={{ color: form.delivery_at ? c.text : c.textMuted, fontSize: 14 }}>
              {form.delivery_at
                ? new Date(form.delivery_at).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                : 'No delivery date'}
            </Text>
            <Feather name="calendar" size={16} color={c.textMuted} />
          </TouchableOpacity>
          {form.delivery_at ? (
            <TouchableOpacity onPress={() => setForm((f) => ({ ...f, delivery_at: '' }))} style={{ marginTop: 4 }}>
              <Text style={{ fontSize: 12, color: c.textMuted }}>Clear date</Text>
            </TouchableOpacity>
          ) : null}
          {showDatePicker && (
            <DateTimePicker
              value={form.delivery_at ? new Date(form.delivery_at) : new Date()}
              mode="date"
              display="default"
              onChange={(_, date) => {
                setShowDatePicker(false);
                if (date) {
                  const base = form.delivery_at ? new Date(form.delivery_at) : new Date();
                  date.setHours(base.getHours(), base.getMinutes());
                  setForm((f) => ({ ...f, delivery_at: date.toISOString().slice(0, 16) }));
                  setShowTimePicker(true);
                }
              }}
            />
          )}
          {showTimePicker && (
            <DateTimePicker
              value={form.delivery_at ? new Date(form.delivery_at) : new Date()}
              mode="time"
              display="default"
              onChange={(_, date) => {
                setShowTimePicker(false);
                if (date) {
                  setForm((f) => ({ ...f, delivery_at: date.toISOString().slice(0, 16) }));
                }
              }}
            />
          )}
        </View>

        <View>
          <Text style={styles.label}>Assign To</Text>
          <View style={styles.chipWrap}>
            {users.map((u) => {
              const sel = form.assignee_ids.includes(u.id);
              return (
                <TouchableOpacity
                  key={u.id}
                  style={[styles.assigneeChip, sel && styles.assigneeChipSel]}
                  onPress={() => toggleAssignee(u.id)}
                >
                  <Text style={[styles.assigneeChipText, sel && styles.assigneeChipTextSel]}>{u.name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.editActions}>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditing(false)} disabled={saving}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveText}>Save Changes</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={{ gap: 16, paddingBottom: 40 }}>
      {canEdit && (
        <TouchableOpacity style={styles.editBtn} onPress={() => setEditing(true)}>
          <Text style={styles.editBtnText}>✏ Edit</Text>
        </TouchableOpacity>
      )}

      {[
        { label: 'Product ID', value: product.product_id },
        { label: 'Customer', value: product.customer_name },
        { label: 'Phone', value: product.customer_phone || '—' },
        { label: 'Description', value: product.description || '—' },
        { label: 'Delivery', value: product.delivery_at ? formatDateTime(product.delivery_at) : '—' },
        { label: 'Created', value: formatDateTime(product.created_at) },
        { label: 'Created By', value: product.creator?.name || '—' },
      ].map(({ label, value }) => (
        <View key={label} style={styles.row}>
          <Text style={styles.rowLabel}>{label}</Text>
          <Text style={styles.rowValue}>{value}</Text>
        </View>
      ))}

      <View style={styles.row}>
        <Text style={styles.rowLabel}>Assignees</Text>
        <View style={{ flex: 1, gap: 6 }}>
          {product.assignees && product.assignees.length > 0
            ? product.assignees.map((a) => (
                <View key={a.id} style={styles.assigneeRow}>
                  <Avatar name={a.name} avatarUrl={a.avatar_url} size={24} />
                  <Text style={styles.rowValue}>{a.name}</Text>
                </View>
              ))
            : <Text style={styles.rowValue}>—</Text>
          }
        </View>
      </View>

      <CustomerLinkSection productId={productId} />
    </ScrollView>
  );
}

function makeDetailsStyles(c: ThemeColors) {
  return StyleSheet.create({
    scroll: { flex: 1, padding: 16 },
    sectionTitle: { fontSize: 16, fontWeight: '700', color: c.text, marginBottom: 4 },
    label: { fontSize: 12, fontWeight: '600', color: c.textMuted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
    input: {
      backgroundColor: c.surface, borderRadius: 10, borderWidth: 1,
      borderColor: c.border2, color: c.text, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14,
    },
    row: { flexDirection: 'row', gap: 12 },
    rowLabel: { fontSize: 13, color: c.textMuted, width: 90 },
    rowValue: { fontSize: 13, color: c.text, flex: 1, flexWrap: 'wrap' },
    assigneeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    editBtn: {
      alignSelf: 'flex-end', paddingHorizontal: 16, paddingVertical: 7,
      borderRadius: 10, borderWidth: 1, borderColor: c.border2,
    },
    editBtnText: { color: c.textSec, fontSize: 13, fontWeight: '600' },
    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    assigneeChip: {
      paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99,
      borderWidth: 1, borderColor: c.border2, backgroundColor: c.surface,
    },
    assigneeChipSel: { borderColor: c.brand, backgroundColor: 'rgba(99,102,241,0.15)' },
    assigneeChipText: { fontSize: 13, color: c.textSec },
    assigneeChipTextSel: { color: '#A5B4FC', fontWeight: '600' },
    editActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
    cancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: c.border2, alignItems: 'center' },
    cancelText: { color: c.textSec, fontSize: 14, fontWeight: '600' },
    saveBtn: { flex: 2, paddingVertical: 13, borderRadius: 12, backgroundColor: c.brand, alignItems: 'center' },
    saveText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  });
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ProductDetailScreen() {
  const route      = useRoute<RouteT>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { productId, initialTab } = route.params;

  const isDark = useThemeStore((s) => s.isDark);
  const c = isDark ? darkColors : lightColors;
  const styles = useMemo(() => makeScreenStyles(c), [c]);

  const { user, canChangeStatus, canCreateProduct, canDeleteProduct, canComment } = useAuthStore();

  const [product, setProduct]     = useState<Product | null>(null);
  const [loading, setLoading]     = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>(resolveInitialTab(initialTab as string));
  const [showStatus, setShowStatus] = useState(false);
  const [users, setUsers]         = useState<User[]>([]);

  const { refreshUnreadCount, bumpListVersion } = useNotificationStore();

  const loadProduct = useCallback(async () => {
    try {
      const res = await productsApi.getById(productId);
      setProduct(res.data);
    } catch {
      Alert.alert('Error', 'Could not load product');
      navigation.goBack();
    }
    setLoading(false);
  }, [productId]);

  useEffect(() => { loadProduct(); }, [loadProduct]);

  useEffect(() => {
    usersApi.getList()
      .then((r) => setUsers(r.data?.users || r.data || []))
      .catch(() => {});
  }, []);

  // On mount: mark all product notifications as read
  useEffect(() => {
    notificationsApi.markReadByEntityAndTypes(
      'product', productId,
      ['mention', 'assigned', 'customer_message', 'completed', 'product_created', 'status_change'],
    ).then(() => { refreshUnreadCount(); bumpListVersion(); }).catch(() => {});
  }, [productId]);

  useWsEvents({ onProductsChanged: loadProduct });

  const handleStatusChange = async (newStatus: ProductStatus) => {
    if (!product) return;
    const prev = product.status;
    setProduct((p) => p ? { ...p, status: newStatus } : p);
    try {
      await productsApi.updateStatus(product.id, newStatus);
      loadProduct();
    } catch {
      setProduct((p) => p ? { ...p, status: prev } : p);
      Alert.alert('Error', 'Failed to update status');
    }
  };

  const handleDelete = () => {
    Alert.alert('Delete Product', 'This action cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await productsApi.delete(productId);
            navigation.goBack();
          } catch {
            Alert.alert('Error', 'Failed to delete product');
          }
        },
      },
    ]);
  };

  const [pinning, setPinning] = useState(false);
  const handleTogglePin = async () => {
    if (!product || pinning) return;
    setPinning(true);
    try {
      if (product.pinned_at) {
        await productsApi.unpin(product.id);
        setProduct((p) => p ? { ...p, pinned_at: null } : p);
      } else {
        const res = await productsApi.pin(product.id);
        setProduct((p) => p ? { ...p, pinned_at: res.data?.pinned_at ?? new Date().toISOString() } : p);
      }
    } catch {
      Alert.alert('Error', 'Failed to update pin');
    }
    setPinning(false);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.center}>
          <ActivityIndicator color={c.brand} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (!product) return null;

  const TABS: Array<{ id: TabId; label: string }> = [
    { id: 'details',  label: 'Details'  },
    { id: 'timeline', label: 'Timeline' },
  ];

  return (
    <SafeAreaView style={styles.screen}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Feather name="arrow-left" size={24} color={c.textSec} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.productId}>{product.product_id}</Text>
          <Text style={styles.customerName} numberOfLines={1}>{product.customer_name}</Text>
        </View>
        <TouchableOpacity
          style={[styles.pinBtn, product.pinned_at ? styles.pinBtnActive : null]}
          onPress={handleTogglePin}
          disabled={pinning}
        >
          <Feather name="bookmark" size={16} color={product.pinned_at ? '#F59E0B' : c.textMuted} />
        </TouchableOpacity>
        <View style={styles.headerRight}>
          {canChangeStatus() ? (
            <TouchableOpacity onPress={() => setShowStatus(true)}>
              <StatusChip status={product.status} size="sm" />
            </TouchableOpacity>
          ) : (
            <StatusChip status={product.status} size="sm" />
          )}
          {canDeleteProduct() && (
            <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
              <Feather name="trash-2" size={18} color="#EF4444" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.tab, activeTab === tab.id && styles.tabActive]}
            onPress={() => setActiveTab(tab.id)}
          >
            <Text style={[styles.tabText, activeTab === tab.id && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab content */}
      <View style={{ flex: 1 }}>
        {activeTab === 'details' && (
          <DetailsTab
            product={product}
            users={users}
            canEdit={canCreateProduct()}
            onProductUpdated={setProduct}
            productId={productId}
          />
        )}
        {activeTab === 'timeline' && (
          <TimelineFeed
            productId={productId}
            canPost={canComment()}
          />
        )}
      </View>

      <StatusPickerModal
        current={product.status}
        visible={showStatus}
        onSelect={handleStatusChange}
        onClose={() => setShowStatus(false)}
      />
    </SafeAreaView>
  );
}

function makeScreenStyles(c: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    header: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingHorizontal: 16, paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: c.surface2,
    },
    backBtn: { padding: 4 },
    productId: { fontSize: 12, fontWeight: '700', color: c.brandLight, fontFamily: 'monospace' },
    customerName: { fontSize: 16, fontWeight: '700', color: c.text },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    pinBtn: {
      width: 34, height: 34, borderRadius: 10,
      backgroundColor: c.surface2, alignItems: 'center', justifyContent: 'center',
    },
    pinBtnActive: { backgroundColor: 'rgba(245,158,11,0.15)' },
    deleteBtn: {
      width: 34, height: 34, borderRadius: 10,
      backgroundColor: 'rgba(239,68,68,0.1)', alignItems: 'center', justifyContent: 'center',
    },
    tabs: {
      flexDirection: 'row',
      borderBottomWidth: 1, borderBottomColor: c.surface2,
    },
    tab: {
      flex: 1, paddingVertical: 12, alignItems: 'center',
      borderBottomWidth: 2, borderBottomColor: 'transparent',
    },
    tabActive: { borderBottomColor: c.brand },
    tabText: { fontSize: 14, fontWeight: '600', color: c.textMuted },
    tabTextActive: { color: c.brandLight },
  });
}
