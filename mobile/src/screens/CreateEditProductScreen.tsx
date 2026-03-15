import React, { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { productApi } from '../api/services'
import { useBoardStore } from '../store/boardStore'
import type { RootStackParams } from '../types'

type NavProp    = NativeStackNavigationProp<RootStackParams>
type RouteProp_ = RouteProp<RootStackParams, 'CreateEditProduct'>

const STATUSES = [
  { value: 'yet_to_start', label: 'Yet to Start', color: '#94A3B8', bg: '#F1F5F9' },
  { value: 'working',      label: 'In Progress',  color: '#1A56D6', bg: '#EFF6FF' },
  { value: 'review',       label: 'In Review',    color: '#D97706', bg: '#FFFBEB' },
  { value: 'done',         label: 'Done',         color: '#16A34A', bg: '#F0FDF4' },
]

interface FormState {
  product_id:     string
  customer_name:  string
  customer_phone: string
  description:    string
  status:         string
}

const EMPTY: FormState = {
  product_id: '', customer_name: '', customer_phone: '', description: '', status: 'yet_to_start',
}

export default function CreateEditProductScreen() {
  const insets = useSafeAreaInsets()
  const nav    = useNavigation<NavProp>()
  const route  = useRoute<RouteProp_>()
  const isEdit = !!route.params?.id
  const id     = route.params?.id

  const { addProductLocally, updateProductLocally } = useBoardStore()

  const [form,        setForm]        = useState<FormState>(EMPTY)
  const [loading,     setLoading]     = useState(isEdit)
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')
  const [statusOpen,  setStatusOpen]  = useState(false)

  // Load existing product when editing
  useEffect(() => {
    if (!isEdit || !id) return
    productApi.get(id).then(p => {
      setForm({
        product_id:     p.product_id,
        customer_name:  p.customer_name,
        customer_phone: p.customer_phone,
        description:    p.description,
        status:         p.status,
      })
      setLoading(false)
    }).catch(() => {
      Alert.alert('Error', 'Failed to load order.')
      nav.goBack()
    })
  }, [id])

  const set = (key: keyof FormState) => (val: string) =>
    setForm(f => ({ ...f, [key]: val }))

  const validate = (): string => {
    if (!form.product_id.trim())    return 'Order ID is required.'
    if (!form.customer_name.trim()) return 'Customer name is required.'
    return ''
  }

  const save = async () => {
    const err = validate()
    if (err) { setError(err); return }
    setError('')
    setSaving(true)
    try {
      if (isEdit && id) {
        const updated = await productApi.update(id, {
          customer_name:  form.customer_name.trim(),
          customer_phone: form.customer_phone.trim(),
          description:    form.description.trim(),
        })
        // Also update status if changed
        const fresh = await productApi.get(id)
        if (fresh.status !== form.status) {
          await productApi.updateStatus(id, form.status)
        }
        updateProductLocally({ ...updated, status: form.status as any })
        nav.goBack()
      } else {
        const created = await productApi.create({
          product_id:     form.product_id.trim(),
          customer_name:  form.customer_name.trim(),
          customer_phone: form.customer_phone.trim(),
          description:    form.description.trim(),
          status:         form.status as any,
        })
        addProductLocally(created)
        nav.goBack()
      }
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const selectedStatus = STATUSES.find(s => s.value === form.status) ?? STATUSES[0]

  if (loading) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => nav.goBack()}>
            <Ionicons name="close" size={22} color="#0F172A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Order</Text>
          <View style={{ width: 34 }} />
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#1A56D6" />
        </View>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => nav.goBack()} style={styles.iconBtn}>
          <Ionicons name="close" size={22} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isEdit ? 'Edit Order' : 'New Order'}</Text>
        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={save}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator size="small" color="#FFFFFF" />
            : <Text style={styles.saveBtnText}>{isEdit ? 'Save' : 'Create'}</Text>
          }
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Error banner */}
        {!!error && (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle-outline" size={16} color="#EF4444" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Order ID (create only) */}
        {!isEdit && (
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Order ID <Text style={styles.required}>*</Text></Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. ORD-001"
              placeholderTextColor="#CBD5E1"
              value={form.product_id}
              onChangeText={set('product_id')}
              autoCapitalize="characters"
              returnKeyType="next"
            />
          </View>
        )}

        {/* Customer name */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Customer Name <Text style={styles.required}>*</Text></Text>
          <TextInput
            style={styles.input}
            placeholder="Full name"
            placeholderTextColor="#CBD5E1"
            value={form.customer_name}
            onChangeText={set('customer_name')}
            returnKeyType="next"
          />
        </View>

        {/* Phone */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Phone Number</Text>
          <TextInput
            style={styles.input}
            placeholder="+1 234 567 8900"
            placeholderTextColor="#CBD5E1"
            value={form.customer_phone}
            onChangeText={set('customer_phone')}
            keyboardType="phone-pad"
            returnKeyType="next"
          />
        </View>

        {/* Status */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Status</Text>
          <TouchableOpacity
            style={styles.statusSelector}
            onPress={() => setStatusOpen(o => !o)}
          >
            <View style={[styles.statusDot, { backgroundColor: selectedStatus.color }]} />
            <Text style={[styles.statusLabel, { color: selectedStatus.color }]}>
              {selectedStatus.label}
            </Text>
            <Ionicons
              name={statusOpen ? 'chevron-up' : 'chevron-down'}
              size={16}
              color="#94A3B8"
            />
          </TouchableOpacity>
          {statusOpen && (
            <View style={styles.statusDropdown}>
              {STATUSES.map(s => (
                <TouchableOpacity
                  key={s.value}
                  style={[
                    styles.statusOption,
                    form.status === s.value && { backgroundColor: s.bg },
                  ]}
                  onPress={() => { set('status')(s.value); setStatusOpen(false) }}
                >
                  <View style={[styles.statusDot, { backgroundColor: s.color }]} />
                  <Text style={[styles.statusOptionText, { color: s.color }]}>{s.label}</Text>
                  {form.status === s.value && (
                    <Ionicons name="checkmark" size={16} color={s.color} style={{ marginLeft: 'auto' }} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Description */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            placeholder="Order details, notes…"
            placeholderTextColor="#CBD5E1"
            value={form.description}
            onChangeText={set('description')}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#F8FAFC' },
  centered:{ flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#0F172A' },
  iconBtn:     { padding: 4 },
  saveBtn: {
    backgroundColor: '#1A56D6', borderRadius: 8,
    paddingHorizontal: 16, paddingVertical: 8,
    minWidth: 70, alignItems: 'center',
  },
  saveBtnDisabled: { backgroundColor: '#93C5FD' },
  saveBtnText:     { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },

  scrollContent: { padding: 16, gap: 16 },

  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FEF2F2', borderRadius: 10,
    borderWidth: 1, borderColor: '#FECACA',
    paddingHorizontal: 12, paddingVertical: 10,
  },
  errorText: { flex: 1, fontSize: 13, color: '#EF4444', fontWeight: '500' },

  fieldGroup: { gap: 6 },
  label:      { fontSize: 13, fontWeight: '600', color: '#374151' },
  required:   { color: '#EF4444' },
  input: {
    backgroundColor: '#FFFFFF', borderRadius: 10,
    borderWidth: 1, borderColor: '#E2E8F0',
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: '#0F172A',
  },
  textarea: { minHeight: 100, paddingTop: 12 },

  statusSelector: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FFFFFF', borderRadius: 10,
    borderWidth: 1, borderColor: '#E2E8F0',
    paddingHorizontal: 14, paddingVertical: 12,
  },
  statusDot:   { width: 8, height: 8, borderRadius: 4 },
  statusLabel: { flex: 1, fontSize: 14, fontWeight: '600' },

  statusDropdown: {
    backgroundColor: '#FFFFFF', borderRadius: 10,
    borderWidth: 1, borderColor: '#E2E8F0',
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8, elevation: 4,
  },
  statusOption: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  statusOptionText: { fontSize: 14, fontWeight: '600' },
})
