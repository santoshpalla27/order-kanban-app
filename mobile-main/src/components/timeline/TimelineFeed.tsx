import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Modal, Image, Linking, KeyboardAvoidingView,
  Platform, useWindowDimensions,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useThemeStore } from '../../store/themeStore';
import { darkColors, lightColors, ThemeColors } from '../../theme';
import { formatDateSep } from '../../utils/helpers';
import { attachmentsApi, commentsApi, timelineApi } from '../../api/services';
import { useWsEvents } from '../../hooks/useWsEvents';
import { useAuthStore } from '../../store/authStore';
import TimelineItemView, { TimelineItemData } from './TimelineItem';
import Avatar from '../Avatar';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReplyTarget {
  commentId: number;
  authorName: string;
  text: string;
}

interface MenuState {
  commentId: number;
  authorName: string;
  text: string;
  isOwn: boolean;
}

interface FileUploadState {
  name: string;
  size: number;
  progress: number;
  status: 'pending' | 'uploading' | 'done' | 'error';
  errorMsg?: string;
}

interface Lightbox {
  url: string;
  name: string;
  attachmentId?: number;
}

// ─── Upload Progress Modal ────────────────────────────────────────────────────

function UploadProgressModal({ files, onClose }: { files: FileUploadState[]; onClose: () => void }) {
  const isDark = useThemeStore((s) => s.isDark);
  const c = isDark ? darkColors : lightColors;
  const styles = useMemo(() => makeUploadStyles(c), [c]);
  const done = files.filter((f) => f.status === 'done').length;
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
          <View style={{ maxHeight: 200, paddingHorizontal: 16, paddingBottom: 16, gap: 12 }}>
            {files.map((f, i) => (
              <View key={i}>
                <View style={styles.row}>
                  <Text style={styles.fname} numberOfLines={1}>{f.name}</Text>
                  <Text style={[styles.status,
                    f.status === 'done'  ? styles.statusDone  :
                    f.status === 'error' ? styles.statusErr   : styles.statusActive,
                  ]}>
                    {f.status === 'done' ? '✓ Done' : f.status === 'error' ? '✗ Failed' :
                     f.status === 'pending' ? 'Waiting…' : `${f.progress}%`}
                  </Text>
                </View>
                {f.status === 'error' && f.errorMsg ? (
                  <Text style={{ fontSize: 11, color: '#ef4444', marginTop: 2 }} numberOfLines={2}>{f.errorMsg}</Text>
                ) : null}
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${f.progress}%` as any },
                    f.status === 'done' ? styles.fillDone : f.status === 'error' ? styles.fillErr : {},
                  ]} />
                </View>
              </View>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function makeUploadStyles(c: ThemeColors) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 },
    sheet: { width: '100%', backgroundColor: c.card, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: c.border2 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: c.surface2 },
    title: { fontSize: 15, fontWeight: '700', color: c.text },
    sub: { fontSize: 12, color: c.textMuted, marginTop: 2 },
    closeBtn: { backgroundColor: c.brand, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8 },
    closeTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },
    row: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
    fname: { flex: 1, fontSize: 13, color: c.text },
    status: { fontSize: 12, marginLeft: 8 },
    statusDone: { color: '#34D399' },
    statusErr: { color: '#EF4444' },
    statusActive: { color: c.brandLight },
    track: { height: 4, backgroundColor: c.surface2, borderRadius: 99, overflow: 'hidden' },
    fill: { height: '100%', backgroundColor: c.brand, borderRadius: 99 },
    fillDone: { backgroundColor: '#34D399' },
    fillErr: { backgroundColor: '#EF4444' },
  });
}

// ─── Image Lightbox ───────────────────────────────────────────────────────────

function ImageLightboxModal({ lightbox, onClose, onDownload }: {
  lightbox: Lightbox; onClose: () => void; onDownload: () => void;
}) {
  const { width, height } = useWindowDimensions();
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={[lb.backdrop, { width, height }]} activeOpacity={1} onPress={onClose}>
        <Image source={{ uri: lightbox.url }} style={lb.img} resizeMode="contain" />
        <View style={lb.toolbar}>
          <TouchableOpacity style={lb.toolBtn} onPress={onDownload}>
            <Feather name="download" size={20} color="#1f2937" />
          </TouchableOpacity>
          <TouchableOpacity style={lb.toolBtn} onPress={() => Linking.openURL(lightbox.url)}>
            <Feather name="external-link" size={20} color="#1f2937" />
          </TouchableOpacity>
          <TouchableOpacity style={lb.toolBtn} onPress={onClose}>
            <Feather name="x" size={20} color="#1f2937" />
          </TouchableOpacity>
        </View>
        <Text style={lb.name} numberOfLines={1}>{lightbox.name}</Text>
      </TouchableOpacity>
    </Modal>
  );
}

const lb = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center' },
  img: { width: '100%', height: '80%' },
  toolbar: { position: 'absolute', top: 52, right: 16, flexDirection: 'row', gap: 10 },
  toolBtn: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center', justifyContent: 'center',
  },
  name: { position: 'absolute', bottom: 40, left: 16, right: 16, textAlign: 'center', fontSize: 13, color: '#94A3B8' },
});

// ─── Date separator ───────────────────────────────────────────────────────────

type FeedRow = { type: 'date'; label: string; key: string } | { type: 'item'; data: TimelineItemData };

function buildFeedRows(items: TimelineItemData[]): FeedRow[] {
  const rows: FeedRow[] = [];
  let lastDate = '';
  for (const item of items) {
    const dateLabel = formatDateSep(item.created_at);
    if (dateLabel !== lastDate) {
      rows.push({ type: 'date', label: dateLabel, key: `date-${item.created_at}` });
      lastDate = dateLabel;
    }
    rows.push({ type: 'item', data: item });
  }
  return rows;
}

// ─── Main TimelineFeed ────────────────────────────────────────────────────────

interface Props {
  productId: number;
  canPost: boolean;
}

export default function TimelineFeed({ productId, canPost }: Props) {
  const isDark = useThemeStore((s) => s.isDark);
  const c = isDark ? darkColors : lightColors;
  const styles = useMemo(() => makeStyles(c), [c]);

  const user = useAuthStore((s) => s.user);
  const userId = user?.id ?? 0;

  // ── State ──
  const [items, setItems]         = useState<TimelineItemData[]>([]);
  const [loading, setLoading]     = useState(true);
  const [message, setMessage]     = useState('');
  const [sending, setSending]     = useState(false);
  const [replyTo, setReplyTo]     = useState<ReplyTarget | null>(null);
  const [editId, setEditId]       = useState<number | null>(null);
  const [editText, setEditText]   = useState('');
  const [menu, setMenu]           = useState<MenuState | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<number | null>(null);
  const [uploadFiles, setUploadFiles]   = useState<FileUploadState[]>([]);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [lightbox, setLightbox]   = useState<Lightbox | null>(null);

  // Mention dropdown
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionQuery, setMentionQuery]               = useState('');

  const flatListRef = useRef<FlatList<FeedRow>>(null);
  const inputRef    = useRef<TextInput>(null);
  const didScrollRef = useRef(false);

  // ── Fetch ──
  const load = useCallback(async () => {
    try {
      const res = await timelineApi.getByProduct(productId);
      setItems(res.data?.items || []);
    } catch {}
    setLoading(false);
  }, [productId]);

  useEffect(() => { load(); }, [load]);

  // Auto-scroll to bottom on initial load
  useEffect(() => {
    if (!loading && items.length > 0 && !didScrollRef.current) {
      didScrollRef.current = true;
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 150);
    }
  }, [loading, items.length]);

  // Scroll to bottom when new item arrives
  const prevItemCount = useRef(items.length);
  useEffect(() => {
    if (items.length > prevItemCount.current) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
    prevItemCount.current = items.length;
  }, [items.length]);

  // WS: reload timeline on relevant events
  useWsEvents({
    onTimelineChanged: load,
    onProductsChanged: load,
  });

  // ── Send comment ──
  const handleSend = async () => {
    const text = message.trim();
    if (!text || sending) return;
    setSending(true);
    let fullMessage = text;
    if (replyTo) {
      const preview = replyTo.text.slice(0, 80);
      fullMessage = `[reply:${replyTo.commentId}:${preview}]\n${text}`;
    }
    try {
      await commentsApi.create(productId, fullMessage);
      setMessage('');
      setReplyTo(null);
      setShowMentionDropdown(false);
      load();
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error || 'Failed to send');
    }
    setSending(false);
  };

  // ── Upload file via comment ──
  const handleUpload = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: true } as any);
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
          // Upload returns the confirmed attachment record
          const res = await attachmentsApi.uploadWithProgress(
            productId, f.uri, f.name, f.size ?? 0,
            f.mimeType ?? 'application/octet-stream',
            (pct) => setUploadFiles((prev) => prev.map((s, idx) => idx === i ? { ...s, progress: pct } : s)),
            'comment',
          );
          const att = res.data;
          // Post a comment with the attachment token
          const commentText = message.trim()
            ? `${message.trim()}\n[attachment:${att.id}:${att.file_name}]`
            : `📎 Uploaded: ${att.file_name}\n[attachment:${att.id}:${att.file_name}]`;
          await commentsApi.create(productId, commentText);
          setMessage('');
          setUploadFiles((prev) => prev.map((s, idx) => idx === i ? { ...s, progress: 100, status: 'done' } : s));
        } catch (uploadErr: any) {
          const msg = uploadErr?.message || uploadErr?.response?.data?.error || 'Unknown error';
          setUploadFiles((prev) => prev.map((s, idx) => idx === i ? { ...s, status: 'error', errorMsg: msg } : s));
        }
      }
      load();
    } catch (err: any) {
      Alert.alert('Upload failed', err?.message || 'Something went wrong');
      setShowUploadModal(false);
    }
  };

  // ── Edit comment ──
  const handleEditSave = async () => {
    if (!editId || !editText.trim()) return;
    try {
      await commentsApi.update(editId, editText.trim());
      setEditId(null);
      setEditText('');
      load();
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error || 'Failed to update');
    }
  };

  // ── Delete comment ──
  const doDelete = async (commentId: number) => {
    try {
      await commentsApi.delete(commentId);
      setMenu(null);
      setConfirmingDelete(null);
      load();
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error || 'Failed to delete');
    }
  };

  // ── Download attachment ──
  const handleDownload = async (attachmentId: number | undefined, fallbackUrl?: string, name?: string) => {
    try {
      if (attachmentId) {
        const res = await attachmentsApi.getDownloadUrl(attachmentId);
        const url = res.data?.url || res.data;
        if (url) Linking.openURL(url);
      } else if (fallbackUrl) {
        Linking.openURL(fallbackUrl);
      }
    } catch {
      Alert.alert('Error', 'Could not get download link');
    }
  };

  // ── Mention input ──
  const handleInputChange = (text: string) => {
    setMessage(text);
    const atIdx = text.lastIndexOf('@');
    if (atIdx >= 0) {
      const after = text.slice(atIdx + 1);
      if (/^[\w\s]{0,20}$/.test(after) && !after.includes('\n')) {
        setMentionQuery(after);
        setShowMentionDropdown(true);
        return;
      }
    }
    setShowMentionDropdown(false);
  };

  // ── Build feed rows with date separators ──
  const feedRows = useMemo(() => buildFeedRows(items), [items]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={c.brand} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {/* In-place edit mode overlay */}
      {editId !== null && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setEditId(null)}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
            <TouchableOpacity style={styles.editBackdrop} activeOpacity={1} onPress={() => setEditId(null)} />
            <View style={styles.editSheet}>
              <Text style={styles.editTitle}>Edit Message</Text>
              <TextInput
                style={styles.editInput}
                value={editText}
                onChangeText={setEditText}
                multiline
                autoFocus
                placeholderTextColor={c.textMuted}
              />
              <View style={styles.editActions}>
                <TouchableOpacity style={styles.editCancel} onPress={() => setEditId(null)}>
                  <Text style={styles.editCancelTxt}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.editSave} onPress={handleEditSave} disabled={!editText.trim()}>
                  <Text style={styles.editSaveTxt}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      )}

      {/* Timeline list */}
      <FlatList
        ref={flatListRef}
        data={feedRows}
        keyExtractor={(row) => row.type === 'date' ? row.key : row.data.id}
        contentContainerStyle={styles.list}
        onScrollToIndexFailed={() => {}}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={{ fontSize: 32 }}>💬</Text>
            <Text style={styles.empty}>No activity yet</Text>
          </View>
        }
        renderItem={({ item: row }) => {
          if (row.type === 'date') {
            return (
              <View style={styles.dateSep}>
                <View style={styles.dateLine} />
                <Text style={styles.dateLabel}>{row.label}</Text>
                <View style={styles.dateLine} />
              </View>
            );
          }
          const item = row.data;
          return (
            <TimelineItemView
              item={item}
              currentUserId={userId}
              onLongPress={
                item.comment_id && canPost
                  ? (it) => {
                      const stripped = it.content.replace(/\n?\[attachment:.+\]/g, '').replace(/\n?\[reply:.+\]/g, '').trim();
                      setMenu({
                        commentId: it.comment_id!,
                        authorName: it.actor.name,
                        text: stripped,
                        isOwn: it.actor.id === userId,
                      });
                    }
                  : undefined
              }
              onImagePress={(url, name) => setLightbox({ url, name })}
              onDownload={handleDownload}
            />
          );
        }}
      />

      {/* Reply bar */}
      {replyTo && (
        <View style={styles.replyBar}>
          <View style={styles.replyContent}>
            <Text style={styles.replyLabel}>↩ Replying to {replyTo.authorName}</Text>
            <Text style={styles.replyText} numberOfLines={1}>{replyTo.text.slice(0, 80)}</Text>
          </View>
          <TouchableOpacity onPress={() => setReplyTo(null)} style={styles.replyClear}>
            <Text style={styles.replyClearTxt}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Mention dropdown */}
      {showMentionDropdown && mentionQuery !== undefined && (
        <View style={[styles.mentionDropdown, { borderColor: c.border2 }]}>
          <Text style={styles.mentionHint}>@{mentionQuery} — type a name to mention</Text>
        </View>
      )}

      {/* Compose bar */}
      {canPost && (
        <View style={styles.inputBar}>
          <TouchableOpacity style={styles.attachBtn} onPress={handleUpload}>
            <Feather name="paperclip" size={20} color={c.textSec} />
          </TouchableOpacity>
          <TextInput
            ref={inputRef}
            style={styles.input}
            value={message}
            onChangeText={handleInputChange}
            placeholder={replyTo ? `Reply to ${replyTo.authorName}…` : 'Write a message… (@name to mention)'}
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

      {/* Upload modal */}
      {showUploadModal && (
        <UploadProgressModal
          files={uploadFiles}
          onClose={() => { setShowUploadModal(false); setUploadFiles([]); }}
        />
      )}

      {/* Lightbox */}
      {lightbox && (
        <ImageLightboxModal
          lightbox={lightbox}
          onClose={() => setLightbox(null)}
          onDownload={async () => {
            if (lightbox.attachmentId) {
              handleDownload(lightbox.attachmentId);
            } else {
              Linking.openURL(lightbox.url);
            }
          }}
        />
      )}

      {/* Context menu */}
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
              <>
                <Text style={styles.menuConfirmTitle}>Delete this message?</Text>
                <Text style={styles.menuConfirmSub}>This cannot be undone.</Text>
                <TouchableOpacity style={[styles.menuItem, styles.menuItemDanger]} onPress={() => doDelete(confirmingDelete)}>
                  <Text style={styles.menuIcon}>🗑️</Text>
                  <Text style={[styles.menuLabel, styles.menuLabelDanger]}>Yes, Delete</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.menuCancel} onPress={() => setConfirmingDelete(null)}>
                  <Text style={styles.menuCancelText}>Cancel</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => {
                    if (menu) setReplyTo({ commentId: menu.commentId, authorName: menu.authorName, text: menu.text });
                    setMenu(null);
                  }}
                >
                  <Text style={styles.menuIcon}>↩</Text>
                  <Text style={styles.menuLabel}>Reply</Text>
                </TouchableOpacity>
                {menu?.isOwn && (
                  <TouchableOpacity
                    style={styles.menuItem}
                    onPress={() => {
                      if (menu) { setEditId(menu.commentId); setEditText(menu.text); }
                      setMenu(null);
                    }}
                  >
                    <Text style={styles.menuIcon}>✏️</Text>
                    <Text style={styles.menuLabel}>Edit</Text>
                  </TouchableOpacity>
                )}
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
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
    empty: { fontSize: 14, color: c.textMuted },
    list: { paddingTop: 12, paddingBottom: 20 },

    dateSep: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginVertical: 12, gap: 10 },
    dateLine: { flex: 1, height: 1, backgroundColor: c.surface2 },
    dateLabel: { fontSize: 11, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },

    replyBar: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: c.surface2, paddingHorizontal: 16, paddingVertical: 8,
      borderTopWidth: 1, borderTopColor: c.border2,
    },
    replyContent: { flex: 1 },
    replyLabel: { fontSize: 11, fontWeight: '700', color: c.brandLight },
    replyText: { fontSize: 11, color: c.textSec, marginTop: 1 },
    replyClear: { padding: 4 },
    replyClearTxt: { color: c.textMuted, fontSize: 16 },

    mentionDropdown: {
      backgroundColor: c.card, borderWidth: 1,
      borderRadius: 10, marginHorizontal: 12, marginBottom: 4,
      padding: 12,
    },
    mentionHint: { fontSize: 12, color: c.textMuted, fontStyle: 'italic' },

    inputBar: {
      flexDirection: 'row', alignItems: 'flex-end', gap: 8,
      paddingHorizontal: 12, paddingVertical: 8,
      borderTopWidth: 1, borderTopColor: c.surface2,
      backgroundColor: c.bg,
    },
    attachBtn: { padding: 8 },
    input: {
      flex: 1, backgroundColor: c.surface, borderRadius: 20, borderWidth: 1, borderColor: c.border2,
      color: c.text, paddingHorizontal: 14, paddingVertical: 9, fontSize: 14, maxHeight: 120,
    },
    sendBtn: {
      width: 38, height: 38, borderRadius: 19, backgroundColor: c.brand,
      alignItems: 'center', justifyContent: 'center',
    },
    sendBtnDisabled: { opacity: 0.4 },
    sendIcon: { fontSize: 16, color: '#fff' },

    // Edit modal
    editBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
    editSheet: {
      backgroundColor: c.card, borderTopLeftRadius: 20, borderTopRightRadius: 20,
      padding: 20, gap: 12, borderWidth: 1, borderColor: c.border2,
    },
    editTitle: { fontSize: 15, fontWeight: '700', color: c.text },
    editInput: {
      backgroundColor: c.surface, borderRadius: 12, borderWidth: 1,
      borderColor: c.border2, color: c.text, padding: 12, fontSize: 14,
      minHeight: 80, textAlignVertical: 'top',
    },
    editActions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
    editCancel: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: c.border2 },
    editCancelTxt: { color: c.textSec, fontSize: 14 },
    editSave: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, backgroundColor: c.brand },
    editSaveTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },

    // Context menu
    menuBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    menuSheet: {
      backgroundColor: c.card, borderTopLeftRadius: 20, borderTopRightRadius: 20,
      padding: 20, paddingTop: 12, gap: 4, borderWidth: 1, borderColor: c.border2,
    },
    menuHandle: { width: 36, height: 4, borderRadius: 99, backgroundColor: c.surface2, alignSelf: 'center', marginBottom: 12 },
    menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12 },
    menuItemDanger: { backgroundColor: 'rgba(239,68,68,0.08)' },
    menuIcon: { fontSize: 18 },
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
