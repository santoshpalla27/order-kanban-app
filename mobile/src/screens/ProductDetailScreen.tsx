import React, { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'

import StatusChip from '../components/StatusChip'
import Avatar from '../components/Avatar'
import { productApi } from '../api/services'
import { useAuthStore } from '../store/authStore'
import { useBoardStore } from '../store/boardStore'
import { formatDate, timeAgo, statusLabel, STATUS_HDR, ALL_STATUSES } from '../utils/helpers'
import type { Product, Comment, Attachment, RootStackParams } from '../types'

type Nav   = NativeStackNavigationProp<RootStackParams>
type Route = RouteProp<RootStackParams, 'ProductDetail'>

export default function ProductDetailScreen() {
  const insets   = useSafeAreaInsets()
  const nav      = useNavigation<Nav>()
  const route    = useRoute<Route>()
  const { id }   = route.params
  const { role, user } = useAuthStore()
  const { updateProductLocally, removeProductLocally } = useBoardStore()

  const [product,  setProduct]  = useState<Product | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [comment,  setComment]  = useState('')
  const [posting,  setPosting]  = useState(false)
  const [showStatusPicker, setShowStatusPicker] = useState(false)

  const canEdit   = ['admin','manager','organiser'].includes(role)
  const canDelete = ['admin','manager'].includes(role)

  const load = async () => {
    setLoading(true)
    try {
      const p = await productApi.get(id)
      setProduct(p)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [id])

  const handleStatusChange = async (status: string) => {
    if (!product) return
    setShowStatusPicker(false)
    try {
      const updated = await productApi.updateStatus(id, status)
      setProduct(updated)
      updateProductLocally(updated)
    } catch { Alert.alert('Error', 'Could not update status') }
  }

  const handlePostComment = async () => {
    if (!comment.trim() || posting) return
    setPosting(true)
    try {
      const c = await productApi.postComment(id, comment.trim())
      setProduct(p => p ? { ...p, comments: [c, ...(p.comments ?? [])] } : p)
      setComment('')
    } finally { setPosting(false) }
  }

  const handleDelete = () => {
    Alert.alert('Delete Order', 'Move this order to trash?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await productApi.delete(id)
          removeProductLocally(id)
          nav.goBack()
        },
      },
    ])
  }

  if (loading) return <ActivityIndicator color="#1A73E8" style={{ flex: 1, marginTop: 60 }} />
  if (!product) return null

  const hdrColor = STATUS_HDR[product.status] ?? '#1A73E8'

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
    >
      {/* Header bar */}
      <View style={[styles.topBar, { borderBottomColor: hdrColor + '40' }]}>
        <TouchableOpacity onPress={() => nav.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#212121" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle} numberOfLines={1}>{product.product_id}</Text>
        <View style={styles.topActions}>
          {canEdit && (
            <TouchableOpacity
              onPress={() => nav.navigate('CreateEditProduct', { id })}
              style={styles.actionBtn}
            >
              <Ionicons name="create-outline" size={20} color="#1A73E8" />
            </TouchableOpacity>
          )}
          {canDelete && (
            <TouchableOpacity onPress={handleDelete} style={styles.actionBtn}>
              <Ionicons name="trash-outline" size={20} color="#E53935" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Status banner */}
        <View style={[styles.statusBanner, { backgroundColor: hdrColor }]}>
          <Text style={styles.statusBannerText}>
            {statusLabel(product.status)}
          </Text>
          {canEdit && (
            <TouchableOpacity
              style={styles.changeStatusBtn}
              onPress={() => setShowStatusPicker(!showStatusPicker)}
            >
              <Text style={styles.changeStatusText}>Change</Text>
              <Ionicons name="chevron-down" size={12} color="rgba(255,255,255,0.9)" />
            </TouchableOpacity>
          )}
        </View>

        {/* Status picker */}
        {showStatusPicker && (
          <View style={styles.statusPicker}>
            {ALL_STATUSES.filter(s => s !== product.status).map(s => (
              <TouchableOpacity
                key={s}
                style={styles.statusOption}
                onPress={() => handleStatusChange(s)}
              >
                <View style={[styles.statusDot, { backgroundColor: STATUS_HDR[s] }]} />
                <Text style={styles.statusOptionText}>{statusLabel(s)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Order details card */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Order Details</Text>

          <DetailRow icon="person-outline"      label="Customer"    value={product.customer_name} />
          <DetailRow icon="call-outline"         label="Phone"       value={product.customer_phone} />
          <DetailRow icon="document-text-outline" label="Description" value={product.description || '—'} />
          <DetailRow icon="calendar-outline"    label="Created"     value={formatDate(product.created_at)} />
          {product.creator && (
            <DetailRow icon="person-circle-outline" label="Created by" value={product.creator.name} />
          )}
        </View>

        {/* Attachments */}
        {((product.attachments ?? []).length) > 0 && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>
              Attachments ({((product.attachments ?? []).length)})
            </Text>
            {(product.attachments ?? []).map(a => (
              <AttachmentItem key={a.id} attachment={a} />
            ))}
          </View>
        )}

        {/* Comments */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>
            Comments ({((product.comments ?? []).length)})
          </Text>

          {/* Comment input */}
          <View style={styles.commentInputRow}>
            {user && <Avatar name={user.name} size={32} />}
            <TextInput
              style={styles.commentInput}
              value={comment}
              onChangeText={setComment}
              placeholder="Add a comment…"
              placeholderTextColor="#BDBDBD"
              multiline
              maxLength={500}
            />
            <TouchableOpacity
              style={[styles.postBtn, (!comment.trim() || posting) && styles.postBtnDisabled]}
              onPress={handlePostComment}
              disabled={!comment.trim() || posting}
            >
              {posting
                ? <ActivityIndicator color="#FFF" size="small" />
                : <Ionicons name="send" size={16} color="#FFF" />
              }
            </TouchableOpacity>
          </View>

          {/* Comment list */}
          {((product.comments ?? []).length) === 0 ? (
            <Text style={styles.noComments}>No comments yet</Text>
          ) : (
            (product.comments ?? []).map(c => <CommentItem key={c.id} comment={c} />)
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

function DetailRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={detailStyles.row}>
      <Ionicons name={icon as any} size={16} color="#9E9E9E" style={{ width: 22 }} />
      <Text style={detailStyles.label}>{label}</Text>
      <Text style={detailStyles.value}>{value}</Text>
    </View>
  )
}

function AttachmentItem({ attachment }: { attachment: Attachment }) {
  return (
    <View style={detailStyles.attachment}>
      <Ionicons name="document-outline" size={20} color="#FB8C00" />
      <View style={{ flex: 1 }}>
        <Text style={detailStyles.attachName} numberOfLines={1}>{attachment.file_name}</Text>
        <Text style={detailStyles.attachMeta}>
          {attachment.file_type} · {(attachment.file_size / 1024).toFixed(1)} KB
        </Text>
      </View>
      <Ionicons name="download-outline" size={18} color="#1A73E8" />
    </View>
  )
}

function CommentItem({ comment }: { comment: Comment }) {
  return (
    <View style={detailStyles.comment}>
      <Avatar name={comment.user?.name ?? '?'} size={32} />
      <View style={{ flex: 1 }}>
        <View style={detailStyles.commentTop}>
          <Text style={detailStyles.commentName}>{comment.user?.name}</Text>
          <Text style={detailStyles.commentTime}>{timeAgo(comment.created_at)}</Text>
        </View>
        <Text style={detailStyles.commentText}>{comment.message}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#F8F9FA' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 2,
  },
  backBtn: { marginRight: 10 },
  topBarTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: '#212121' },
  topActions: { flexDirection: 'row', gap: 4 },
  actionBtn: { padding: 6 },

  content: { padding: 12 },

  statusBanner: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  statusBannerText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
  changeStatusBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 3,
  },
  changeStatusText: { color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '600' },

  statusPicker: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    marginBottom: 10,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    overflow: 'hidden',
  },
  statusOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusOptionText: { fontSize: 14, color: '#424242', fontWeight: '500' },

  card: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#212121', marginBottom: 12 },

  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginBottom: 16,
  },
  commentInput: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 14,
    color: '#212121',
    maxHeight: 80,
  },
  postBtn: {
    backgroundColor: '#1A73E8',
    borderRadius: 18,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postBtnDisabled: { backgroundColor: '#BDBDBD' },
  noComments: { color: '#BDBDBD', fontSize: 13, textAlign: 'center', paddingVertical: 8 },
})

const detailStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
    gap: 8,
  },
  label: { fontSize: 13, color: '#9E9E9E', width: 80, fontWeight: '500' },
  value: { flex: 1, fontSize: 13, color: '#212121', fontWeight: '500' },

  attachment: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  attachName: { fontSize: 13, color: '#212121', fontWeight: '500' },
  attachMeta: { fontSize: 11, color: '#9E9E9E', marginTop: 1 },

  comment: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
    alignItems: 'flex-start',
  },
  commentTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  commentName: { fontSize: 13, fontWeight: '700', color: '#212121' },
  commentTime: { fontSize: 11, color: '#9E9E9E' },
  commentText: { fontSize: 13, color: '#424242', lineHeight: 18 },
})
