import React, { useState, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Modal, SafeAreaView, Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { ProductFilters } from '../store/boardStore';
import { STATUS_LABELS, STATUS_ORDER } from '../types';
import { User } from '../types';
import { useThemeStore } from '../store/themeStore';
import { darkColors, lightColors, ThemeColors } from '../theme';

interface Props {
  visible: boolean;
  filters: ProductFilters;
  users: User[];
  hideAssignedTo?: boolean;
  onApply: (f: ProductFilters) => void;
  onClose: () => void;
}

type DeliveryPreset = 'overdue' | 'today' | 'tomorrow' | '3days' | '6days' | 'custom' | '';

function dayStart(offsetDays: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d;
}

function presetToRange(preset: DeliveryPreset): { from: string; to: string } {
  if (preset === 'overdue')  return { from: '',                          to: dayStart(0).toISOString() };
  if (preset === 'today')    return { from: dayStart(0).toISOString(),   to: dayStart(1).toISOString() };
  if (preset === 'tomorrow') return { from: dayStart(1).toISOString(),   to: dayStart(2).toISOString() };
  if (preset === '3days')    return { from: dayStart(0).toISOString(),   to: dayStart(4).toISOString() };
  if (preset === '6days')    return { from: dayStart(0).toISOString(),   to: dayStart(7).toISOString() };
  return { from: '', to: '' };
}

const DELIVERY_PRESETS: { value: DeliveryPreset; label: string }[] = [
  { value: 'overdue',  label: 'Overdue'   },
  { value: 'today',    label: 'Today'     },
  { value: 'tomorrow', label: 'Tomorrow'  },
  { value: '3days',    label: 'In 3 days' },
  { value: '6days',    label: 'In 6 days' },
  { value: 'custom',   label: 'Custom…'   },
];

function fmt(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

// Inline date picker row — shows current value + opens native picker
function DateField({
  label, value, onChange, minimumDate, c,
}: { label: string; value: string; onChange: (iso: string) => void; minimumDate?: Date; c: ThemeColors }) {
  const [show, setShow] = useState(false);
  const date = value ? new Date(value) : new Date();
  const df = useMemo(() => makeDateFieldStyles(c), [c]);

  return (
    <View style={df.wrap}>
      <Text style={df.label}>{label}</Text>
      <TouchableOpacity style={df.btn} onPress={() => setShow(true)}>
        <Text style={value ? df.valText : df.placeholder}>
          {value ? fmt(value) : 'Pick date'}
        </Text>
        {value ? (
          <TouchableOpacity onPress={() => onChange('')} hitSlop={8}>
            <Text style={df.clear}>✕</Text>
          </TouchableOpacity>
        ) : (
          <Text style={df.icon}>📅</Text>
        )}
      </TouchableOpacity>

      {show && (
        <DateTimePicker
          mode="date"
          value={date}
          minimumDate={minimumDate}
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={(_e, selected) => {
            setShow(Platform.OS === 'ios');
            if (selected) onChange(selected.toISOString());
          }}
        />
      )}
    </View>
  );
}

function makeDateFieldStyles(c: ThemeColors) {
  return StyleSheet.create({
    wrap: { flex: 1, minWidth: 140 },
    label: { fontSize: 11, fontWeight: '600', color: c.textMuted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
    btn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: c.surface, borderRadius: 10, borderWidth: 1,
      borderColor: c.border2, paddingHorizontal: 12, paddingVertical: 10,
    },
    valText: { fontSize: 13, color: c.text },
    placeholder: { fontSize: 13, color: c.textDim },
    icon: { fontSize: 14 },
    clear: { fontSize: 13, color: c.textMuted, paddingLeft: 4 },
  });
}

// ─── Main FilterPanel ─────────────────────────────────────────────────────────

export default function FilterPanel({ visible, filters, users, hideAssignedTo, onApply, onClose }: Props) {
  const isDark = useThemeStore((s) => s.isDark);
  const c = isDark ? darkColors : lightColors;
  const s = useMemo(() => makeStyles(c), [c]);

  const [local, setLocal]                 = useState<ProductFilters>(filters);
  const [deliveryPreset, setDeliveryPreset] = useState<DeliveryPreset>('');

  // Sync local state when panel opens with fresh filters
  const handleOpen = () => setLocal(filters);

  const set = (patch: Partial<ProductFilters>) => setLocal((f) => ({ ...f, ...patch }));

  const handleDeliveryPreset = (preset: DeliveryPreset) => {
    const next = deliveryPreset === preset ? '' : preset;
    setDeliveryPreset(next);
    if (next !== 'custom') {
      const { from, to } = presetToRange(next);
      set({ delivery_from: from, delivery_to: to });
    } else {
      set({ delivery_from: '', delivery_to: '' });
    }
  };

  const handleApply = () => { onApply(local); onClose(); };

  const handleReset = () => {
    const blank: ProductFilters = {
      search: '', status: '', created_by: '', assigned_to: '',
      date_from: '', date_to: '', delivery_from: '', delivery_to: '',
    };
    setDeliveryPreset('');
    setLocal(blank);
    onApply(blank);
    onClose();
  };

  const activeCount = [
    local.status, local.created_by,
    ...(hideAssignedTo ? [] : [local.assigned_to]),
    local.date_from, local.date_to, local.delivery_from, local.delivery_to,
  ].filter(Boolean).length;

  const statusOptions = [{ key: '', label: 'All Statuses' }, ...STATUS_ORDER.map((s) => ({ key: s, label: STATUS_LABELS[s] }))];
  const userOptions   = [{ id: '', name: 'Anyone' }, ...users.map((u) => ({ id: String(u.id), name: u.name }))];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onShow={handleOpen}>
      <SafeAreaView style={s.container}>

        {/* Header */}
        <View style={s.header}>
          <Text style={s.title}>
            Filters{activeCount > 0 ? ` (${activeCount})` : ''}
          </Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={s.closeBtn}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={s.body} contentContainerStyle={s.bodyContent} keyboardShouldPersistTaps="handled">

          {/* ── Search ── */}
          <View style={s.section}>
            <Text style={s.sectionLabel}>Search</Text>
            <TextInput
              style={s.input}
              value={local.search}
              onChangeText={(v) => set({ search: v })}
              placeholder="Search by ID, customer, phone…"
              placeholderTextColor={c.textDim}
            />
          </View>

          <View style={s.divider} />

          {/* ── Status ── */}
          <View style={s.section}>
            <Text style={s.sectionLabel}>Status</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={s.chipRow}>
                {statusOptions.map((opt) => (
                  <TouchableOpacity
                    key={opt.key}
                    style={[s.chip, local.status === opt.key && s.chipActive]}
                    onPress={() => set({ status: opt.key })}
                  >
                    <Text style={[s.chipText, local.status === opt.key && s.chipTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>

          <View style={s.divider} />

          {/* ── Assigned To — hidden in My Orders (locked to current user) ── */}
          {!hideAssignedTo && (
            <>
              <View style={s.section}>
                <Text style={s.sectionLabel}>Assigned To</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={s.chipRow}>
                    {userOptions.map((u) => (
                      <TouchableOpacity
                        key={u.id}
                        style={[s.chip, local.assigned_to === u.id && s.chipActive]}
                        onPress={() => set({ assigned_to: u.id })}
                      >
                        <Text style={[s.chipText, local.assigned_to === u.id && s.chipTextActive]}>
                          {u.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>
              <View style={s.divider} />
            </>
          )}

          {/* ── Created By ── */}
          <View style={s.section}>
            <Text style={s.sectionLabel}>Created By</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={s.chipRow}>
                {userOptions.map((u) => (
                  <TouchableOpacity
                    key={u.id}
                    style={[s.chip, local.created_by === u.id && s.chipActive]}
                    onPress={() => set({ created_by: u.id })}
                  >
                    <Text style={[s.chipText, local.created_by === u.id && s.chipTextActive]}>
                      {u.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>

          <View style={s.divider} />

          {/* ── Created Date Range ── */}
          <View style={s.section}>
            <Text style={s.sectionLabel}>Created Date Range</Text>
            <View style={s.dateRow}>
              <DateField
                label="From"
                value={local.date_from}
                onChange={(v) => set({ date_from: v })}
                c={c}
              />
              <View style={s.dateSep} />
              <DateField
                label="To"
                value={local.date_to}
                minimumDate={local.date_from ? new Date(local.date_from) : undefined}
                onChange={(v) => set({ date_to: v })}
                c={c}
              />
            </View>
          </View>

          <View style={s.divider} />

          {/* ── Delivery Date ── */}
          <View style={s.section}>
            <Text style={s.sectionLabel}>Delivery Date</Text>

            {/* Preset chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              <View style={s.chipRow}>
                {DELIVERY_PRESETS.map(({ value, label }) => (
                  <TouchableOpacity
                    key={value}
                    style={[s.chip, deliveryPreset === value && s.chipActive]}
                    onPress={() => handleDeliveryPreset(value)}
                  >
                    <Text style={[s.chipText, deliveryPreset === value && s.chipTextActive]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {/* Custom date range */}
            {deliveryPreset === 'custom' && (
              <View style={s.dateRow}>
                <DateField
                  label="Delivery From"
                  value={local.delivery_from}
                  onChange={(v) => set({ delivery_from: v })}
                  c={c}
                />
                <View style={s.dateSep} />
                <DateField
                  label="Delivery To"
                  value={local.delivery_to ? new Date(new Date(local.delivery_to).getTime() - 86400000).toISOString() : ''}
                  minimumDate={local.delivery_from ? new Date(local.delivery_from) : undefined}
                  onChange={(v) => {
                    if (!v) { set({ delivery_to: '' }); return; }
                    // Store as exclusive upper bound (start of next day)
                    const d = new Date(v);
                    d.setDate(d.getDate() + 1);
                    d.setHours(0, 0, 0, 0);
                    set({ delivery_to: d.toISOString() });
                  }}
                  c={c}
                />
              </View>
            )}

            {/* Active preset summary */}
            {deliveryPreset !== '' && deliveryPreset !== 'custom' && (local.delivery_from || local.delivery_to) && (
              <Text style={s.presetSummary}>
                {local.delivery_from ? `From ${fmt(local.delivery_from)}  ` : ''}
                {local.delivery_to   ? `until ${fmt(local.delivery_to)}` : ''}
              </Text>
            )}
          </View>

        </ScrollView>

        {/* Footer actions */}
        <View style={s.actions}>
          <TouchableOpacity style={s.resetBtn} onPress={handleReset}>
            <Text style={s.resetText}>Reset All</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.applyBtn} onPress={handleApply}>
            <Text style={s.applyText}>
              Apply{activeCount > 0 ? ` (${activeCount})` : ''}
            </Text>
          </TouchableOpacity>
        </View>

      </SafeAreaView>
    </Modal>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.headerBg },

    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 20, paddingVertical: 16,
      borderBottomWidth: 1, borderBottomColor: c.surface2,
    },
    title:    { fontSize: 18, fontWeight: '700', color: c.text },
    closeBtn: { fontSize: 18, color: c.textSec, padding: 4 },

    body:        { flex: 1 },
    bodyContent: { paddingBottom: 20 },

    section: { paddingHorizontal: 20, paddingVertical: 16 },
    divider: { height: 1, backgroundColor: c.surface2, marginHorizontal: 20 },

    sectionLabel: {
      fontSize: 11, fontWeight: '700', color: c.textMuted,
      textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10,
    },

    input: {
      backgroundColor: c.surface, borderRadius: 10, borderWidth: 1,
      borderColor: c.border2, color: c.text,
      paddingHorizontal: 14, paddingVertical: 11, fontSize: 14,
    },

    chipRow: { flexDirection: 'row', gap: 8 },
    chip: {
      paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99,
      borderWidth: 1, borderColor: c.border2, backgroundColor: c.surface,
    },
    chipActive:     { borderColor: c.brand, backgroundColor: 'rgba(99,102,241,0.15)' },
    chipText:       { fontSize: 13, color: c.textSec },
    chipTextActive: { color: '#A5B4FC', fontWeight: '600' },

    dateRow: { flexDirection: 'row', gap: 10 },
    dateSep: { width: 10, alignSelf: 'center', alignItems: 'center' },

    presetSummary: { fontSize: 12, color: c.textMuted, marginTop: 8 },

    actions: {
      flexDirection: 'row', gap: 12, padding: 20,
      borderTopWidth: 1, borderTopColor: c.surface2,
    },
    resetBtn: {
      flex: 1, paddingVertical: 13, borderRadius: 12,
      borderWidth: 1, borderColor: c.border2, alignItems: 'center',
    },
    resetText: { color: c.textSec, fontSize: 15, fontWeight: '600' },
    applyBtn: {
      flex: 2, paddingVertical: 13, borderRadius: 12,
      backgroundColor: c.brand, alignItems: 'center',
    },
    applyText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  });
}
