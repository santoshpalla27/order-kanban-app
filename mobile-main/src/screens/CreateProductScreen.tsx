import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useNavigation } from '@react-navigation/native';
import { productsApi, usersApi } from '../api/services';
import { User } from '../types';
import { useThemeStore } from '../store/themeStore';
import { darkColors, lightColors, ThemeColors } from '../theme';
import { Feather } from '@expo/vector-icons';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function CreateProductScreen() {
  const navigation = useNavigation();

  const isDark = useThemeStore((s) => s.isDark);
  const c = isDark ? darkColors : lightColors;
  const s = useMemo(() => makeStyles(c), [c]);

  const [productId, setProductId]       = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [description, setDescription]   = useState('');
  const [deliveryAt, setDeliveryAt]     = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [androidPickerMode, setAndroidPickerMode] = useState<'date' | 'time'>('date');
  const [tempDate, setTempDate] = useState<Date | null>(null);
  const [assigneeIds, setAssigneeIds]   = useState<number[]>([]);
  const [users, setUsers]               = useState<User[]>([]);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState('');

  useEffect(() => {
    usersApi.getList()
      .then((r) => setUsers(r.data?.users || r.data || []))
      .catch(() => {});
  }, []);

  const addAssignee = (id: number) => {
    if (!assigneeIds.includes(id)) setAssigneeIds((prev) => [...prev, id]);
  };
  const removeAssignee = (id: number) => setAssigneeIds((prev) => prev.filter((x) => x !== id));

  const handleSubmit = async () => {
    if (!productId.trim())    { setError('Product ID is required'); return; }
    if (!customerName.trim()) { setError('Customer name is required'); return; }
    setError('');
    setLoading(true);
    try {
      await productsApi.create({
        product_id: productId.trim(),
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim(),
        description: description.trim(),
        delivery_at: deliveryAt ? deliveryAt.toISOString() : null,
        assignee_ids: assigneeIds,
      });
      navigation.goBack();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to create product');
    } finally {
      setLoading(false);
    }
  };

  const selectedUsers   = users.filter((u) => assigneeIds.includes(u.id));
  const availableUsers  = users.filter((u) => !assigneeIds.includes(u.id));

  return (
    <SafeAreaView style={s.screen}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">

        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
            <Feather name="arrow-left" size={24} color={c.textSec} style={{ marginTop: 2 }} />
          </TouchableOpacity>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Feather name="package" size={20} color={c.text} />
            <Text style={s.title}>New Product</Text>
          </View>
          <TouchableOpacity
            style={[s.createBtn, loading && { opacity: 0.6 }]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={s.createBtnText}>Create</Text>
            }
          </TouchableOpacity>
        </View>

        <ScrollView style={s.body} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">

          {!!error && (
            <View style={s.errorBox}>
              <Text style={s.errorText}>{error}</Text>
            </View>
          )}

          {/* Product ID */}
          <View style={s.field}>
            <Text style={s.label}>Product ID <Text style={s.required}>*</Text></Text>
            <TextInput
              style={s.input}
              value={productId}
              onChangeText={setProductId}
              placeholder="e.g. PRD-001"
              placeholderTextColor={c.textDim}
              autoCapitalize="characters"
            />
          </View>

          {/* Customer Name */}
          <View style={s.field}>
            <Text style={s.label}>Customer Name <Text style={s.required}>*</Text></Text>
            <TextInput
              style={s.input}
              value={customerName}
              onChangeText={setCustomerName}
              placeholder="Customer name"
              placeholderTextColor={c.textDim}
              autoCapitalize="words"
            />
          </View>

          {/* Customer Phone */}
          <View style={s.field}>
            <Text style={s.label}>Customer Phone</Text>
            <TextInput
              style={s.input}
              value={customerPhone}
              onChangeText={setCustomerPhone}
              placeholder="+1 234 567 8900"
              placeholderTextColor={c.textDim}
              keyboardType="phone-pad"
            />
          </View>

          {/* Description */}
          <View style={s.field}>
            <Text style={s.label}>Description</Text>
            <TextInput
              style={[s.input, s.textarea]}
              value={description}
              onChangeText={setDescription}
              placeholder="Product description..."
              placeholderTextColor={c.textDim}
              multiline
              textAlignVertical="top"
            />
          </View>

          {/* Delivery Date & Time */}
          <View style={s.field}>
            <Text style={s.label}>Delivery Date &amp; Time</Text>

            {Platform.OS === 'web' ? (
              /* Web: native HTML datetime-local input */
              <View>
                {/* @ts-ignore – HTML input is valid in React Native Web */}
                <input
                  type="datetime-local"
                  min={new Date().toISOString().slice(0, 16)}
                  value={deliveryAt ? (() => {
                    const d = deliveryAt;
                    const pad = (n: number) => String(n).padStart(2, '0');
                    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                  })() : ''}
                  onChange={(e: any) => {
                    const v = e.target.value;
                    setDeliveryAt(v ? new Date(v) : null);
                  }}
                  style={{
                    backgroundColor: c.surface,
                    border: `1px solid ${c.border2}`,
                    borderRadius: 14,
                    color: deliveryAt ? c.text : c.textDim,
                    padding: '13px 16px',
                    fontSize: 15,
                    width: '100%',
                    boxSizing: 'border-box',
                    colorScheme: isDark ? 'dark' : 'light',
                    outline: 'none',
                  }}
                />
                {deliveryAt && (
                  <TouchableOpacity style={s.clearDate} onPress={() => setDeliveryAt(null)}>
                    <Text style={s.clearDateText}>Clear</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              /* Native (iOS / Android): modal picker */
              <>
                <TouchableOpacity style={s.dateBtn} onPress={() => { setAndroidPickerMode('date'); setShowDatePicker(true); }}>
                  <Text style={deliveryAt ? s.dateBtnText : s.dateBtnPlaceholder}>
                    {deliveryAt ? formatDateTime(deliveryAt.toISOString()) : 'Pick date & time'}
                  </Text>
                  <Feather name="calendar" size={16} color={c.textSec} />
                </TouchableOpacity>
                {deliveryAt && (
                  <TouchableOpacity style={s.clearDate} onPress={() => setDeliveryAt(null)}>
                    <Text style={s.clearDateText}>Clear</Text>
                  </TouchableOpacity>
                )}
                {showDatePicker && Platform.OS === 'ios' && (
                  <DateTimePicker
                    mode="datetime"
                    value={deliveryAt ?? new Date()}
                    minimumDate={new Date()}
                    display="inline"
                    onChange={(_e, selected) => {
                      if (selected) setDeliveryAt(selected);
                    }}
                  />
                )}
                {showDatePicker && Platform.OS === 'ios' && (
                  <TouchableOpacity style={s.doneBtn} onPress={() => setShowDatePicker(false)}>
                    <Text style={s.doneBtnText}>Done</Text>
                  </TouchableOpacity>
                )}
                {showDatePicker && Platform.OS === 'android' && (
                  <DateTimePicker
                    mode={androidPickerMode}
                    value={androidPickerMode === 'date' ? (deliveryAt ?? new Date()) : (tempDate ?? new Date())}
                    minimumDate={androidPickerMode === 'date' ? new Date() : undefined}
                    display="default"
                    onChange={(_e, selected) => {
                      if (!selected) {
                        // user dismissed
                        setShowDatePicker(false);
                        setTempDate(null);
                        setAndroidPickerMode('date');
                        return;
                      }
                      if (androidPickerMode === 'date') {
                        // step 1: date selected — now show time picker
                        setTempDate(selected);
                        setAndroidPickerMode('time');
                      } else {
                        // step 2: time selected — merge date+time and finish
                        const merged = new Date(tempDate!);
                        merged.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
                        setDeliveryAt(merged);
                        setShowDatePicker(false);
                        setTempDate(null);
                        setAndroidPickerMode('date');
                      }
                    }}
                  />
                )}
              </>
            )}
          </View>

          {/* Assignees */}
          <View style={s.field}>
            <Text style={s.label}>Assign To</Text>

            {/* Selected assignees — removable chips */}
            {selectedUsers.length > 0 && (
              <View style={s.selectedChips}>
                {selectedUsers.map((u) => (
                  <View key={u.id} style={s.selectedChip}>
                    <Text style={s.selectedChipText}>{u.name}</Text>
                    <TouchableOpacity onPress={() => removeAssignee(u.id)} hitSlop={6}>
                      <Feather name="x" size={14} color={c.brandLight} style={{ marginLeft: 2 }} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {/* Unselected users — tappable chips */}
            {availableUsers.length > 0 && (
              <>
                <Text style={s.subLabel}>
                  {selectedUsers.length > 0 ? 'Add more users' : 'Add assignee'}
                </Text>
                <View style={s.availableChips}>
                  {availableUsers.map((u) => (
                    <TouchableOpacity key={u.id} style={s.availableChip} onPress={() => addAssignee(u.id)}>
                      <Feather name="plus" size={12} color={c.textMuted} style={{ marginRight: 4 }} />
                      <Text style={s.availableChipText}>{u.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {users.length === 0 && (
              <Text style={s.noUsers}>No users available</Text>
            )}
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },

    header: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingHorizontal: 16, paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: c.surface2,
    },
    backBtn:       { padding: 4 },
    backIcon:      { fontSize: 22, color: c.textSec },
    title:         { fontSize: 17, fontWeight: '700', color: c.text },
    createBtn:     { backgroundColor: c.brand, paddingHorizontal: 18, paddingVertical: 8, borderRadius: 99 },
    createBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

    body:    { flex: 1 },
    content: { padding: 20, gap: 20, paddingBottom: 60 },

    errorBox: {
      backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 10,
      borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', padding: 12,
    },
    errorText: { color: '#FCA5A5', fontSize: 13 },

    field:    { gap: 8 },
    label:    { fontSize: 12, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
    required: { color: '#EF4444' },
    subLabel: { fontSize: 12, color: c.textDim, marginTop: 4 },

    input: {
      backgroundColor: c.surface, borderRadius: 14, borderWidth: 1,
      borderColor: c.border2, color: c.text,
      paddingHorizontal: 16, paddingVertical: 13, fontSize: 15,
    },
    textarea: { minHeight: 90 },

    // Date picker button
    dateBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: c.surface, borderRadius: 14, borderWidth: 1,
      borderColor: c.border2, paddingHorizontal: 16, paddingVertical: 13,
    },
    dateBtnText:        { fontSize: 15, color: c.text },
    dateBtnPlaceholder: { fontSize: 15, color: c.textDim },
    dateBtnIcon:        { fontSize: 16 },
    clearDate:   { alignSelf: 'flex-end', marginTop: 4 },
    clearDateText: { fontSize: 12, color: c.textMuted },

    doneBtn: {
      alignSelf: 'flex-end', marginTop: 8,
      backgroundColor: c.brand, paddingHorizontal: 20, paddingVertical: 8, borderRadius: 12,
    },
    doneBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

    // Assignees
    selectedChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    selectedChip: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: 'rgba(99,102,241,0.15)', borderRadius: 99,
      borderWidth: 1, borderColor: c.brand,
      paddingHorizontal: 12, paddingVertical: 7,
    },
    selectedChipText:   { fontSize: 13, color: '#A5B4FC', fontWeight: '600' },
    selectedChipRemove: { fontSize: 12, color: c.brandLight },

    availableChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    availableChip: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99,
      borderWidth: 1, borderColor: c.border2, backgroundColor: c.surface,
    },
    availableChipText: { fontSize: 13, color: c.textMuted },

    noUsers: { fontSize: 13, color: c.textDim, fontStyle: 'italic' },
  });
}
