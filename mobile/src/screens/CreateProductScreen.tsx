import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, SafeAreaView, KeyboardAvoidingView, Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useNavigation } from '@react-navigation/native';
import { productsApi, usersApi } from '../api/services';
import { User } from '../types';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function CreateProductScreen() {
  const navigation = useNavigation();

  const [productId, setProductId]       = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [description, setDescription]   = useState('');
  const [deliveryAt, setDeliveryAt]     = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
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
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
            <Text style={s.backIcon}>←</Text>
          </TouchableOpacity>
          <Text style={s.title}>📦  New Product</Text>
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
              placeholderTextColor="#475569"
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
              placeholderTextColor="#475569"
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
              placeholderTextColor="#475569"
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
              placeholderTextColor="#475569"
              multiline
              textAlignVertical="top"
            />
          </View>

          {/* Delivery Date & Time */}
          <View style={s.field}>
            <Text style={s.label}>Delivery Date &amp; Time</Text>
            <TouchableOpacity style={s.dateBtn} onPress={() => setShowDatePicker(true)}>
              <Text style={deliveryAt ? s.dateBtnText : s.dateBtnPlaceholder}>
                {deliveryAt ? formatDateTime(deliveryAt.toISOString()) : 'Pick date & time'}
              </Text>
              <Text style={s.dateBtnIcon}>📅</Text>
            </TouchableOpacity>
            {deliveryAt && (
              <TouchableOpacity style={s.clearDate} onPress={() => setDeliveryAt(null)}>
                <Text style={s.clearDateText}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Native datetime picker */}
          {showDatePicker && (
            <DateTimePicker
              mode="datetime"
              value={deliveryAt ?? new Date()}
              minimumDate={new Date()}
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              onChange={(_e, selected) => {
                if (Platform.OS !== 'ios') setShowDatePicker(false);
                if (selected) setDeliveryAt(selected);
              }}
            />
          )}
          {/* iOS: confirm button to close inline picker */}
          {showDatePicker && Platform.OS === 'ios' && (
            <TouchableOpacity style={s.doneBtn} onPress={() => setShowDatePicker(false)}>
              <Text style={s.doneBtnText}>Done</Text>
            </TouchableOpacity>
          )}

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
                      <Text style={s.selectedChipRemove}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {/* Unselected users — tappable chips */}
            {availableUsers.length > 0 && (
              <>
                <Text style={s.subLabel}>
                  {selectedUsers.length > 0 ? 'Add more' : '+ Add assignee'}
                </Text>
                <View style={s.availableChips}>
                  {availableUsers.map((u) => (
                    <TouchableOpacity key={u.id} style={s.availableChip} onPress={() => addAssignee(u.id)}>
                      <Text style={s.availableChipText}>+ {u.name}</Text>
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

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0A0D14' },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#1E2535',
  },
  backBtn:       { padding: 4 },
  backIcon:      { fontSize: 22, color: '#94A3B8' },
  title:         { flex: 1, fontSize: 17, fontWeight: '700', color: '#F1F5F9' },
  createBtn:     { backgroundColor: '#6366F1', paddingHorizontal: 18, paddingVertical: 8, borderRadius: 10 },
  createBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  body:    { flex: 1 },
  content: { padding: 20, gap: 20, paddingBottom: 60 },

  errorBox: {
    backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', padding: 12,
  },
  errorText: { color: '#FCA5A5', fontSize: 13 },

  field:    { gap: 8 },
  label:    { fontSize: 12, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5 },
  required: { color: '#EF4444' },
  subLabel: { fontSize: 12, color: '#475569', marginTop: 4 },

  input: {
    backgroundColor: '#1C2130', borderRadius: 12, borderWidth: 1,
    borderColor: '#2D3748', color: '#F1F5F9',
    paddingHorizontal: 16, paddingVertical: 13, fontSize: 15,
  },
  textarea: { minHeight: 90 },

  // Date picker button
  dateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#1C2130', borderRadius: 12, borderWidth: 1,
    borderColor: '#2D3748', paddingHorizontal: 16, paddingVertical: 13,
  },
  dateBtnText:        { fontSize: 15, color: '#F1F5F9' },
  dateBtnPlaceholder: { fontSize: 15, color: '#475569' },
  dateBtnIcon:        { fontSize: 16 },
  clearDate:   { alignSelf: 'flex-end', marginTop: 4 },
  clearDateText: { fontSize: 12, color: '#64748B' },

  doneBtn: {
    alignSelf: 'flex-end', marginTop: 8,
    backgroundColor: '#6366F1', paddingHorizontal: 20, paddingVertical: 8, borderRadius: 10,
  },
  doneBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // Assignees
  selectedChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  selectedChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(99,102,241,0.15)', borderRadius: 99,
    borderWidth: 1, borderColor: '#6366F1',
    paddingHorizontal: 12, paddingVertical: 7,
  },
  selectedChipText:   { fontSize: 13, color: '#A5B4FC', fontWeight: '600' },
  selectedChipRemove: { fontSize: 12, color: '#818CF8' },

  availableChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  availableChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99,
    borderWidth: 1, borderColor: '#2D3748', backgroundColor: '#1C2130',
  },
  availableChipText: { fontSize: 13, color: '#64748B' },

  noUsers: { fontSize: 13, color: '#475569', fontStyle: 'italic' },
});
