import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Modal, View, Text, TextInput, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useThemeStore } from '../store/themeStore';
import { darkColors, lightColors, ThemeColors } from '../theme';
import { productsApi, attachmentsApi, commentsApi } from '../api/services';
import { navigationRef } from '../navigation';
import { SharedFile } from '../store/shareStore';
import { Product } from '../types';

type Step = 'pick-order' | 'pick-dest' | 'uploading' | 'done';
type Dest = 'chat' | 'files';

interface UploadState {
  name: string;
  progress: number;
  status: 'pending' | 'uploading' | 'done' | 'error';
  errorMsg?: string;
}

interface Props {
  visible: boolean;
  files: SharedFile[];
  onDone: () => void;
}

export default function SharePickerModal({ visible, files, onDone }: Props) {
  const isDark = useThemeStore((s) => s.isDark);
  const c = isDark ? darkColors : lightColors;
  const styles = useMemo(() => makeStyles(c), [c]);

  const [step, setStep] = useState<Step>('pick-order');
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [uploadStates, setUploadStates] = useState<UploadState[]>([]);

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setStep('pick-order');
      setSearch('');
      setSelectedProduct(null);
      setUploadStates([]);
    }
  }, [visible]);

  // Fetch products for search
  const fetchProducts = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const res = await productsApi.getPaged(q ? { search: q } : undefined, 30);
      setProducts((res as any)?.data?.data ?? []);
    } catch {
      setProducts([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => fetchProducts(search), 250);
    return () => clearTimeout(timer);
  }, [search, visible, fetchProducts]);

  const handleSelectProduct = (product: Product) => {
    setSelectedProduct(product);
    setStep('pick-dest');
  };

  const handlePickDest = async (dest: Dest) => {
    if (!selectedProduct || !files.length) return;
    setStep('uploading');

    const states: UploadState[] = files.map((f) => ({
      name: f.fileName,
      progress: 0,
      status: 'pending',
    }));
    setUploadStates(states);

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      setUploadStates((prev) =>
        prev.map((s, idx) => idx === i ? { ...s, status: 'uploading' } : s)
      );
      try {
        const source = dest === 'chat' ? 'comment' : 'direct';
        const res = await attachmentsApi.uploadWithProgress(
          selectedProduct.id,
          f.uri,
          f.fileName,
          f.fileSize,
          f.mimeType,
          (pct) =>
            setUploadStates((prev) =>
              prev.map((s, idx) => idx === i ? { ...s, progress: pct } : s)
            ),
          source,
        );
        setUploadStates((prev) =>
          prev.map((s, idx) => idx === i ? { ...s, progress: 100, status: 'done' } : s)
        );
        if (dest === 'chat') {
          const att = res.data;
          await commentsApi.create(
            selectedProduct.id,
            `[attachment:${att.id}:${att.file_name}]`,
          );
        }
      } catch (err: any) {
        const msg = err?.response?.data?.error || err?.message || 'Upload failed';
        setUploadStates((prev) =>
          prev.map((s, idx) => idx === i ? { ...s, status: 'error', errorMsg: msg } : s)
        );
      }
    }

    setStep('done');
  };

  const handleFinish = () => {
    if (selectedProduct) {
      const tab = uploadStates[0]?.status !== 'error'
        ? (uploadStates.some((s) => s.status === 'done') ? 'done' : undefined)
        : undefined;
      // Navigate to the product
      if (navigationRef.isReady()) {
        navigationRef.navigate('ProductDetail', { productId: selectedProduct.id });
      }
    }
    onDone();
  };

  const allDone = uploadStates.every((s) => s.status === 'done' || s.status === 'error');

  const STATUS_CHIP: Record<string, { bg: string; text: string }> = {
    yet_to_start: { bg: '#E2E8F0', text: '#475569' },
    working:      { bg: '#DBEAFE', text: '#1D4ED8' },
    review:       { bg: '#FEF3C7', text: '#D97706' },
    done:         { bg: '#D1FAE5', text: '#065F46' },
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onDone}
    >
      <View style={styles.overlay}>
        <SafeAreaView edges={['bottom']} style={styles.sheet}>

          {/* ── Header ── */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              {step === 'pick-dest' && (
                <TouchableOpacity onPress={() => setStep('pick-order')} style={styles.backBtn}>
                  <Feather name="arrow-left" size={18} color={c.text} />
                </TouchableOpacity>
              )}
              <Text style={styles.title}>
                {step === 'pick-order' && `Share ${files.length} file${files.length > 1 ? 's' : ''}`}
                {step === 'pick-dest'  && selectedProduct?.product_id}
                {step === 'uploading'  && 'Uploading…'}
                {step === 'done'       && 'Done'}
              </Text>
            </View>
            {(step === 'pick-order' || step === 'pick-dest') && (
              <TouchableOpacity onPress={onDone} style={styles.closeBtn}>
                <Feather name="x" size={20} color={c.textSec} />
              </TouchableOpacity>
            )}
          </View>

          {/* ── Drag handle ── */}
          <View style={styles.handle} />

          {/* ── Step: Pick Order ── */}
          {step === 'pick-order' && (
            <>
              <View style={styles.searchRow}>
                <Feather name="search" size={16} color={c.textMuted} style={{ marginRight: 8 }} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search orders…"
                  placeholderTextColor={c.textMuted}
                  value={search}
                  onChangeText={setSearch}
                  autoCorrect={false}
                />
                {loading && <ActivityIndicator size="small" color={c.brand} />}
              </View>

              <FlatList
                data={products}
                keyExtractor={(p) => String(p.id)}
                contentContainerStyle={{ paddingBottom: 20 }}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => {
                  const chip = STATUS_CHIP[item.status] ?? STATUS_CHIP.yet_to_start;
                  return (
                    <TouchableOpacity
                      style={styles.productRow}
                      onPress={() => handleSelectProduct(item)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.productInfo}>
                        <Text style={styles.productId} numberOfLines={1}>{item.product_id}</Text>
                        <Text style={styles.customerName} numberOfLines={1}>{item.customer_name}</Text>
                      </View>
                      <View style={[styles.statusChip, { backgroundColor: chip.bg }]}>
                        <Text style={[styles.statusText, { color: chip.text }]}>
                          {item.status.replace('_', ' ')}
                        </Text>
                      </View>
                      <Feather name="chevron-right" size={16} color={c.textMuted} />
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={
                  !loading ? (
                    <View style={styles.emptyBox}>
                      <Text style={styles.emptyText}>No orders found</Text>
                    </View>
                  ) : null
                }
              />
            </>
          )}

          {/* ── Step: Pick Destination ── */}
          {step === 'pick-dest' && (
            <View style={styles.destContainer}>
              <Text style={styles.destHint}>Where should the file{files.length > 1 ? 's' : ''} go?</Text>

              <TouchableOpacity
                style={styles.destCard}
                activeOpacity={0.8}
                onPress={() => handlePickDest('chat')}
              >
                <View style={[styles.destIcon, { backgroundColor: '#EEF2FF' }]}>
                  <Feather name="message-square" size={26} color="#6366F1" />
                </View>
                <View style={styles.destText}>
                  <Text style={styles.destTitle}>Send in Chat</Text>
                  <Text style={styles.destSub}>Appears as a comment with the file attached</Text>
                </View>
                <Feather name="chevron-right" size={18} color={c.textMuted} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.destCard}
                activeOpacity={0.8}
                onPress={() => handlePickDest('files')}
              >
                <View style={[styles.destIcon, { backgroundColor: '#F0FDF4' }]}>
                  <Feather name="folder" size={26} color="#22C55E" />
                </View>
                <View style={styles.destText}>
                  <Text style={styles.destTitle}>Add to Files</Text>
                  <Text style={styles.destSub}>Saved directly to order attachments</Text>
                </View>
                <Feather name="chevron-right" size={18} color={c.textMuted} />
              </TouchableOpacity>
            </View>
          )}

          {/* ── Step: Uploading / Done ── */}
          {(step === 'uploading' || step === 'done') && (
            <View style={styles.uploadContainer}>
              {uploadStates.map((s, i) => (
                <View key={i} style={styles.uploadRow}>
                  <View style={styles.uploadFileIcon}>
                    <Feather name="file" size={18} color={c.textSec} />
                  </View>
                  <View style={styles.uploadInfo}>
                    <Text style={styles.uploadName} numberOfLines={1}>{s.name}</Text>
                    {s.status === 'uploading' && (
                      <View style={styles.progressBar}>
                        <View style={[styles.progressFill, { width: `${s.progress}%` }]} />
                      </View>
                    )}
                    {s.status === 'done' && (
                      <Text style={styles.uploadStatusOk}>Uploaded</Text>
                    )}
                    {s.status === 'error' && (
                      <Text style={styles.uploadStatusErr}>{s.errorMsg}</Text>
                    )}
                    {s.status === 'pending' && (
                      <Text style={styles.uploadStatusPending}>Waiting…</Text>
                    )}
                  </View>
                  {s.status === 'uploading' && (
                    <ActivityIndicator size="small" color={c.brand} />
                  )}
                  {s.status === 'done' && (
                    <Feather name="check-circle" size={18} color="#22C55E" />
                  )}
                  {s.status === 'error' && (
                    <Feather name="alert-circle" size={18} color="#EF4444" />
                  )}
                </View>
              ))}

              {step === 'done' && allDone && (
                <TouchableOpacity style={styles.doneBtn} onPress={handleFinish}>
                  <Text style={styles.doneBtnText}>
                    Open {selectedProduct?.product_id}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: c.card,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      maxHeight: '85%',
    },
    handle: {
      width: 36, height: 4,
      backgroundColor: c.border,
      borderRadius: 99,
      alignSelf: 'center',
      marginBottom: 8,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 4,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flex: 1,
    },
    backBtn: {
      width: 32, height: 32,
      borderRadius: 8,
      backgroundColor: c.bg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      fontSize: 17,
      fontWeight: '700',
      color: c.text,
      flex: 1,
    },
    closeBtn: {
      width: 32, height: 32,
      borderRadius: 99,
      backgroundColor: c.bg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // ── Search ──
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: 16,
      marginVertical: 12,
      backgroundColor: c.bg,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: c.border,
    },
    searchInput: {
      flex: 1,
      fontSize: 14,
      color: c.text,
      padding: 0,
    },
    // ── Product rows ──
    productRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 14,
      gap: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    productInfo: {
      flex: 1,
      gap: 2,
    },
    productId: {
      fontSize: 14,
      fontWeight: '700',
      color: c.text,
    },
    customerName: {
      fontSize: 12,
      color: c.textSec,
    },
    statusChip: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 99,
    },
    statusText: {
      fontSize: 11,
      fontWeight: '600',
      textTransform: 'capitalize',
    },
    emptyBox: {
      paddingVertical: 40,
      alignItems: 'center',
    },
    emptyText: {
      color: c.textMuted,
      fontSize: 14,
    },
    // ── Destination picker ──
    destContainer: {
      paddingHorizontal: 20,
      paddingTop: 8,
      paddingBottom: 8,
      gap: 12,
    },
    destHint: {
      fontSize: 13,
      color: c.textSec,
      marginBottom: 4,
    },
    destCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      padding: 16,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.bg,
    },
    destIcon: {
      width: 52, height: 52,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    destText: {
      flex: 1,
      gap: 3,
    },
    destTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: c.text,
    },
    destSub: {
      fontSize: 12,
      color: c.textSec,
    },
    // ── Upload progress ──
    uploadContainer: {
      paddingHorizontal: 20,
      paddingTop: 12,
      gap: 12,
    },
    uploadRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 14,
      borderRadius: 14,
      backgroundColor: c.bg,
      borderWidth: 1,
      borderColor: c.border,
    },
    uploadFileIcon: {
      width: 36, height: 36,
      borderRadius: 8,
      backgroundColor: c.card,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: c.border,
    },
    uploadInfo: {
      flex: 1,
      gap: 4,
    },
    uploadName: {
      fontSize: 13,
      fontWeight: '600',
      color: c.text,
    },
    progressBar: {
      height: 4,
      backgroundColor: c.border,
      borderRadius: 99,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      backgroundColor: '#6366F1',
      borderRadius: 99,
    },
    uploadStatusOk: {
      fontSize: 11,
      color: '#22C55E',
      fontWeight: '600',
    },
    uploadStatusErr: {
      fontSize: 11,
      color: '#EF4444',
    },
    uploadStatusPending: {
      fontSize: 11,
      color: '#94A3B8',
    },
    doneBtn: {
      marginTop: 8,
      backgroundColor: '#6366F1',
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
    },
    doneBtnText: {
      color: '#fff',
      fontSize: 15,
      fontWeight: '700',
    },
  });
}
