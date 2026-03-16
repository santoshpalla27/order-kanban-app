import React, { useEffect, useState, useRef, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, FlatList, ActivityIndicator, Alert, KeyboardAvoidingView,
  Platform, RefreshControl, Linking, Modal, Pressable, Image,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import { productApi } from '../api/services'
import { useAuthStore } from '../store/authStore'
import { useBoardStore } from '../store/boardStore'
import { useProductDetailStore } from '../store/productDetailStore'
import type { Product, Comment, Attachment, RootStackParams } from '../types'
import Avatar from '../components/Avatar'
import StatusChip from '../components/StatusChip'

type NavProp    = NativeStackNavigationProp<RootStackParams>
type RouteProp_ = RouteProp<RootStackParams, 'ProductDetail'>

// ─── token renderer ───────────────────────────────────────────────────────────
const TOKEN_RE = /(@\[[^\]]+\]|@\{id:[^}]+\}|\[attachment:\d+:[^\]]+\])/g

function renderComment(text: string, currentUser?: string): React.ReactNode[] {
  const parts = text.split(TOKEN_RE)
  return parts.map((part, i) => {
    const userMatch   = part.match(/^@\[([^\]]+)\]$/)
    const orderMatch  = part.match(/^@\{id:([^}]+)\}$/)
    const attachMatch = part.match(/^\[attachment:(\d+):([^\]]+)\]$/)
    if (userMatch) {
      const name = userMatch[1]
      const isMe = currentUser && name === currentUser
      return <Text key={i} style={[styles.mentionUser, isMe && styles.mentionUserMe]}>@{name}</Text>
    }
    if (orderMatch) return <Text key={i} style={styles.mentionOrder}>@{orderMatch[1]}</Text>
    if (attachMatch) return (
      <Text key={i} style={styles.mentionAttach}>
        <Ionicons name="attach-outline" size={12} /> {attachMatch[2]}
      </Text>
    )
    return <Text key={i}>{part}</Text>
  })
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}
function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
function fileIcon(type: string): React.ComponentProps<typeof Ionicons>['name'] {
  if (type.startsWith('image/')) return 'image-outline'
  if (type === 'application/pdf') return 'document-text-outline'
  return 'document-outline'
}

