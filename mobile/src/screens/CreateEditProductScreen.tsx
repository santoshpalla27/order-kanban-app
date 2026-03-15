import React, { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native'

import { productApi } from '../api/services'
import { useBoardStore } from '../store/boardStore'
import { statusLabel, STATUS_HDR, ALL_STATUSES } from '../utils/helpers'
import type { RootStackParams, ProductStatus } from '../types'

type Route = RouteProp<RootStackParams, 'CreateEditProduct'>

export default function CreateEditProductScreen() {
  const insets = useSafeAreaInsets()
  const nav    = useNavigation()
  const route  = useRoute<Route>()
  const id     = route.params?.id
  const isEdit = !!id

  const { addProductLocally, updateProductLocally } = useBoardStore()

  const [productId,     setProductId]     = useState('')
  const [customerName,  setCustomerName]  = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [description,   setDescription]  = useState('')
  const [status, setStatus] = useState<ProductStatus>('yet_to_start')
  const [loading, setLoading] = useState(isEdit)
  const [saving,  setSaving]  = useState(false)
  const [errors,  setErrors]  = useState<Record<string, string>>({})

  useEffect(() => {
    if (!id) return
    productApi.get(id).then(p => {
      setProductId(p.product_id)
      setCustomerName(p.customer_name)
      setCustomerPhone(p.customer_phone)
      setDescription(p.description)
      setStatus(p.status)
      setLoading(false)
    })
  }, [id])

  const validate = () => {
    const e: Record<string, string> = {}
    if (!isEdit && !productId.trim()) e.productId = 'Order ID is required'
    if (!customerName.trim())  e.customerName  = 'Customer name is required'
    if (!customerPhone.trim()) e.customerPhone = 'Phone number is required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSave = async () => {
    if (!validate() || saving) return
    setSaving(true)
    try {
      if (isEdit && id) {
        const updated = await productApi.update(id, {
          customer_name:  customerName.trim(),
          customer_phone: customerPhone.trim(),
          description:    description.trim(),
        })
        updateProductLocally(updated)
      } else {
        const created = await productApi.create({
          product_id:     productId.trim(),
          customer_name:  customerName.trim(),
          customer_phone: customerPhone.trim(),
          description:    description.trim(),
          status,
        })
        addProductLocally(created)
      }
      nav.goBack()
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.error ?? 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <ActivityIndicator color="#1A73E8" style={{ flex: 1, marginTop: 60 }} />

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => nav.goBack()}>
          <Ionicons name="close" size={24} color="#212121" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isEdit ? 'Edit Order' : 'New Order'}</Text>
        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color="#FFF" size="small" />
            : <Text style={styles.saveBtnText}>Save</Text>
          }
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        {/* Order ID (only on create) */}
        {!isEdit && (
          <Field
            label="Order ID *"
            value={productId}
            onChange={setProductId}
            error={errors.productId}
            placeholder="e.g. ORD-001"
            icon="barcode-outline"
          />
        )}

        {/* Customer Name */}
        <Field
          label="Customer Name *"
          value={customerName}
          onChange={setCustomerName}
          error={errors.customerName}
          placeholder="Enter customer full name"
          icon="person-outline"
        />

        {/* Phone */}
        <Field
          label="Phone Number *"
          value={customerPhone}
          onChange={setCustomerPhone}
          error={errors.customerPhone}
          placeholder="555-0199"
          icon="call-outline"
          keyboardType="phone-pad"
        />

        {/* Description */}
        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.textarea]}
          value={description}
          onChangeText={setDescription}
          placeholder="Describe the order…"
          placeholderTextColor="#BDBDBD"
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />

        {/* Status (only on create) */}
        {!isEdit && (
          <>
            <Text style={styles.label}>Initial Status</Text>
            <View style={styles.statusGrid}>
              {ALL_STATUSES.map(s => (
                <TouchableOpacity
                  key={s}
                  style={[
                    styles.statusOption,
                    status === s && {
                      borderColor: STATUS_HDR[s],
                      backgroundColor: STATUS_HDR[s] + '15',
                    },
                  ]}
                  onPress={() => setStatus(s)}
                >
                  <View style={[styles.statusDot, { backgroundColor: STATUS_HDR[s] }]} />
                  <Text style={[
                    styles.statusOptionText,
                    status === s && { color: STATUS_HDR[s], fontWeight: '700' },
                  ]}>
                    {statusLabel(s)}
                  </Text>
                  {status === s && (
                    <Ionicons name="checkmark-circle" size={16} color={STATUS_HDR[s]} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

function Field({
  label, value, onChange, error, placeholder, icon, keyboardType
}: {
  label: string; value: string; onChange: (t: string) => void;
  error?: string; placeholder?: string; icon: string; keyboardType?: any
}) {
  return (
    <View style={styles.fieldWrapper}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputRow, error ? styles.inputError : null]}>
        <Ionicons name={icon as any} size={17} color="#9E9E9E" style={{ marginRight: 8 }} />
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor="#BDBDBD"
          keyboardType={keyboardType}
        />
      </View>
      {error ? <Text style={styles.errorMsg}>{error}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#F8F9FA' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: '#212121' },
  saveBtn: {
    backgroundColor: '#1A73E8',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 7,
    minWidth: 60,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#FFF', fontWeight: '700', fontSize: 14 },

  content: { padding: 16 },
  fieldWrapper: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#424242', marginBottom: 7 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
  },
  inputError: { borderColor: '#E53935' },
  input: { flex: 1, fontSize: 14, color: '#212121' },
  errorMsg: { color: '#E53935', fontSize: 12, marginTop: 4 },

  textarea: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    color: '#212121',
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    height: 100,
    marginBottom: 16,
  },

  statusGrid: { gap: 8 },
  statusOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
  },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusOptionText: { flex: 1, fontSize: 14, color: '#424242', fontWeight: '500' },
})
