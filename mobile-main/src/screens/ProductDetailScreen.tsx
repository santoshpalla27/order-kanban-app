import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet,
  ActivityIndicator, Alert, Modal, FlatList,
  KeyboardAvoidingView, Linking, Image, useWindowDimensions, Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  productsApi, attachmentsApi, commentsApi, usersApi, notificationsApi,
} from '../api/services';
import { useAuthStore } from '../store/authStore';
import { useWsEvents } from '../hooks/useWsEvents';
import { useProductBadges, COMMENT_TYPES, ATTACHMENT_TYPES } from '../hooks/useProductBadges';
import { useNotificationStore } from '../store/notificationStore';
import {
  Product, Attachment, Comment, User,
  STATUS_LABELS, STATUS_ORDER, STATUS_COLORS, ProductStatus,
} from '../types';
import { formatDateTime, formatRelative, formatFileSize, stripMentions } from '../utils/helpers';
import Avatar from '../components/Avatar';
import StatusChip from '../components/StatusChip';
import { RootStackParamList } from '../navigation';
import { useThemeStore } from '../store/themeStore';
import { darkColors, lightColors, ThemeColors } from '../theme';

type RouteT = RouteProp<RootStackParamList, 'ProductDetail'>;

type TabId = 'details' | 'attachments' | 'comments';

// ─── Status picker modal ────────────────────────────────────────────────────

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

// ─── Details tab ────────────────────────────────────────────────────────────

