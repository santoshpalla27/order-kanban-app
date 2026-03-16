import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator, Animated, FlatList, Modal, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, TouchableWithoutFeedback, View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { userApi } from '../api/services'
import type { User } from '../types'
import type { BoardFilters } from '../store/boardStore'

// ─── Delivery presets ──────────────────────────────────────────────────────────

type DeliveryPreset = 'overdue' | 'today' | 'tomorrow' | '3days' | '6days' | 'custom' | ''

const DELIVERY_PRESETS: { value: DeliveryPreset; label: string }[] = [
  { value: 'overdue',  label: 'Overdue'   },
  { value: 'today',    label: 'Today'     },
  { value: 'tomorrow', label: 'Tomorrow'  },
  { value: '3days',    label: 'Next 3d'   },
  { value: '6days',    label: 'Next 6d'   },
  { value: 'custom',   label: 'Custom'    },
]

function toIso(d: Date) {
  return d.toISOString().slice(0, 10)
}

function presetToDates(preset: DeliveryPreset): { from: string; to: string } {
  const today    = new Date(); today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
  const in3      = new Date(today); in3.setDate(today.getDate() + 3)
  const in6      = new Date(today); in6.setDate(today.getDate() + 6)
  switch (preset) {
    case 'overdue':  return { from: '',          to: toIso(today)    }
    case 'today':    return { from: toIso(today), to: toIso(today)    }
    case 'tomorrow': return { from: toIso(tomorrow), to: toIso(tomorrow) }
    case '3days':    return { from: toIso(today), to: toIso(in3)     }
    case '6days':    return { from: toIso(today), to: toIso(in6)     }
    default:         return { from: '',          to: ''              }
  }
}

// ─── Types ─────────────────────────────────────────────────────────────────────

export type FilterState = BoardFilters

interface Props {
  visible:         boolean
  onClose:         () => void
  filters:         FilterState
  onChange:        (f: FilterState) => void
  hideAssignedTo?: boolean
}

// ─── User Picker Modal ─────────────────────────────────────────────────────────

interface UserPickerProps {
  visible:     boolean
  title:       string
  users:       User[]
  selectedId:  string
  onSelect:    (id: string, name: string) => void
  onClose:     () => void
}

function UserPickerModal({ visible, title, users, selectedId, onSelect, onClose }: UserPickerProps) {
  const [search, setSearch] = useState('')
  const filtered = users.filter(u => u.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={pickerStyles.overlay} />
      </TouchableWithoutFeedback>
      <View style={pickerStyles.sheet}>
        <View style={pickerStyles.handle} />
        <Text style={pickerStyles.title}>{title}</Text>

        <View style={pickerStyles.searchBox}>
          <Ionicons name="search-outline" size={15} color="#94A3B8" style={{ marginRight: 6 }} />
          <TextInput
            style={pickerStyles.searchInput}
            placeholder="Search users…"
            placeholderTextColor="#CBD5E1"
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={15} color="#CBD5E1" />
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={[pickerStyles.item, !selectedId && pickerStyles.itemActive]}
          onPress={() => { onSelect('', ''); onClose() }}
        >
          <Text style={[pickerStyles.itemText, !selectedId && pickerStyles.itemTextActive]}>
            Anyone
          </Text>
          {!selectedId && <Ionicons name="checkmark" size={16} color="#1A56D6" />}
        </TouchableOpacity>

        <FlatList
          data={filtered}
          keyExtractor={u => String(u.id)}
          style={{ maxHeight: 280 }}
          renderItem={({ item: u }) => {
            const active = selectedId === String(u.id)
            return (
              <TouchableOpacity
                style={[pickerStyles.item, active && pickerStyles.itemActive]}
                onPress={() => { onSelect(String(u.id), u.name); onClose() }}
              >
                <View style={pickerStyles.avatar}>
                  <Text style={pickerStyles.avatarText}>{u.name[0]?.toUpperCase()}</Text>
                </View>
                <Text style={[pickerStyles.itemText, active && pickerStyles.itemTextActive]} numberOfLines={1}>
                  {u.name}
                </Text>
                {active && <Ionicons name="checkmark" size={16} color="#1A56D6" />}
              </TouchableOpacity>
            )
          }}
        />
      </View>
    </Modal>
  )
}

// ─── Main FilterPanel ──────────────────────────────────────────────────────────