// ─── Attachment Comment Modal ─────────────────────────────────────────────────
function AttachmentCommentModal({
  attachment, productId, onClose, onPosted,
}: {
  attachment: Attachment
  productId: number
  onClose: () => void
  onPosted: (c: Comment) => void
}) {
  const [text, setText] = useState('')
  const [posting, setPosting] = useState(false)
  const insets = useSafeAreaInsets()

  const submit = async () => {
    const msg = text.trim()
    if (!msg || posting) return
    setPosting(true)
    try {
      const comment = await productApi.postComment(
        productId,
        `${msg}\n[attachment:${attachment.id}:${attachment.file_name}]`,
      )
      onPosted(comment)
      onClose()
    } catch {
      Alert.alert('Error', 'Failed to post comment.')
    } finally {
      setPosting(false)
    }
  }

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose} />
      <KeyboardAvoidingView
        style={[styles.modalSheet, { paddingBottom: insets.bottom + 12 }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modalHandle} />
        <Text style={styles.modalTitle}>Comment on Attachment</Text>

        {/* Attachment preview */}
        <View style={styles.attachPreview}>
          <View style={styles.attachPreviewIcon}>
            <Ionicons name={fileIcon(attachment.file_type)} size={20} color="#1A56D6" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.attachPreviewName} numberOfLines={1}>{attachment.file_name}</Text>
            <Text style={styles.attachPreviewMeta}>{formatBytes(attachment.file_size)}</Text>
          </View>
        </View>

        <TextInput
          style={styles.attachCommentInput}
          placeholder="Write your comment about this attachment…"
          placeholderTextColor="#CBD5E1"
          value={text}
          onChangeText={setText}
          multiline
          autoFocus
          maxLength={2000}
        />
        <View style={styles.modalActions}>
          <TouchableOpacity style={styles.modalCancelBtn} onPress={onClose}>
            <Text style={styles.modalCancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modalSubmitBtn, (!text.trim() || posting) && styles.modalSubmitBtnDisabled]}
            onPress={submit}
            disabled={!text.trim() || posting}
          >
            {posting
              ? <ActivityIndicator size="small" color="#FFFFFF" />
              : <><Ionicons name="send" size={14} color="#FFFFFF" /><Text style={styles.modalSubmitText}>Post Comment</Text></>
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

// ─── Main screen ──────────────────────────────────────────────────────────────
type Tab = 'info' | 'comments' | 'attachments'

export default function ProductDetailScreen() {
  const insets = useSafeAreaInsets()
  const nav    = useNavigation<NavProp>()
  const route  = useRoute<RouteProp_>()
  const { id } = route.params

  const currentUser = useAuthStore(s => s.user)
  const { removeProductLocally } = useBoardStore()
  const { setActiveId, commentSignal, attachSignal } = useProductDetailStore()

  const [product,     setProduct]     = useState<Product | null>(null)
  const [comments,    setComments]    = useState<Comment[]>([])
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [loading,     setLoading]     = useState(true)
  const [refreshing,  setRefreshing]  = useState(false)
  const [tab,         setTab]         = useState<Tab>('info')
  const [commentText, setCommentText] = useState('')
  const [sending,     setSending]     = useState(false)
  const [deleting,    setDeleting]    = useState(false)

  // Upload state
  const [uploading,       setUploading]       = useState(false)
  const [uploadProgress,  setUploadProgress]  = useState(0)

  // Attachment comment modal
  const [commentingAttachment, setCommentingAttachment] = useState<Attachment | null>(null)

  const flatRef = useRef<FlatList>(null)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const [p, c, a] = await Promise.all([
        productApi.get(id),
        productApi.getComments(id),
        productApi.getAttachments(id),
      ])
      setProduct(p)
      setComments(c)
      setAttachments(a)
    } catch {
      Alert.alert('Error', 'Failed to load order details.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [id])

  useEffect(() => {
    setActiveId(id)
    return () => setActiveId(null)
  }, [id, setActiveId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (commentSignal === 0) return
    productApi.getComments(id).then(setComments).catch(() => {})
  }, [commentSignal])

  useEffect(() => {
    if (attachSignal === 0) return
    productApi.getAttachments(id).then(setAttachments).catch(() => {})
  }, [attachSignal])

  const onRefresh = () => { setRefreshing(true); load(true) }

  // ── Upload ────────────────────────────────────────────────────────────────
  const doUpload = async (uri: string, name: string, mimeType: string, size: number) => {
    setUploading(true)
    setUploadProgress(0)
    try {
      // 1. Get presigned URL
      const { upload_url, s3_key } = await productApi.presignUpload(id, name)

      // 2. Read file and PUT to S3
      const fileBlob = await fetch(uri).then(r => r.blob())
      setUploadProgress(30)
      await fetch(upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': mimeType },
        body: fileBlob,
      })
      setUploadProgress(80)

      // 3. Confirm upload
      await productApi.confirmUpload(id, {
        s3_key,
        file_name: name,
        file_type: mimeType,
        file_size: size,
      })
      setUploadProgress(100)

      // 4. Re-fetch attachments so we get uploader info + view_url for images
      const updated = await productApi.getAttachments(id)
      setAttachments(updated)
    } catch (e: any) {
      Alert.alert('Upload Failed', e?.message ?? 'Could not upload file.')
    } finally {
      setTimeout(() => { setUploading(false); setUploadProgress(0) }, 500)
    }
  }

  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow photo access to upload images.'); return }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    })
    if (result.canceled || !result.assets?.length) return
    const asset = result.assets[0]
    const name  = asset.fileName ?? `photo_${Date.now()}.jpg`
    const mime  = asset.mimeType ?? 'image/jpeg'
    const size  = asset.fileSize ?? 0
    await doUpload(asset.uri, name, mime, size)
  }

  const pickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true })
    if (result.canceled || !result.assets?.length) return
    const asset = result.assets[0]
    await doUpload(asset.uri, asset.name, asset.mimeType ?? 'application/octet-stream', asset.size ?? 0)
  }

  const showUploadOptions = () => {
    Alert.alert('Upload Attachment', 'Choose source', [
      { text: 'Photo Library', onPress: pickPhoto },
      { text: 'Browse Files',  onPress: pickFile  },
      { text: 'Cancel', style: 'cancel' },
    ])
  }

  // ── Delete attachment ──────────────────────────────────────────────────────
  const deleteAttachment = (a: Attachment) => {
    Alert.alert('Delete Attachment', `Delete "${a.file_name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await productApi.deleteAttachment(a.id)
            setAttachments(prev => prev.filter(x => x.id !== a.id))
          } catch {
            Alert.alert('Error', 'Failed to delete attachment.')
          }
        },
      },
    ])
  }

  // ── View / download ────────────────────────────────────────────────────────
  const viewAttachment = async (a: Attachment) => {
    try {
      const url = await productApi.getDownloadUrl(a.id)
      await Linking.openURL(url)
    } catch {
      Alert.alert('Error', 'Could not open attachment.')
    }
  }

  // ── Comments ───────────────────────────────────────────────────────────────
  const sendComment = async () => {
    const msg = commentText.trim()
    if (!msg || sending) return
    setSending(true)
    try {
      const c = await productApi.postComment(id, msg)
      setComments(prev => [...prev, c])
      setCommentText('')
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100)
    } catch {
      Alert.alert('Error', 'Failed to send comment.')
    } finally {
      setSending(false)
    }
  }

  const deleteComment = (cid: number) => {
    Alert.alert('Delete Comment', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await productApi.deleteComment(cid)
            setComments(prev => prev.filter(c => c.id !== cid))
          } catch { Alert.alert('Error', 'Failed to delete comment.') }
        },
      },
    ])
  }

  const deleteProduct = () => {
    Alert.alert('Delete Order', `Delete ${product?.product_id}? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          setDeleting(true)
          try {
            await productApi.delete(id)
            removeProductLocally(id)
            nav.goBack()
          } catch {
            Alert.alert('Error', 'Failed to delete order.')
            setDeleting(false)
          }
        },
      },
    ])
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => nav.goBack()}>
            <Ionicons name="arrow-back" size={22} color="#0F172A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Order Detail</Text>
          <View style={{ width: 22 }} />
        </View>
        <View style={styles.centered}><ActivityIndicator size="large" color="#1A56D6" /></View>
      </View>
    )
  }

  if (!product) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => nav.goBack()}>
            <Ionicons name="arrow-back" size={22} color="#0F172A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Order Detail</Text>
          <View style={{ width: 22 }} />
        </View>
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={48} color="#CBD5E1" />
          <Text style={styles.emptyText}>Order not found</Text>
        </View>
      </View>
    )
  }

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: 'info',        label: 'Info' },
    { key: 'comments',    label: 'Comments',    count: comments.length },
    { key: 'attachments', label: 'Attachments', count: attachments.length },
  ]

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => nav.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{product.product_id}</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => nav.navigate('CreateEditProduct', { id })}>
            <Ionicons name="create-outline" size={20} color="#1A56D6" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={deleteProduct} disabled={deleting}>
            {deleting
              ? <ActivityIndicator size="small" color="#EF4444" />
              : <Ionicons name="trash-outline" size={20} color="#EF4444" />
            }
          </TouchableOpacity>
        </View>
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {TABS.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tabItem, tab === t.key && styles.tabItemActive]}
            onPress={() => setTab(t.key)}
          >
            <Text style={[styles.tabLabel, tab === t.key && styles.tabLabelActive]}>{t.label}</Text>
            {t.count != null && t.count > 0 && (
              <View style={[styles.tabBadge, tab === t.key && styles.tabBadgeActive]}>
                <Text style={[styles.tabBadgeText, tab === t.key && styles.tabBadgeTextActive]}>{t.count}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Info Tab ─────────────────────────────────────────────────────────── */}
      {tab === 'info' && (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1A56D6" />}
        >
          <View style={styles.card}>
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>Status</Text>
              <StatusChip status={product.status} />
            </View>
            <View style={styles.divider} />
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>Order ID</Text>
              <Text style={styles.cardValue}>{product.product_id}</Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Customer</Text>
            <View style={styles.cardRow}>
              <View style={styles.cardLabelRow}>
                <Ionicons name="person-outline" size={14} color="#94A3B8" />
                <Text style={styles.cardLabel}>Name</Text>
              </View>
              <Text style={styles.cardValue}>{product.customer_name}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.cardRow}>
              <View style={styles.cardLabelRow}>
                <Ionicons name="call-outline" size={14} color="#94A3B8" />
                <Text style={styles.cardLabel}>Phone</Text>
              </View>
              <Text style={styles.cardValue}>{product.customer_phone}</Text>
            </View>
          </View>

          {!!product.description && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Description</Text>
              <Text style={styles.description}>{product.description}</Text>
            </View>
          )}

          <View style={styles.card}>
            {product.creator && (
              <>
                <View style={styles.cardRow}>
                  <Text style={styles.cardLabel}>Created by</Text>
                  <View style={styles.creatorRow}>
                    <Avatar name={product.creator.name} size={22} />
                    <Text style={styles.cardValue}>{product.creator.name}</Text>
                  </View>
                </View>
                <View style={styles.divider} />
              </>
            )}
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>Created</Text>
              <Text style={styles.cardValue}>{formatDate(product.created_at)}</Text>
            </View>
            {product.updated_at && (
              <>
                <View style={styles.divider} />
                <View style={styles.cardRow}>
                  <Text style={styles.cardLabel}>Updated</Text>
                  <Text style={styles.cardValue}>{formatDate(product.updated_at)}</Text>
                </View>
              </>
            )}
          </View>
        </ScrollView>
      )}

      {/* ── Comments Tab ─────────────────────────────────────────────────────── */}
      {tab === 'comments' && (
        <>
          <FlatList
            ref={flatRef}
            data={comments}
            keyExtractor={c => String(c.id)}
            contentContainerStyle={[styles.scrollContent, comments.length === 0 && styles.emptyList]}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1A56D6" />}
            ListEmptyComponent={
              <View style={styles.centered}>
                <Ionicons name="chatbubble-outline" size={40} color="#E2E8F0" />
                <Text style={styles.emptyText}>No comments yet</Text>
              </View>
            }
            renderItem={({ item: c }) => {
              const isOwn = currentUser?.id === c.user_id
              return (
                <View style={styles.commentCard}>
                  <View style={styles.commentHeader}>
                    <View style={styles.commentAuthorRow}>
                      <Avatar name={c.user?.name ?? '?'} size={28} />
                      <View>
                        <Text style={styles.commentAuthor}>{c.user?.name ?? 'User'}</Text>
                        <Text style={styles.commentTime}>{formatDateTime(c.created_at)}</Text>
                      </View>
                    </View>
                    {isOwn && (
                      <TouchableOpacity onPress={() => deleteComment(c.id)}>
                        <Ionicons name="trash-outline" size={15} color="#CBD5E1" />
                      </TouchableOpacity>
                    )}
                  </View>
                  <Text style={styles.commentBody}>
                    {renderComment(c.message, currentUser?.name)}
                  </Text>
                </View>
              )
            }}
          />
          <View style={[styles.commentInputBar, { paddingBottom: insets.bottom + 8 }]}>
            <TextInput
              style={styles.commentInput}
              placeholder="Add a comment…"
              placeholderTextColor="#CBD5E1"
              value={commentText}
              onChangeText={setCommentText}
              multiline
              maxLength={2000}
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!commentText.trim() || sending) && styles.sendBtnDisabled]}
              onPress={sendComment}
              disabled={!commentText.trim() || sending}
            >
              {sending
                ? <ActivityIndicator size="small" color="#FFFFFF" />
                : <Ionicons name="send" size={16} color="#FFFFFF" />
              }
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* ── Attachments Tab ───────────────────────────────────────────────────── */}
      {tab === 'attachments' && (
        <>
          {/* Upload progress bar */}
          {uploading && (
            <View style={styles.uploadProgressBar}>
              <View style={[styles.uploadProgressFill, { width: `${uploadProgress}%` }]} />
              <Text style={styles.uploadProgressText}>
                {uploadProgress < 100 ? `Uploading… ${uploadProgress}%` : 'Processing…'}
              </Text>
            </View>
          )}

          <FlatList
            data={attachments}
            keyExtractor={a => String(a.id)}
            contentContainerStyle={[styles.scrollContent, attachments.length === 0 && styles.emptyList]}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1A56D6" />}
            ListHeaderComponent={
              <TouchableOpacity
                style={[styles.uploadBtn, uploading && styles.uploadBtnDisabled]}
                onPress={showUploadOptions}
                disabled={uploading}
              >
                {uploading
                  ? <ActivityIndicator size="small" color="#1A56D6" />
                  : <Ionicons name="cloud-upload-outline" size={18} color="#1A56D6" />
                }
                <Text style={styles.uploadBtnText}>{uploading ? 'Uploading…' : 'Upload File'}</Text>
              </TouchableOpacity>
            }
            ListEmptyComponent={
              <View style={styles.centeredSm}>
                <Ionicons name="attach-outline" size={40} color="#E2E8F0" />
                <Text style={styles.emptyText}>No attachments yet</Text>
                <Text style={styles.emptySubText}>Tap "Upload File" to add one</Text>
              </View>
            }
            renderItem={({ item: a }) => (
              <View style={styles.attachCard}>
                {a.view_url ? (
                  <TouchableOpacity onPress={() => viewAttachment(a)}>
                    <Image source={{ uri: a.view_url }} style={styles.attachThumb} />
                  </TouchableOpacity>
                ) : (
                  <View style={styles.attachIcon}>
                    <Ionicons name={fileIcon(a.file_type)} size={22} color="#1A56D6" />
                  </View>
                )}
                <View style={styles.attachInfo}>
                  <Text style={styles.attachName} numberOfLines={1}>{a.file_name}</Text>
                  <Text style={styles.attachMeta}>
                    {formatBytes(a.file_size)}
                    {a.uploader ? `  ·  ${a.uploader.name}` : ''}
                    {`  ·  ${formatDate(a.uploaded_at)}`}
                  </Text>
                </View>
                {/* Actions */}
                <View style={styles.attachActions}>
                  <TouchableOpacity style={styles.attachActionBtn} onPress={() => viewAttachment(a)}>
                    <Ionicons name="open-outline" size={18} color="#64748B" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.attachActionBtn}
                    onPress={() => { setCommentingAttachment(a); setTab('attachments') }}
                  >
                    <Ionicons name="chatbubble-outline" size={18} color="#1A56D6" />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.attachActionBtn} onPress={() => deleteAttachment(a)}>
                    <Ionicons name="trash-outline" size={18} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          />
        </>
      )}

      {/* Attachment comment modal */}
      {commentingAttachment && (
        <AttachmentCommentModal
          attachment={commentingAttachment}
          productId={id}
          onClose={() => setCommentingAttachment(null)}
          onPosted={c => {
            setComments(prev => [...prev, c])
            setCommentingAttachment(null)
            setTab('comments')
          }}
        />
      )}
    </KeyboardAvoidingView>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#F8FAFC' },
  centered:{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  centeredSm: { alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 40 },
  emptyText:    { fontSize: 14, color: '#94A3B8', fontWeight: '500' },
  emptySubText: { fontSize: 12, color: '#CBD5E1' },
  emptyList: { flex: 1 },

  header: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
    gap: 8,
  },
  headerTitle:   { flex: 1, fontSize: 17, fontWeight: '800', color: '#0F172A' },
  headerActions: { flexDirection: 'row', gap: 4 },
  iconBtn:       { padding: 6 },

  tabBar: {
    flexDirection: 'row', backgroundColor: '#FFFFFF',
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  tabItem: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, gap: 5,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabItemActive:      { borderBottomColor: '#1A56D6' },
  tabLabel:           { fontSize: 13, fontWeight: '600', color: '#94A3B8' },
  tabLabelActive:     { color: '#1A56D6' },
  tabBadge:           { backgroundColor: '#F1F5F9', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1 },
  tabBadgeActive:     { backgroundColor: '#EFF6FF' },
  tabBadgeText:       { fontSize: 10, fontWeight: '700', color: '#94A3B8' },
  tabBadgeTextActive: { color: '#1A56D6' },

  scrollContent: { padding: 14, gap: 12 },

  card: {
    backgroundColor: '#FFFFFF', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 4,
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: '#94A3B8',
    textTransform: 'uppercase', letterSpacing: 0.6,
    marginTop: 10, marginBottom: 6,
  },
  cardRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingVertical: 11,
  },
  cardLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cardLabel:    { fontSize: 13, color: '#64748B', fontWeight: '500' },
  cardValue:    { fontSize: 13, color: '#0F172A', fontWeight: '600', maxWidth: '60%', textAlign: 'right' },
  creatorRow:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  divider:      { height: 1, backgroundColor: '#F8FAFC' },
  description:  { fontSize: 14, color: '#334155', lineHeight: 21, paddingBottom: 12 },

  // Comments
  commentCard: {
    backgroundColor: '#FFFFFF', borderRadius: 12, padding: 12,
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
  },
  commentHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  commentAuthorRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  commentAuthor:    { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  commentTime:      { fontSize: 11, color: '#94A3B8', marginTop: 1 },
  commentBody:      { fontSize: 14, color: '#334155', lineHeight: 20 },
  mentionUser:      { color: '#1A56D6', fontWeight: '600' },
  mentionUserMe:    { color: '#7C3AED', fontWeight: '600' },
  mentionOrder:     { color: '#D97706', fontWeight: '600' },
  mentionAttach:    { color: '#0891B2', fontWeight: '600' },

  commentInputBar: {
    flexDirection: 'row', alignItems: 'flex-end',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1, borderTopColor: '#F1F5F9',
    paddingHorizontal: 12, paddingTop: 10, gap: 8,
  },
  commentInput: {
    flex: 1, minHeight: 38, maxHeight: 100,
    backgroundColor: '#F8FAFC',
    borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0',
    paddingHorizontal: 12, paddingVertical: 8,
    fontSize: 14, color: '#0F172A',
  },
  sendBtn:         { width: 38, height: 38, borderRadius: 10, backgroundColor: '#1A56D6', alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { backgroundColor: '#93C5FD' },

  // Attachments
  uploadBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#EFF6FF',
    borderRadius: 12, borderWidth: 1, borderColor: '#BFDBFE',
    paddingVertical: 12, marginBottom: 4,
  },
  uploadBtnDisabled: { opacity: 0.6 },
  uploadBtnText: { fontSize: 14, fontWeight: '600', color: '#1A56D6' },

  uploadProgressBar: {
    backgroundColor: '#EFF6FF',
    height: 36,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  uploadProgressFill: {
    position: 'absolute', left: 0, top: 0, bottom: 0,
    backgroundColor: '#BFDBFE',
  },
  uploadProgressText: {
    fontSize: 12, fontWeight: '600', color: '#1A56D6',
    textAlign: 'center', zIndex: 1,
  },

  attachCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12, padding: 12, gap: 10,
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
  },
  attachIcon: {
    width: 42, height: 42, borderRadius: 10,
    backgroundColor: '#EFF6FF',
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  attachThumb: {
    width: 52, height: 52, borderRadius: 8,
    backgroundColor: '#F1F5F9',
    flexShrink: 0,
  },
  attachInfo:    { flex: 1, minWidth: 0 },
  attachName:    { fontSize: 13, fontWeight: '600', color: '#0F172A', marginBottom: 3 },
  attachMeta:    { fontSize: 11, color: '#94A3B8' },
  attachActions: { flexDirection: 'row', gap: 2 },
  attachActionBtn: { padding: 6 },

  // Attachment comment modal
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15, shadowRadius: 12, elevation: 20,
  },
  modalHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: '#E2E8F0',
    alignSelf: 'center', marginBottom: 16,
  },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A', marginBottom: 14 },

  attachPreview: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#F8FAFC', borderRadius: 10,
    padding: 10, marginBottom: 12,
    borderWidth: 1, borderColor: '#E2E8F0',
  },
  attachPreviewIcon: {
    width: 36, height: 36, borderRadius: 8,
    backgroundColor: '#EFF6FF',
    alignItems: 'center', justifyContent: 'center',
  },
  attachPreviewName: { fontSize: 13, fontWeight: '600', color: '#0F172A' },
  attachPreviewMeta: { fontSize: 11, color: '#94A3B8', marginTop: 1 },

  attachCommentInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0',
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: '#0F172A',
    minHeight: 90, maxHeight: 160,
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  modalActions: { flexDirection: 'row', gap: 10 },
  modalCancelBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    borderWidth: 1, borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  modalCancelText: { fontSize: 14, fontWeight: '600', color: '#64748B' },
  modalSubmitBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: 10,
    backgroundColor: '#1A56D6',
  },
  modalSubmitBtnDisabled: { backgroundColor: '#93C5FD' },
  modalSubmitText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
})