function DetailsTab({
  product, users, canEdit, onProductUpdated,
}: { product: Product; users: User[]; canEdit: boolean; onProductUpdated: (p: Product) => void }) {
  const isDark = useThemeStore((s) => s.isDark);
  const c = isDark ? darkColors : lightColors;
  const styles = useMemo(() => makeDetailsStyles(c), [c]);

  const [editing, setEditing] = useState(false);
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

// ─── Attachments tab ─────────────────────────────────────────────────────────

// ── helpers ──────────────────────────────────────────────────────────────────
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.bmp', '.svg'];
const isImage = (type: string) => IMAGE_EXTS.includes(type.toLowerCase());

function fileEmoji(type: string) {
  const t = type.toLowerCase();
  if (isImage(t))                          return '🖼';
  if (t === '.pdf')                        return '📄';
  if (['.doc', '.docx'].includes(t))       return '📝';
  if (['.xls', '.xlsx', '.csv'].includes(t)) return '📊';
  if (['.zip', '.rar', '.7z'].includes(t)) return '🗜';
  return '📎';
}

// ── Upload progress modal ─────────────────────────────────────────────────────
interface FileUploadState {
  name: string; size: number; progress: number;
  status: 'pending' | 'uploading' | 'done' | 'error';
}

function UploadProgressModal({
  files, onClose,
}: { files: FileUploadState[]; onClose: () => void }) {
  const isDark = useThemeStore((s) => s.isDark);
  const c = isDark ? darkColors : lightColors;
  const styles = useMemo(() => makeUploadStyles(c), [c]);

  const done       = files.filter((f) => f.status === 'done').length;
  const allSettled = files.every((f) => ['done', 'error'].includes(f.status));

  return (
    <Modal visible transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>{allSettled ? 'Upload Complete' : 'Uploading Files'}</Text>
              <Text style={styles.sub}>{done} of {files.length} done</Text>
            </View>
            {allSettled && (
              <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                <Text style={styles.closeTxt}>Done</Text>
              </TouchableOpacity>
            )}
          </View>
          <ScrollView style={{ maxHeight: 240 }} contentContainerStyle={{ gap: 14, padding: 16 }}>
            {files.map((f, i) => (
              <View key={i}>
                <View style={styles.row}>
                  <Text style={styles.fname} numberOfLines={1}>{f.name}</Text>
                  <Text style={[styles.status,
                    f.status === 'done'  ? styles.statusDone  :
                    f.status === 'error' ? styles.statusErr   : styles.statusActive,
                  ]}>
                    {f.status === 'done'     ? '✓ Done'   :
                     f.status === 'error'    ? '✗ Failed' :
                     f.status === 'pending'  ? 'Waiting…' :
                     `${f.progress}%`}
                  </Text>
                </View>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${f.progress}%` as any },
                    f.status === 'done'  ? styles.fillDone :
                    f.status === 'error' ? styles.fillErr  : {},
                  ]} />
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function makeUploadStyles(c: ThemeColors) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 },
    sheet:    { width: '100%', backgroundColor: c.card, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: c.border2 },
    header:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: c.surface2 },
    title:    { fontSize: 15, fontWeight: '700', color: c.text },
    sub:      { fontSize: 12, color: c.textMuted, marginTop: 2 },
    closeBtn: { backgroundColor: c.brand, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8 },
    closeTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },
    row:      { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
    fname:    { flex: 1, fontSize: 13, color: c.text },
    status:   { fontSize: 12, marginLeft: 8 },
    statusDone:   { color: '#34D399' },
    statusErr:    { color: '#EF4444' },
    statusActive: { color: c.brandLight },
    track:    { height: 4, backgroundColor: c.surface2, borderRadius: 99, overflow: 'hidden' },
    fill:     { height: '100%', backgroundColor: c.brand, borderRadius: 99 },
    fillDone: { backgroundColor: '#34D399' },
    fillErr:  { backgroundColor: '#EF4444' },
  });
}

// ── Image Lightbox ─────────────────────────────────────────────────────────────
function ImageLightbox({
  url, name, attId, onClose, onDownload,
}: { url: string; name: string; attId: number; onClose: () => void; onDownload: () => void }) {
  const { width, height } = useWindowDimensions();
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={[lb.backdrop, { width, height }]} activeOpacity={1} onPress={onClose}>
        <Image
          source={{ uri: url }}
          style={lb.img}
          resizeMode="contain"
        />
        <View style={lb.toolbar}>
          <TouchableOpacity style={lb.toolBtn} onPress={onDownload}>
            <Text style={lb.toolIcon}>⬇</Text>
          </TouchableOpacity>
          <TouchableOpacity style={lb.toolBtn} onPress={() => Linking.openURL(url)}>
            <Text style={lb.toolIcon}>↗</Text>
          </TouchableOpacity>
          <TouchableOpacity style={lb.toolBtn} onPress={onClose}>
            <Text style={lb.toolIcon}>✕</Text>
          </TouchableOpacity>
        </View>
        <Text style={lb.name} numberOfLines={1}>{name}</Text>
      </TouchableOpacity>
    </Modal>
  );
}

// ImageLightbox uses fixed overlay colors — kept as-is (modal overlay)
const lb = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center' },
  img:      { width: '100%', height: '80%' },
  toolbar:  { position: 'absolute', top: 52, right: 16, flexDirection: 'row', gap: 8 },
  toolBtn:  { width: 40, height: 40, borderRadius: 10, backgroundColor: 'rgba(30,37,53,0.9)', alignItems: 'center', justifyContent: 'center' },
  toolIcon: { color: '#F1F5F9', fontSize: 18 },
  name:     { position: 'absolute', bottom: 40, left: 16, right: 16, textAlign: 'center', fontSize: 13, color: '#94A3B8' },
});

// ── Comment on Attachment Modal ────────────────────────────────────────────────
function AttachmentCommentModal({
  att, productId, onClose,
}: { att: Attachment; productId: number; onClose: () => void }) {
  const isDark = useThemeStore((s) => s.isDark);
  const c = isDark ? darkColors : lightColors;
  const styles = useMemo(() => makeAttCommentStyles(c), [c]);

  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);

  const handleSubmit = async () => {
    if (!comment.trim()) return;
    setSending(true);
    try {
      const msg = `${comment.trim()}\n[attachment:${att.id}:${att.file_name}]`;
      await commentsApi.create(productId, msg);
      onClose();
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error || 'Failed to post');
    }
    setSending(false);
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        {/* Dim area above the sheet — tapping it closes the modal */}
        <TouchableOpacity style={styles.dimArea} activeOpacity={1} onPress={onClose} />

        {/* Sheet — fully isolated from the dim area */}
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>💬  Comment on Attachment</Text>
            <TouchableOpacity onPress={onClose}><Text style={styles.close}>✕</Text></TouchableOpacity>
          </View>

          {/* File preview */}
          {isImage(att.file_type) && att.view_url ? (
            <Image source={{ uri: att.view_url }} style={styles.preview} resizeMode="cover" />
          ) : (
            <View style={styles.fileRow}>
              <Text style={styles.fileIcon}>{fileEmoji(att.file_type)}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.fileName} numberOfLines={1}>{att.file_name}</Text>
                <Text style={styles.fileMeta}>{formatFileSize(att.file_size)}</Text>
              </View>
            </View>
          )}
          <Text style={styles.meta}>{att.file_name} · {formatFileSize(att.file_size)}</Text>

          <TextInput
            style={styles.input}
            value={comment}
            onChangeText={setComment}
            placeholder="Write your comment about this attachment..."
            placeholderTextColor={c.textDim}
            multiline
            autoFocus
          />
          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelTxt}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sendBtn, (!comment.trim() || sending) && { opacity: 0.5 }]}
              onPress={handleSubmit}
              disabled={!comment.trim() || sending}
            >
              {sending
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.sendTxt}>Post Comment</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function makeAttCommentStyles(c: ThemeColors) {
  return StyleSheet.create({
    dimArea:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
    sheet:    { backgroundColor: c.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 12, borderWidth: 1, borderColor: c.border2 },
    header:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    title:    { fontSize: 15, fontWeight: '700', color: c.text },
    close:    { fontSize: 18, color: c.textSec, padding: 4 },
    preview:  { width: '100%', height: 180, borderRadius: 12, backgroundColor: c.surface },
    fileRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: c.surface, borderRadius: 12 },
    fileIcon: { fontSize: 28 },
    fileName: { fontSize: 14, fontWeight: '600', color: c.text },
    fileMeta: { fontSize: 12, color: c.textMuted, marginTop: 2 },
    meta:     { fontSize: 11, color: c.textMuted },
    input:    { backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border2, color: c.text, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, minHeight: 90, textAlignVertical: 'top' },
    actions:  { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
    cancelBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: c.border2 },
    cancelTxt: { color: c.textSec, fontSize: 14 },
    sendBtn:  { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10, backgroundColor: c.brand, flexDirection: 'row', alignItems: 'center', gap: 6 },
    sendTxt:  { color: '#fff', fontSize: 14, fontWeight: '700' },
  });
}

// ── AttachmentsTab ─────────────────────────────────────────────────────────────
function AttachmentsTab({
  productId, canUpload, canDelete, userId, attachments, onAttachmentsChanged,
}: { productId: number; canUpload: boolean; canDelete: boolean; userId: number; attachments: Attachment[]; onAttachmentsChanged: () => void }) {
  const isDark = useThemeStore((s) => s.isDark);
  const c = isDark ? darkColors : lightColors;
  const styles = useMemo(() => makeAttachmentsStyles(c), [c]);

  // Upload progress
  const [uploadFiles, setUploadFiles]         = useState<FileUploadState[]>([]);
  const [showUploadModal, setShowUploadModal] = useState(false);

  // Lightbox
  const [lightbox, setLightbox] = useState<{ url: string; name: string; id: number } | null>(null);

  // Comment on attachment
  const [commentingAtt, setCommentingAtt] = useState<Attachment | null>(null);

  // Inline delete confirm
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [deleteError, setDeleteError]         = useState('');
  const [deleting, setDeleting]               = useState(false);

  // ── Multi-file upload ──
  const handleUpload = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: true,
      } as any);
      if (result.canceled || !result.assets?.length) return;

      const files = result.assets;
      const states: FileUploadState[] = files.map((f) => ({
        name: f.name, size: f.size ?? 0, progress: 0, status: 'pending',
      }));
      setUploadFiles(states);
      setShowUploadModal(true);

      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        setUploadFiles((prev) => prev.map((s, idx) => idx === i ? { ...s, status: 'uploading' } : s));
        try {
          await attachmentsApi.uploadWithProgress(
            productId, f.uri, f.name, f.size ?? 0,
            f.mimeType ?? 'application/octet-stream',
            (pct) => setUploadFiles((prev) => prev.map((s, idx) => idx === i ? { ...s, progress: pct } : s)),
          );
          setUploadFiles((prev) => prev.map((s, idx) => idx === i ? { ...s, progress: 100, status: 'done' } : s));
        } catch {
          setUploadFiles((prev) => prev.map((s, idx) => idx === i ? { ...s, status: 'error' } : s));
        }
      }
      onAttachmentsChanged();
    } catch (err: any) {
      Alert.alert('Upload failed', err?.message || 'Something went wrong');
      setShowUploadModal(false);
    }
  };

  // ── Download single ──
  const handleDownload = async (att: Attachment) => {
    try {
      const res = await attachmentsApi.getDownloadUrl(att.id);
      const url = res.data?.url || res.data;
      if (url) Linking.openURL(url);
    } catch {
      Alert.alert('Error', 'Could not get download link');
    }
  };

  // ── Download all ──
  const handleDownloadAll = async () => {
    for (const att of attachments) {
      await handleDownload(att);
      await new Promise((r) => setTimeout(r, 400));
    }
  };

  // ── Delete ──
  const confirmDelete = async () => {
    if (!deleteConfirmId) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await attachmentsApi.delete(deleteConfirmId);
      setDeleteConfirmId(null);
      onAttachmentsChanged();
    } catch (err: any) {
      setDeleteError(err?.response?.status === 403
        ? "You don't have permission to delete this attachment."
        : err?.response?.data?.error || 'Failed to delete. Please try again.');
    }
    setDeleting(false);
  };

  const images = attachments.filter((a) => isImage(a.file_type));
  const files  = attachments.filter((a) => !isImage(a.file_type));

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.scroll}>

        {/* Upload + Download All buttons */}
        {canUpload && (
          <View style={styles.topRow}>
            <TouchableOpacity style={styles.uploadBtn} onPress={handleUpload}>
              <Text style={styles.uploadBtnText}>📎  Upload Files</Text>
            </TouchableOpacity>
            {attachments.length > 0 && (
              <TouchableOpacity style={styles.dlAllBtn} onPress={handleDownloadAll}>
                <Text style={styles.dlAllTxt}>⬇ All</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {attachments.length === 0 ? (
          <TouchableOpacity style={styles.emptyBox} onPress={canUpload ? handleUpload : undefined} activeOpacity={canUpload ? 0.7 : 1}>
            <Text style={{ fontSize: 32 }}>📎</Text>
            <Text style={styles.empty}>No attachments{canUpload ? ' — tap to upload' : ''}</Text>
          </TouchableOpacity>
        ) : (
          <>
            {/* ── Image gallery grid ── */}
            {images.length > 0 && (
              <View style={styles.grid}>
                {images.map((att) => (
                  <View key={att.id} style={styles.gridCell}>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => att.view_url && setLightbox({ url: att.view_url, name: att.file_name, id: att.id })}
                      style={styles.thumb}
                    >
                      {att.view_url ? (
                        <Image source={{ uri: att.view_url }} style={styles.thumbImg} resizeMode="cover" />
                      ) : (
                        <View style={[styles.thumbImg, styles.thumbPlaceholder]}>
                          <Text style={{ fontSize: 28 }}>🖼</Text>
                        </View>
                      )}
                      {/* Overlay actions */}
                      <View style={styles.thumbOverlay}>
                        <Text style={styles.thumbName} numberOfLines={1}>{att.file_name}</Text>
                        <View style={styles.thumbActions}>
                          <TouchableOpacity style={styles.thumbBtn} onPress={() => handleDownload(att)}>
                            <Text style={styles.thumbBtnTxt}>⬇</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={styles.thumbBtn} onPress={() => setCommentingAtt(att)}>
                            <Text style={styles.thumbBtnTxt}>💬</Text>
                          </TouchableOpacity>
                          {(canDelete || att.uploaded_by === userId) && (
                            <TouchableOpacity style={[styles.thumbBtn, styles.thumbBtnDanger]} onPress={() => { setDeleteConfirmId(att.id); setDeleteError(''); }}>
                              <Text style={styles.thumbBtnTxt}>🗑</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {/* ── Non-image files ── */}
            {files.length > 0 && (
              <View style={styles.fileList}>
                {images.length > 0 && <Text style={styles.sectionLabel}>Other Files</Text>}
                {files.map((att) => (
                  <View key={att.id} style={styles.card}>
                    <Text style={styles.cardIcon}>{fileEmoji(att.file_type)}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name} numberOfLines={1}>{att.file_name}</Text>
                      <Text style={styles.meta}>{formatFileSize(att.file_size)} · {att.uploader?.name} · {formatRelative(att.uploaded_at)}</Text>
                    </View>
                    <TouchableOpacity style={styles.action} onPress={() => setCommentingAtt(att)}>
                      <Text style={styles.actionText}>💬</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.action} onPress={() => handleDownload(att)}>
                      <Text style={styles.actionText}>⬇</Text>
                    </TouchableOpacity>
                    {(canDelete || att.uploaded_by === userId) && (
                      <TouchableOpacity
                        style={[styles.action, styles.deleteAction]}
                        onPress={() => { setDeleteConfirmId(att.id); setDeleteError(''); }}
                      >
                        <Text style={styles.deleteText}>🗑</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Upload progress modal */}
      {showUploadModal && (
        <UploadProgressModal
          files={uploadFiles}
          onClose={() => { setShowUploadModal(false); setUploadFiles([]); }}
        />
      )}

      {/* Image lightbox */}
      {lightbox && (
        <ImageLightbox
          url={lightbox.url}
          name={lightbox.name}
          attId={lightbox.id}
          onClose={() => setLightbox(null)}
          onDownload={() => {
            const att = attachments.find((a) => a.id === lightbox.id);
            if (att) handleDownload(att);
          }}
        />
      )}

      {/* Attachment comment modal */}
      {commentingAtt && (
        <AttachmentCommentModal
          att={commentingAtt}
          productId={productId}
          onClose={() => setCommentingAtt(null)}
        />
      )}

      {/* Inline delete confirmation */}
      <Modal visible={!!deleteConfirmId} transparent animationType="fade" onRequestClose={() => setDeleteConfirmId(null)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => !deleting && setDeleteConfirmId(null)}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Delete Attachment?</Text>
            {deleteError ? (
              <View style={styles.errorBox}><Text style={styles.errorTxt}>{deleteError}</Text></View>
            ) : (
              <Text style={styles.modalSub}>This action cannot be undone.</Text>
            )}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => { setDeleteConfirmId(null); setDeleteError(''); }} disabled={deleting}>
                <Text style={styles.modalCancelTxt}>Cancel</Text>
              </TouchableOpacity>
              {!deleteError && (
                <TouchableOpacity style={styles.modalDelete} onPress={confirmDelete} disabled={deleting}>
                  {deleting
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.modalDeleteTxt}>Delete</Text>
                  }
                </TouchableOpacity>
              )}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

function makeAttachmentsStyles(c: ThemeColors) {
  return StyleSheet.create({
    scroll:  { padding: 16, gap: 14, paddingBottom: 40 },
    center:  { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
    empty:   { fontSize: 14, color: c.textMuted },

    topRow:  { flexDirection: 'row', gap: 10 },
    uploadBtn: {
      flex: 1, backgroundColor: 'rgba(99,102,241,0.15)', borderRadius: 12,
      borderWidth: 1, borderColor: c.brand, paddingVertical: 12, alignItems: 'center',
    },
    uploadBtnText: { color: c.brandLight, fontSize: 14, fontWeight: '600' },
    dlAllBtn: {
      backgroundColor: c.surface, borderRadius: 12, borderWidth: 1,
      borderColor: c.border2, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center',
    },
    dlAllTxt: { color: c.textSec, fontSize: 13, fontWeight: '600' },

    emptyBox: {
      borderWidth: 2, borderStyle: 'dashed', borderColor: c.surface2,
      borderRadius: 14, padding: 40, alignItems: 'center', gap: 8,
    },

    // Image grid
    grid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    gridCell: { width: '48%' },
    thumb:    { aspectRatio: 4/3, borderRadius: 12, overflow: 'hidden', backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2 },
    thumbImg: { width: '100%', height: '100%' },
    thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
    thumbOverlay: {
      position: 'absolute', bottom: 0, left: 0, right: 0,
      paddingHorizontal: 8, paddingVertical: 6,
      backgroundColor: 'rgba(0,0,0,0.65)',
    },
    thumbName:    { fontSize: 10, color: '#fff', marginBottom: 4 },
    thumbActions: { flexDirection: 'row', gap: 4 },
    thumbBtn: {
      paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
      backgroundColor: 'rgba(255,255,255,0.15)',
    },
    thumbBtnDanger: { backgroundColor: 'rgba(239,68,68,0.4)', marginLeft: 'auto' },
    thumbBtnTxt:    { fontSize: 11, color: '#fff' },

    // File list
    fileList:    { gap: 8 },
    sectionLabel: { fontSize: 11, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
    card: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: c.surface, borderRadius: 12, padding: 12,
      borderWidth: 1, borderColor: c.border2,
    },
    cardIcon: { fontSize: 24 },
    name:     { fontSize: 14, fontWeight: '600', color: c.text },
    meta:     { fontSize: 11, color: c.textMuted, marginTop: 2 },
    action:   { width: 36, height: 36, borderRadius: 10, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center' },
    actionText:   { fontSize: 16 },
    deleteAction: { backgroundColor: 'rgba(239,68,68,0.1)' },
    deleteText:   { fontSize: 16 },

    // Delete modal
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 },
    modalSheet:    { width: '100%', backgroundColor: c.card, borderRadius: 20, padding: 24, alignItems: 'center', gap: 12, borderWidth: 1, borderColor: c.border2 },
    modalTitle:    { fontSize: 17, fontWeight: '700', color: c.text },
    modalSub:      { fontSize: 13, color: c.textMuted, textAlign: 'center' },
    errorBox:      { backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', padding: 10, width: '100%' },
    errorTxt:      { color: '#FCA5A5', fontSize: 13, textAlign: 'center' },
    modalActions:  { flexDirection: 'row', gap: 12, marginTop: 4 },
    modalCancel:   { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: c.border2, alignItems: 'center' },
    modalCancelTxt: { color: c.textSec, fontWeight: '600' },
    modalDelete:   { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: '#EF4444', alignItems: 'center' },
    modalDeleteTxt: { color: '#fff', fontWeight: '700' },
  });
}

// ─── Comments tab ─────────────────────────────────────────────────────────────

interface ParsedComment {
  text: string;
  attachmentId?: number;
  attachmentUrl?: string;
  attachmentName?: string;
  replyId?: number;
  replyPreview?: string;
}

function parseCommentMessage(raw: string): ParsedComment {
  const lines = raw.split('\n');
  const result: ParsedComment = { text: '' };
  const textLines: string[] = [];

  for (const line of lines) {
    const attMatch = line.match(/^\[attachment:(.+):(.+?)\]$/);
    if (attMatch) {
      const idOrUrl = attMatch[1];
      const numId = Number(idOrUrl);
      if (!isNaN(numId)) result.attachmentId = numId;
      else result.attachmentUrl = idOrUrl;
      result.attachmentName = attMatch[2];
      continue;
    }
    const replyMatch = line.match(/^\[reply:(\d+):(.+?)\]$/);
    if (replyMatch) {
      result.replyId = Number(replyMatch[1]);
      result.replyPreview = replyMatch[2];
      continue;
    }
    textLines.push(line);
  }
  result.text = textLines.join('\n').trim();
  return result;
}

interface MenuState { commentId: number; isOwn: boolean; text: string; authorName: string }

function CommentsTab({
  productId, canComment, userId, attachments,
}: { productId: number; canComment: boolean; userId: number; attachments: Attachment[] }) {
  const isDark = useThemeStore((s) => s.isDark);
  const c = isDark ? darkColors : lightColors;
  const styles = useMemo(() => makeCommentsStyles(c), [c]);

  const [comments, setComments]   = useState<Comment[]>([]);
  const [loading, setLoading]     = useState(true);
  const [message, setMessage]     = useState('');
  const [sending, setSending]     = useState(false);

  // Edit mode
  const [editId, setEditId]       = useState<number | null>(null);
  const [editText, setEditText]   = useState('');

  // Reply
  const [replyTo, setReplyTo]     = useState<{ id: number; name: string; text: string } | null>(null);

  // Long-press context menu
  const [menu, setMenu]           = useState<MenuState | null>(null);

  // Attachment lightbox inside comments
  const [attLightbox, setAttLightbox] = useState<{ url: string; name: string; id?: number } | null>(null);

  // @mention state
  const inputRef     = useRef<TextInput>(null);
  const listRef      = useRef<FlatList<Comment>>(null);
  const keyboardOpen = useRef(false);
  const didScroll    = useRef(false);
  const userScrolled = useRef(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState(0);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [orderResults, setOrderResults] = useState<any[]>([]);
  const [orderLoading, setOrderLoading] = useState(false);
  const orderTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingCursor = useRef<{ start: number; end: number } | null>(null);
  const [forcedCursor, setForcedCursor] = useState<{ start: number; end: number } | undefined>();

  useEffect(() => {
    usersApi.getList().then((res: any) => setAllUsers(res.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (mentionQuery === null) { setOrderResults([]); return; }
    clearTimeout(orderTimer.current);
    orderTimer.current = setTimeout(async () => {
      setOrderLoading(true);
      try {
        const res = await productsApi.getPaged(mentionQuery ? { search: mentionQuery } : undefined, 6);
        setOrderResults((res as any)?.data?.data ?? []);
      } catch { setOrderResults([]); }
      setOrderLoading(false);
    }, 250);
  }, [mentionQuery]);

  const filteredUsers = useMemo(() =>
    mentionQuery !== null
      ? allUsers.filter((u) => u.name.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 5)
      : [],
    [mentionQuery, allUsers],
  );

  type MentionEntry = { kind: 'user'; user: User } | { kind: 'order'; product: any };
  const mentionEntries: MentionEntry[] = [
    ...filteredUsers.map((u): MentionEntry => ({ kind: 'user', user: u })),
    ...orderResults.map((p): MentionEntry => ({ kind: 'order', product: p })),
  ];
  const showMentionDropdown = mentionQuery !== null && (mentionEntries.length > 0 || orderLoading);

  const handleInputChange = (text: string) => {
    setMessage(text);
    const atIdx = text.lastIndexOf('@');
    if (atIdx !== -1) {
      const query = text.slice(atIdx + 1);
      if (!query.includes('[') && !query.includes(']') &&
          !query.includes('{') && !query.includes('}') &&
          query.length <= 30) {
        setMentionStart(atIdx);
        setMentionQuery(query);
        return;
      }
    }
    setMentionQuery(null);
  };

  const selectMentionUser = (u: User) => {
    const mentionEnd = mentionStart + 1 + (mentionQuery?.length ?? 0);
    const before = message.slice(0, mentionStart);
    const after = message.slice(mentionEnd);
    const inserted = `@[${u.name}] `;
    const newPos = mentionStart + inserted.length;
    setMessage(`${before}${inserted}${after}`);
    setMentionQuery(null);
    pendingCursor.current = { start: newPos, end: newPos };
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const selectMentionOrder = (product: any) => {
    const mentionEnd = mentionStart + 1 + (mentionQuery?.length ?? 0);
    const before = message.slice(0, mentionStart);
    const after = message.slice(mentionEnd);
    const token = `@{${product.id}:${product.product_id}} `;
    const newPos = mentionStart + token.length;
    setMessage(`${before}${token}${after}`);
    setMentionQuery(null);
    pendingCursor.current = { start: newPos, end: newPos };
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const load = useCallback(async () => {
    try {
      const res = await commentsApi.getByProduct(productId);
      setComments(res.data || []);
    } catch {}
    setLoading(false);
  }, [productId]);

  useEffect(() => { load(); }, [load]);
  useWsEvents({ onCommentsChanged: load });

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => {
      keyboardOpen.current = true;
      setTimeout(() => {
        if (!userScrolled.current) {
          listRef.current?.scrollToEnd({ animated: false });
        }
      }, 50);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      keyboardOpen.current = false;
    });
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  const handleSend = async () => {
    if (!message.trim()) return;
    setSending(true);
    try {
      const text = replyTo
        ? `↩ ${replyTo.name}: "${stripMentions(replyTo.text).slice(0, 60)}"\n${message.trim()}`
        : message.trim();
      await commentsApi.create(productId, text);
      setMessage('');
      setReplyTo(null);
      await load();
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error || 'Failed to post comment');
    }
    setSending(false);
  };

  const handleEdit = async (id: number) => {
    if (!editText.trim()) return;
    try {
      await commentsApi.update(id, editText.trim());
      setEditId(null);
      setEditText('');
      await load();
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error || 'Failed to update comment');
    }
  };

  const [confirmingDelete, setConfirmingDelete] = useState<number | null>(null);

  const doDelete = async (id: number) => {
    setMenu(null);
    setConfirmingDelete(null);
    try {
      await commentsApi.delete(id);
      setComments((prev) => prev.filter((c) => c.id !== id));
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error || 'Failed to delete comment');
    }
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={c.brand} /></View>;
  }

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        ref={listRef}
        data={comments}
        keyExtractor={(c) => String(c.id)}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => {
          if (!userScrolled.current) {
            listRef.current?.scrollToEnd({ animated: false });
          }
        }}
        onLayout={() => {
          if (keyboardOpen.current && !userScrolled.current) {
            listRef.current?.scrollToEnd({ animated: false });
          }
        }}
        onScroll={(e) => {
          const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
          const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
          userScrolled.current = distanceFromBottom > 80;
        }}
        scrollEventThrottle={100}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={{ fontSize: 32 }}>💬</Text>
            <Text style={styles.empty}>No comments yet</Text>
          </View>
        }
        renderItem={({ item: c }) => {
          const isOwn = c.user_id === userId;
          const name  = c.user?.name || 'User';

          // Inline edit mode
          if (editId === c.id) {
            return (
              <View style={[styles.row, isOwn ? styles.rowOwn : styles.rowOther]}>
                <View style={[styles.editBubble, { maxWidth: '85%' }]}>
                  <TextInput
                    style={styles.editInput}
                    value={editText}
                    onChangeText={setEditText}
                    multiline
                    autoFocus
                  />
                  <View style={styles.editActions}>
                    <TouchableOpacity onPress={() => { setEditId(null); setEditText(''); }}>
                      <Text style={styles.editCancel}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleEdit(c.id)}>
                      <Text style={styles.editSave}>Save</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          }

          return (
            <View style={[styles.row, isOwn ? styles.rowOwn : styles.rowOther]}>
              {/* Avatar — others only */}
              {!isOwn && (
                <View style={styles.avatarWrap}>
                  <Avatar name={name} avatarUrl={c.user?.avatar_url} size={30} />
                </View>
              )}

              <View style={[styles.bubbleWrap, isOwn ? styles.bubbleWrapOwn : styles.bubbleWrapOther]}>
                {!isOwn && <Text style={styles.senderName}>{name}</Text>}

                {/* Long-press bubble to open menu */}
                <TouchableOpacity
                  activeOpacity={0.85}
                  onLongPress={() => setMenu({ commentId: c.id, isOwn, text: c.message, authorName: name })}
                  delayLongPress={300}
                >
                  {(() => {
                    const parsed = parseCommentMessage(c.message);
                    const resolvedAtt = parsed.attachmentId
                      ? attachments.find((a) => a.id === parsed.attachmentId)
                      : null;
                    const attUrl = resolvedAtt?.view_url || parsed.attachmentUrl || '';
                    const attIsImage = resolvedAtt
                      ? isImage(resolvedAtt.file_type)
                      : /\.(jpg|jpeg|png|gif|webp|heic|bmp)(\?|$)/i.test(attUrl);

                    return (
                      <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
                        {/* Reply quote */}
                        {parsed.replyPreview && (
                          <View style={[styles.replyQuote, isOwn ? styles.replyQuoteOwn : styles.replyQuoteOther]}>
                            <Text style={styles.replyQuoteText} numberOfLines={1}>{parsed.replyPreview}</Text>
                          </View>
                        )}

                        {/* Main text */}
                        {!!parsed.text && (
                          <Text style={[styles.msgText, isOwn ? styles.msgTextOwn : styles.msgTextOther]}>
                            {stripMentions(parsed.text)}
                          </Text>
                        )}

                        {/* Attachment — image thumbnail */}
                        {attUrl && attIsImage && (
                          <TouchableOpacity
                            style={styles.attThumb}
                            onPress={() => setAttLightbox({ url: attUrl, name: parsed.attachmentName || 'image', id: parsed.attachmentId })}
                            activeOpacity={0.85}
                          >
                            <Image source={{ uri: attUrl }} style={styles.attThumbImg} resizeMode="cover" />
                            {parsed.attachmentName && (
                              <View style={styles.attThumbOverlay}>
                                <Text style={styles.attThumbName} numberOfLines={1}>{parsed.attachmentName}</Text>
                              </View>
                            )}
                          </TouchableOpacity>
                        )}

                        {/* Attachment — non-image file chip */}
                        {attUrl && !attIsImage && (
                          <View style={[styles.attFile, isOwn ? styles.attFileOwn : styles.attFileOther]}>
                            <Text style={styles.attFileIcon}>
                              {fileEmoji(resolvedAtt?.file_type || parsed.attachmentName?.match(/\.\w+$/)?.[0] || '')}
                            </Text>
                            <Text style={[styles.attFileName, isOwn ? styles.attFileNameOwn : {}]} numberOfLines={1}>
                              {parsed.attachmentName || 'File'}
                            </Text>
                          </View>
                        )}

                        <Text style={[styles.timestamp, isOwn ? styles.timestampOwn : styles.timestampOther]}>
                          {formatRelative(c.created_at)}
                        </Text>
                      </View>
                    );
                  })()}
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
      />

      {/* Reply preview bar */}
      {replyTo && (
        <View style={styles.replyBar}>
          <View style={styles.replyContent}>
            <Text style={styles.replyLabel}>↩ Replying to {replyTo.name}</Text>
            <Text style={styles.replyText} numberOfLines={1}>
              {stripMentions(replyTo.text).slice(0, 80)}
            </Text>
          </View>
          <TouchableOpacity onPress={() => setReplyTo(null)} style={styles.replyClear}>
            <Text style={styles.replyClearText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* @mention dropdown */}
      {showMentionDropdown && (
        <View style={styles.mentionDropdown}>
          <Text style={styles.mentionHeader}>Mention</Text>
          {filteredUsers.length > 0 && (
            <>
              <Text style={styles.mentionSection}>PEOPLE</Text>
              {filteredUsers.map((u) => (
                <TouchableOpacity
                  key={`u-${u.id}`}
                  style={styles.mentionItem}
                  onPress={() => selectMentionUser(u)}
                >
                  <View style={styles.mentionAvatar}>
                    <Text style={styles.mentionAvatarText}>{u.name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <Text style={styles.mentionName}>{u.name}</Text>
                  {u.role && <Text style={styles.mentionRole}>{(u.role as any).name}</Text>}
                </TouchableOpacity>
              ))}
            </>
          )}
          {(orderResults.length > 0 || orderLoading) && (
            <>
              <Text style={[styles.mentionSection, filteredUsers.length > 0 && styles.mentionSectionBorder]}>ORDERS</Text>
              {orderLoading && orderResults.length === 0 ? (
                <ActivityIndicator color="#F59E0B" size="small" style={{ marginVertical: 8 }} />
              ) : orderResults.map((p) => (
                <TouchableOpacity
                  key={`o-${p.id}`}
                  style={styles.mentionItem}
                  onPress={() => selectMentionOrder(p)}
                >
                  <View style={styles.mentionOrderIcon}>
                    <Text style={{ fontSize: 12 }}>📦</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.mentionOrderId}>{p.product_id}</Text>
                    <Text style={styles.mentionOrderCustomer} numberOfLines={1}>{p.customer_name}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </>
          )}
        </View>
      )}

      {canComment && (
        <View style={styles.inputBar}>
          <TextInput
            ref={inputRef}
            style={styles.input}
            value={message}
            onChangeText={handleInputChange}
            selection={forcedCursor}
            onFocus={() => {
              if (pendingCursor.current) {
                const sel = pendingCursor.current;
                pendingCursor.current = null;
                setTimeout(() => setForcedCursor(sel), 20);
              }
            }}
            onSelectionChange={() => setForcedCursor(undefined)}
            placeholder={replyTo ? `Reply to ${replyTo.name}…` : 'Write a comment... (@name to mention)'}
            placeholderTextColor={c.textMuted}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!message.trim() || sending) && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!message.trim() || sending}
          >
            {sending
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.sendIcon}>➤</Text>
            }
          </TouchableOpacity>
        </View>
      )}

      {/* Context menu modal */}
      <Modal
        visible={!!menu}
        transparent
        animationType="slide"
        onRequestClose={() => { setMenu(null); setConfirmingDelete(null); }}
      >
        <TouchableOpacity
          style={styles.menuBackdrop}
          activeOpacity={1}
          onPress={() => { setMenu(null); setConfirmingDelete(null); }}
        >
          <View style={styles.menuSheet}>
            <View style={styles.menuHandle} />

            {confirmingDelete !== null ? (
              /* ── Inline delete confirmation ── */
              <>
                <Text style={styles.menuConfirmTitle}>Delete this comment?</Text>
                <Text style={styles.menuConfirmSub}>This cannot be undone.</Text>
                <TouchableOpacity
                  style={[styles.menuItem, styles.menuItemDanger]}
                  onPress={() => doDelete(confirmingDelete)}
                >
                  <Text style={styles.menuIcon}>🗑️</Text>
                  <Text style={[styles.menuLabel, styles.menuLabelDanger]}>Yes, Delete</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.menuCancel} onPress={() => setConfirmingDelete(null)}>
                  <Text style={styles.menuCancelText}>Cancel</Text>
                </TouchableOpacity>
              </>
            ) : (
              /* ── Normal menu ── */
              <>
                {/* Reply — always available */}
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => {
                    setReplyTo({ id: menu!.commentId, name: menu!.authorName, text: menu!.text });
                    setMenu(null);
                  }}
                >
                  <Text style={styles.menuIcon}>↩</Text>
                  <Text style={styles.menuLabel}>Reply</Text>
                </TouchableOpacity>

                {/* Edit — own only */}
                {menu?.isOwn && (
                  <TouchableOpacity
                    style={styles.menuItem}
                    onPress={() => {
                      setEditId(menu!.commentId);
                      setEditText(menu!.text);
                      setMenu(null);
                    }}
                  >
                    <Text style={styles.menuIcon}>✏️</Text>
                    <Text style={styles.menuLabel}>Edit</Text>
                  </TouchableOpacity>
                )}

                {/* Delete — own only */}
                {menu?.isOwn && (
                  <TouchableOpacity
                    style={[styles.menuItem, styles.menuItemDanger]}
                    onPress={() => setConfirmingDelete(menu!.commentId)}
                  >
                    <Text style={styles.menuIcon}>🗑️</Text>
                    <Text style={[styles.menuLabel, styles.menuLabelDanger]}>Delete</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity style={styles.menuCancel} onPress={() => setMenu(null)}>
                  <Text style={styles.menuCancelText}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Attachment image lightbox from comments */}
      {attLightbox && (
        <ImageLightbox
          url={attLightbox.url}
          name={attLightbox.name}
          attId={attLightbox.id ?? 0}
          onClose={() => setAttLightbox(null)}
          onDownload={async () => {
            if (attLightbox.id) {
              try {
                const res = await attachmentsApi.getDownloadUrl(attLightbox.id);
                const url = res.data?.url || res.data;
                if (url) Linking.openURL(url);
              } catch {}
            } else {
              Linking.openURL(attLightbox.url);
            }
          }}
        />
      )}
    </View>
  );
}

function makeCommentsStyles(c: ThemeColors) {
  return StyleSheet.create({
    list: { padding: 12, paddingBottom: 20 },
    center: { alignItems: 'center', padding: 32, gap: 8 },
    empty: { fontSize: 14, color: c.textMuted },

    // Row layout
    row: { flexDirection: 'row', marginBottom: 6, alignItems: 'flex-end' },
    rowOwn:   { justifyContent: 'flex-end' },
    rowOther: { justifyContent: 'flex-start' },

    // Avatar
    avatarWrap: { marginRight: 6, marginBottom: 2 },

    // Bubble container
    bubbleWrap: { maxWidth: '78%', gap: 3 },
    bubbleWrapOwn:   { alignItems: 'flex-end' },
    bubbleWrapOther: { alignItems: 'flex-start' },

    senderName: { fontSize: 11, fontWeight: '700', color: c.brandLight, marginLeft: 4, marginBottom: 1 },

    // Bubble itself
    bubble: { borderRadius: 18, paddingHorizontal: 13, paddingVertical: 8, paddingBottom: 6 },
    bubbleOwn: {
      backgroundColor: c.brand,
      borderBottomRightRadius: 4,
    },
    bubbleOther: {
      backgroundColor: c.surface2,
      borderWidth: 1,
      borderColor: c.border2,
      borderBottomLeftRadius: 4,
    },
    editBubble: { backgroundColor: c.surface2, borderWidth: 1, borderColor: c.border2, padding: 10, borderRadius: 14 },

    msgText: { fontSize: 14, lineHeight: 20 },
    msgTextOwn:   { color: '#FFFFFF' },
    msgTextOther: { color: c.text },

    timestamp: { fontSize: 10, marginTop: 3, textAlign: 'right' },
    timestampOwn:   { color: 'rgba(255,255,255,0.55)' },
    timestampOther: { color: c.textMuted },

    // Own message actions (below bubble)
    ownActions: { flexDirection: 'row', gap: 4, marginRight: 2 },
    actionBtn: { padding: 3 },
    actionIcon: { fontSize: 12, color: c.textMuted },

    // Edit mode
    editInput: {
      backgroundColor: c.card, borderRadius: 8, borderWidth: 1,
      borderColor: c.border2, color: c.text, padding: 10, fontSize: 14, minWidth: 200,
    },
    editActions: { flexDirection: 'row', gap: 14, justifyContent: 'flex-end', marginTop: 6 },
    editCancel: { color: c.textMuted, fontSize: 13 },
    editSave: { color: c.brandLight, fontSize: 13, fontWeight: '700' },

    // Reply quote inside bubble
    replyQuote: { borderLeftWidth: 3, paddingLeft: 8, marginBottom: 6, borderRadius: 4, paddingVertical: 3 },
    replyQuoteOwn:   { borderLeftColor: 'rgba(255,255,255,0.4)', backgroundColor: 'rgba(255,255,255,0.08)' },
    replyQuoteOther: { borderLeftColor: c.brand, backgroundColor: 'rgba(99,102,241,0.08)' },
    replyQuoteText:  { fontSize: 11, color: c.textSec, fontStyle: 'italic' },

    // Attachment image thumbnail inside bubble
    attThumb: { borderRadius: 10, overflow: 'hidden', marginTop: 4, marginBottom: 4 },
    attThumbImg: { width: 200, height: 140 },
    attThumbOverlay: {
      position: 'absolute', bottom: 0, left: 0, right: 0,
      backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 8, paddingVertical: 4,
    },
    attThumbName: { fontSize: 10, color: '#fff' },

    // Attachment file chip inside bubble
    attFile: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, padding: 8, marginTop: 4 },
    attFileOwn:   { backgroundColor: 'rgba(255,255,255,0.1)' },
    attFileOther: { backgroundColor: 'rgba(99,102,241,0.12)' },
    attFileIcon:  { fontSize: 20 },
    attFileName:  { fontSize: 12, color: c.textSec, flex: 1 },
    attFileNameOwn: { color: 'rgba(255,255,255,0.85)' },

    // Mention dropdown
    mentionDropdown: {
      marginHorizontal: 12, marginBottom: 4,
      backgroundColor: c.card, borderRadius: 14,
      borderWidth: 1, borderColor: c.border2,
      overflow: 'hidden',
      shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.3, shadowRadius: 8,
      elevation: 8,
    },
    mentionHeader: {
      fontSize: 10, fontWeight: '700', color: c.textDim,
      letterSpacing: 1, textTransform: 'uppercase',
      paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4,
      borderBottomWidth: 1, borderBottomColor: c.surface2,
    },
    mentionSection: {
      fontSize: 9, fontWeight: '700', color: c.textDim,
      letterSpacing: 1.5, textTransform: 'uppercase',
      paddingHorizontal: 12, paddingTop: 8, paddingBottom: 2,
    },
    mentionSectionBorder: {
      borderTopWidth: 1, borderTopColor: c.surface2, marginTop: 4,
    },
    mentionItem: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingHorizontal: 12, paddingVertical: 9,
    },
    mentionAvatar: {
      width: 28, height: 28, borderRadius: 14,
      backgroundColor: c.brand, alignItems: 'center', justifyContent: 'center',
    },
    mentionAvatarText: { fontSize: 11, fontWeight: '700', color: '#fff' },
    mentionName: { flex: 1, fontSize: 13, fontWeight: '600', color: c.text },
    mentionRole: { fontSize: 11, color: c.textMuted },
    mentionOrderIcon: {
      width: 28, height: 28, borderRadius: 8,
      backgroundColor: 'rgba(245,158,11,0.15)', alignItems: 'center', justifyContent: 'center',
    },
    mentionOrderId: { fontSize: 12, fontWeight: '700', color: '#F59E0B', fontVariant: ['tabular-nums'] as any },
    mentionOrderCustomer: { fontSize: 11, color: c.textMuted },

    inputBar: {
      flexDirection: 'row', alignItems: 'flex-end', gap: 10,
      padding: 12, borderTopWidth: 1, borderTopColor: c.surface2,
    },
    input: {
      flex: 1, backgroundColor: c.surface, borderRadius: 12, borderWidth: 1,
      borderColor: c.border2, color: c.text, paddingHorizontal: 14,
      paddingVertical: 10, fontSize: 14, maxHeight: 100,
    },
    sendBtn: {
      width: 40, height: 40, borderRadius: 20,
      backgroundColor: c.brand, alignItems: 'center', justifyContent: 'center',
    },
    sendBtnDisabled: { opacity: 0.4 },
    sendIcon: { color: '#fff', fontSize: 16 },

    // Reply bar
    replyBar: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 12, paddingVertical: 8,
      borderTopWidth: 1, borderTopColor: c.surface2,
      backgroundColor: c.headerBg,
    },
    replyContent: { flex: 1, borderLeftWidth: 3, borderLeftColor: c.brand, paddingLeft: 8, gap: 2 },
    replyLabel: { fontSize: 11, fontWeight: '700', color: c.brandLight },
    replyText: { fontSize: 12, color: c.textSec },
    replyClear: { padding: 6 },
    replyClearText: { color: c.textMuted, fontSize: 16 },

    // Context menu sheet
    menuBackdrop: {
      flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'flex-end',
    },
    menuSheet: {
      backgroundColor: c.card,
      borderTopLeftRadius: 20, borderTopRightRadius: 20,
      paddingTop: 12, paddingBottom: 28, paddingHorizontal: 16, gap: 4,
    },
    menuHandle: {
      width: 40, height: 4, borderRadius: 99,
      backgroundColor: c.border2, alignSelf: 'center', marginBottom: 12,
    },
    menuItem: {
      flexDirection: 'row', alignItems: 'center', gap: 14,
      paddingVertical: 14, paddingHorizontal: 8, borderRadius: 12,
    },
    menuItemDanger: { backgroundColor: 'rgba(239,68,68,0.08)' },
    menuIcon: { fontSize: 18, width: 24, textAlign: 'center' },
    menuLabel: { fontSize: 15, fontWeight: '600', color: c.text },
    menuLabelDanger: { color: '#EF4444' },
    menuCancel: {
      marginTop: 8, paddingVertical: 14, alignItems: 'center',
      backgroundColor: c.surface2, borderRadius: 14,
    },
    menuCancelText: { fontSize: 15, fontWeight: '700', color: c.textSec },
    menuConfirmTitle: { fontSize: 16, fontWeight: '700', color: c.text, textAlign: 'center', marginBottom: 4 },
    menuConfirmSub: { fontSize: 13, color: c.textMuted, textAlign: 'center', marginBottom: 8 },
  });
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function ProductDetailScreen() {
  const route     = useRoute<RouteT>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { productId } = route.params;

  const isDark = useThemeStore((s) => s.isDark);
  const c = isDark ? darkColors : lightColors;
  const styles = useMemo(() => makeScreenStyles(c), [c]);

  const { user, canChangeStatus, canCreateProduct, canDeleteProduct, canUploadAttachment, canComment } = useAuthStore();

  const [product, setProduct]       = useState<Product | null>(null);
  const [loading, setLoading]       = useState(true);
  const [activeTab, setActiveTab]   = useState<TabId>('details');
  const [showStatus, setShowStatus] = useState(false);
  const [users, setUsers]           = useState<User[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);

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

  const loadAttachments = useCallback(async () => {
    try {
      const res = await attachmentsApi.getByProduct(productId);
      setAttachments(res.data || []);
    } catch {}
  }, [productId]);

  useEffect(() => { loadAttachments(); }, [loadAttachments]);

  useWsEvents({ onProductsChanged: loadProduct, onAttachmentsChanged: loadAttachments });

  const { has, refreshBadges } = useProductBadges();
  const { refreshUnreadCount } = useNotificationStore();

  // Mark notifications as read and refresh badge state when user opens a tab
  useEffect(() => {
    if (activeTab === 'comments' && has(productId, 'comments')) {
      notificationsApi.markReadByEntityAndTypes('product', productId, COMMENT_TYPES)
        .then(() => { refreshBadges(); refreshUnreadCount(); })
        .catch(() => {});
    } else if (activeTab === 'attachments' && has(productId, 'attachments')) {
      notificationsApi.markReadByEntityAndTypes('product', productId, ATTACHMENT_TYPES)
        .then(() => { refreshBadges(); refreshUnreadCount(); })
        .catch(() => {});
    }
  }, [activeTab, productId]);

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

  const TABS: Array<{ id: TabId; label: string; badge: boolean }> = [
    { id: 'details',     label: 'Details',     badge: false },
    { id: 'attachments', label: 'Attachments', badge: has(productId, 'attachments') },
    { id: 'comments',    label: 'Comments',    badge: has(productId, 'comments') },
  ];

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.productId}>{product.product_id}</Text>
          <Text style={styles.customerName} numberOfLines={1}>{product.customer_name}</Text>
        </View>
        <View style={styles.headerRight}>
          {canChangeStatus() && (
            <TouchableOpacity onPress={() => setShowStatus(true)}>
              <StatusChip status={product.status} size="sm" />
            </TouchableOpacity>
          )}
          {!canChangeStatus() && (
            <StatusChip status={product.status} size="sm" />
          )}
          {canDeleteProduct() && (
            <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
              <Text style={styles.deleteBtnText}>🗑</Text>
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
            <View style={styles.tabInner}>
              <Text style={[styles.tabText, activeTab === tab.id && styles.tabTextActive]}>
                {tab.label}
              </Text>
              {tab.badge && <View style={styles.tabBadge} />}
            </View>
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
          />
        )}
        {activeTab === 'attachments' && (
          <AttachmentsTab
            productId={productId}
            canUpload={canUploadAttachment()}
            canDelete={canDeleteProduct()}
            userId={user?.id ?? 0}
            attachments={attachments}
            onAttachmentsChanged={loadAttachments}
          />
        )}
        {activeTab === 'comments' && (
          <CommentsTab
            productId={productId}
            canComment={canComment()}
            userId={user?.id ?? 0}
            attachments={attachments}
          />
        )}
      </View>

      {/* Status picker */}
      <StatusPickerModal
        current={product.status}
        visible={showStatus}
        onSelect={handleStatusChange}
        onClose={() => setShowStatus(false)}
      />
      </KeyboardAvoidingView>
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
    backIcon: { fontSize: 22, color: c.textSec },
    productId: { fontSize: 12, fontWeight: '700', color: c.brandLight, fontFamily: 'monospace' },
    customerName: { fontSize: 16, fontWeight: '700', color: c.text },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    deleteBtn: {
      width: 34, height: 34, borderRadius: 10,
      backgroundColor: 'rgba(239,68,68,0.1)', alignItems: 'center', justifyContent: 'center',
    },
    deleteBtnText: { fontSize: 16 },
    tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: c.surface2 },
    tab: {
      flex: 1, paddingVertical: 13, alignItems: 'center',
      borderBottomWidth: 2, borderBottomColor: 'transparent',
    },
    tabActive: { borderBottomColor: c.brand },
    tabText: { fontSize: 13, fontWeight: '600', color: c.textMuted },
    tabTextActive: { color: c.brandLight },
    tabInner: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    tabBadge: {
      width: 7, height: 7, borderRadius: 99,
      backgroundColor: '#EF4444',
    },
  });
}