export default function FilterPanel({ visible, onClose, filters, onChange, hideAssignedTo = false }: Props) {
  const slideAnim = useRef(new Animated.Value(400)).current

  // Local draft state
  const [draft,            setDraft]           = useState<FilterState>(filters)
  const [deliveryPreset,   setDeliveryPreset]   = useState<DeliveryPreset>('')
  const [users,          setUsers]          = useState<User[]>([])
  const [createdByName,  setCreatedByName]  = useState('')
  const [assignedToName, setAssignedToName] = useState('')
  const [pickerFor,      setPickerFor]      = useState<'created_by' | 'assigned_to' | null>(null)

  const [usersLoading, setUsersLoading] = useState(false)

  // Sync draft + fetch users every time panel opens
  useEffect(() => {
    if (visible) {
      setDraft(filters)
      setDeliveryPreset('')
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start()
      // Re-fetch users on every open so we always have fresh data
      setUsersLoading(true)
      userApi.list()
        .then(list => {
          setUsers(list)
          // Restore display names for pre-selected filter values
          if (filters.created_by) {
            const u = list.find(u => String(u.id) === filters.created_by)
            if (u) setCreatedByName(u.name)
          }
          if (filters.assigned_to) {
            const u = list.find(u => String(u.id) === filters.assigned_to)
            if (u) setAssignedToName(u.name)
          }
        })
        .catch(e => console.warn('[FilterPanel] Failed to load users:', e?.response?.data ?? e?.message))
        .finally(() => setUsersLoading(false))
    } else {
      Animated.timing(slideAnim, { toValue: 400, duration: 200, useNativeDriver: true }).start()
    }
  }, [visible])

  const setDelivery = useCallback((preset: DeliveryPreset) => {
    setDeliveryPreset(preset)
    if (preset !== 'custom') {
      const { from, to } = presetToDates(preset)
      setDraft(d => ({ ...d, delivery_from: from, delivery_to: to }))
    }
  }, [])

  const apply = () => {
    onChange(draft)
    onClose()
  }

  const reset = () => {
    const cleared: FilterState = {
      search: draft.search,   // preserve search
      created_by: '', assigned_to: '',
      date_from: '', date_to: '',
      delivery_from: '', delivery_to: '',
    }
    setDraft(cleared)
    setDeliveryPreset('')
    setCreatedByName('')
    setAssignedToName('')
    onChange(cleared)
    onClose()
  }

  const activeCount = [
    draft.created_by, draft.assigned_to,
    draft.date_from || draft.date_to,
    draft.delivery_from || draft.delivery_to,
  ].filter(Boolean).length

  if (!visible) return null

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      {/* Backdrop */}
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>

      <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
        <View style={styles.handle} />

        {/* Header */}
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Filters</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={20} color="#64748B" />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} style={styles.body}>

          {/* Created By */}
          <Text style={styles.label}>Created By</Text>
          <TouchableOpacity style={styles.pickerRow} onPress={() => !usersLoading && setPickerFor('created_by')}>
            <Ionicons name="person-outline" size={16} color="#64748B" style={{ marginRight: 8 }} />
            <Text style={[styles.pickerText, !createdByName && styles.pickerPlaceholder]}>
              {createdByName || 'Anyone'}
            </Text>
            {usersLoading
              ? <ActivityIndicator size="small" color="#94A3B8" />
              : <Ionicons name="chevron-down" size={14} color="#94A3B8" />
            }
          </TouchableOpacity>

          {/* Assigned To */}
          {!hideAssignedTo && (
            <>
              <Text style={styles.label}>Assigned To</Text>
              <TouchableOpacity style={styles.pickerRow} onPress={() => !usersLoading && setPickerFor('assigned_to')}>
                <Ionicons name="people-outline" size={16} color="#64748B" style={{ marginRight: 8 }} />
                <Text style={[styles.pickerText, !assignedToName && styles.pickerPlaceholder]}>
                  {assignedToName || 'Anyone'}
                </Text>
                {usersLoading
                  ? <ActivityIndicator size="small" color="#94A3B8" />
                  : <Ionicons name="chevron-down" size={14} color="#94A3B8" />
                }
              </TouchableOpacity>
            </>
          )}

          {/* Created Date Range */}
          <Text style={styles.label}>Created Date</Text>
          <View style={styles.dateRow}>
            <View style={styles.dateField}>
              <Text style={styles.dateLabel}>From</Text>
              <TextInput
                style={styles.dateInput}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#CBD5E1"
                value={draft.date_from}
                onChangeText={v => setDraft(d => ({ ...d, date_from: v }))}
                keyboardType="numbers-and-punctuation"
                maxLength={10}
              />
            </View>
            <View style={styles.dateSep} />
            <View style={styles.dateField}>
              <Text style={styles.dateLabel}>To</Text>
              <TextInput
                style={styles.dateInput}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#CBD5E1"
                value={draft.date_to}
                onChangeText={v => setDraft(d => ({ ...d, date_to: v }))}
                keyboardType="numbers-and-punctuation"
                maxLength={10}
              />
            </View>
          </View>

          {/* Delivery Date Presets */}
          <Text style={styles.label}>Delivery Date</Text>
          <View style={styles.presetWrap}>
            {DELIVERY_PRESETS.map(({ value, label }) => {
              const active = deliveryPreset === value
              return (
                <TouchableOpacity
                  key={value}
                  style={[styles.presetChip, active && styles.presetChipActive]}
                  onPress={() => setDelivery(active ? '' : value)}
                >
                  <Text style={[styles.presetText, active && styles.presetTextActive]}>{label}</Text>
                </TouchableOpacity>
              )
            })}
          </View>

          {/* Custom delivery date range */}
          {deliveryPreset === 'custom' && (
            <View style={[styles.dateRow, { marginTop: 8 }]}>
              <View style={styles.dateField}>
                <Text style={styles.dateLabel}>From</Text>
                <TextInput
                  style={styles.dateInput}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#CBD5E1"
                  value={draft.delivery_from}
                  onChangeText={v => setDraft(d => ({ ...d, delivery_from: v }))}
                  keyboardType="numbers-and-punctuation"
                  maxLength={10}
                />
              </View>
              <View style={styles.dateSep} />
              <View style={styles.dateField}>
                <Text style={styles.dateLabel}>To</Text>
                <TextInput
                  style={styles.dateInput}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#CBD5E1"
                  value={draft.delivery_to}
                  onChangeText={v => setDraft(d => ({ ...d, delivery_to: v }))}
                  keyboardType="numbers-and-punctuation"
                  maxLength={10}
                />
              </View>
            </View>
          )}

          <View style={{ height: 16 }} />
        </ScrollView>

        {/* Footer */}
        <View style={styles.footer}>
          <TouchableOpacity style={styles.resetBtn} onPress={reset}>
            <Text style={styles.resetText}>Reset</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.applyBtn} onPress={apply}>
            <Text style={styles.applyText}>
              Apply{activeCount > 0 ? ` (${activeCount})` : ''}
            </Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* User Pickers */}
      <UserPickerModal
        visible={pickerFor === 'created_by'}
        title="Created By"
        users={users}
        selectedId={draft.created_by}
        onSelect={(id, name) => { setDraft(d => ({ ...d, created_by: id })); setCreatedByName(name) }}
        onClose={() => setPickerFor(null)}
      />
      <UserPickerModal
        visible={pickerFor === 'assigned_to'}
        title="Assigned To"
        users={users}
        selectedId={draft.assigned_to}
        onSelect={(id, name) => { setDraft(d => ({ ...d, assigned_to: id })); setAssignedToName(name) }}
        onClose={() => setPickerFor(null)}
      />
    </Modal>
  )
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.45)',
  },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingBottom: 32,
    maxHeight: '85%',
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1, shadowRadius: 12, elevation: 20,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: '#E2E8F0',
    alignSelf: 'center', marginTop: 10, marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  closeBtn:   { padding: 4 },

  body: { paddingHorizontal: 20, paddingTop: 12 },

  label: { fontSize: 12, fontWeight: '600', color: '#64748B', marginBottom: 8, marginTop: 16, textTransform: 'uppercase', letterSpacing: 0.5 },

  pickerRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 11,
    backgroundColor: '#F8FAFC',
  },
  pickerText:        { flex: 1, fontSize: 14, color: '#0F172A' },
  pickerPlaceholder: { color: '#94A3B8' },

  dateRow:   { flexDirection: 'row', gap: 10 },
  dateField: { flex: 1 },
  dateLabel: { fontSize: 11, color: '#94A3B8', marginBottom: 5 },
  dateInput: {
    borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 13, color: '#0F172A', backgroundColor: '#F8FAFC',
  },
  dateSep: { width: 1 },

  presetWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  presetChip: {
    borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 7, backgroundColor: '#FFFFFF',
  },
  presetChipActive: { borderColor: '#1A56D6', backgroundColor: '#EFF6FF' },
  presetText:       { fontSize: 13, color: '#64748B', fontWeight: '500' },
  presetTextActive: { color: '#1A56D6', fontWeight: '600' },

  footer: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 20, paddingTop: 14,
    borderTopWidth: 1, borderTopColor: '#F1F5F9',
  },
  resetBtn: {
    flex: 1, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12,
    paddingVertical: 13, alignItems: 'center', backgroundColor: '#F8FAFC',
  },
  resetText: { fontSize: 14, fontWeight: '600', color: '#64748B' },
  applyBtn: {
    flex: 2, backgroundColor: '#1A56D6', borderRadius: 12,
    paddingVertical: 13, alignItems: 'center',
  },
  applyText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
})

const pickerStyles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.3)' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingBottom: 32, paddingTop: 8,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: '#E2E8F0',
    alignSelf: 'center', marginBottom: 8,
  },
  title: { fontSize: 15, fontWeight: '700', color: '#0F172A', paddingHorizontal: 16, marginBottom: 10 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, marginBottom: 8,
    borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#F8FAFC',
  },
  searchInput: { flex: 1, fontSize: 14, color: '#0F172A', padding: 0 },
  item: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#F8FAFC',
  },
  itemActive: { backgroundColor: '#EFF6FF' },
  avatar: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: '#DBEAFE',
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  avatarText: { fontSize: 12, fontWeight: '700', color: '#1A56D6' },
  itemText:       { flex: 1, fontSize: 14, color: '#334155' },
  itemTextActive: { color: '#1A56D6', fontWeight: '600' },
})
