import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, ActivityIndicator,
  StyleSheet, TextInput, RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { productsApi } from '../api/services';
import { usersApi } from '../api/services';
import { useAuthStore } from '../store/authStore';
import { useWsEvents } from '../hooks/useWsEvents';
import { useProductBadges } from '../hooks/useProductBadges';
import { Product, ProductStatus } from '../types';
import { User } from '../types';
import ProductCard from '../components/ProductCard';
import FilterPanel from '../components/FilterPanel';
import { ProductFilters } from '../store/boardStore';
import { RootStackParamList } from '../navigation';
import { useThemeStore } from '../store/themeStore';
import { darkColors, lightColors, ThemeColors } from '../theme';

const PAGE_SIZE = 50;

const TABS: Array<{ key: string; label: string }> = [
  { key: '',             label: 'All'          },
  { key: 'yet_to_start', label: 'Yet to Start' },
  { key: 'working',      label: 'Working'      },
  { key: 'review',       label: 'In Review'    },
  { key: 'done',         label: 'Done'         },
];

const TAB_COLORS: Record<string, string> = {
  '':           '#818CF8',
  yet_to_start: '#EF4444',
  working:      '#60A5FA',
  review:       '#FBBF24',
  done:         '#34D399',
};

export default function MyOrdersScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuthStore();
  const userId = String(user?.id ?? '');

  const isDark = useThemeStore((s) => s.isDark);
  const c = isDark ? darkColors : lightColors;
  const styles = useMemo(() => makeStyles(c), [c]);

  // assigned_to is always locked to the current user
  const [filters, setFilters] = useState<ProductFilters>({
    search: '', status: '', created_by: '', assigned_to: userId,
    date_from: '', date_to: '', delivery_from: '', delivery_to: '',
  });
  const [showFilters, setShowFilters] = useState(false);
  const [users, setUsers] = useState<User[]>([]);

  // List data
  const [products, setProducts]       = useState<Product[]>([]);
  const [loading, setLoading]         = useState(false);
  const [refreshing, setRefreshing]   = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor]           = useState<number | undefined>(undefined);
  const [hasMore, setHasMore]         = useState(false);
  const [total, setTotal]             = useState(0);

  // Per-tab counts
  const [counts, setCounts] = useState<Record<string, number | null>>({
    '': null, yet_to_start: null, working: null, review: null, done: null,
  });

  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  // Build API params — always inject assigned_to
  const buildParams = useCallback((f: ProductFilters): Record<string, string> => {
    const merged = { ...f, assigned_to: userId };
    return Object.fromEntries(
      Object.entries(merged).filter(([, v]) => v !== ''),
    ) as Record<string, string>;
  }, [userId]);

  const fetchProducts = useCallback(async (f: ProductFilters, append = false) => {
    try {
      const params = buildParams(f);
      const res = await productsApi.getPaged(params, PAGE_SIZE, append ? cursor : undefined);
      const { data: items, next_cursor, has_more, total: t } = res.data;
      setProducts((prev) => append ? [...prev, ...items] : items);
      setCursor(next_cursor ?? undefined);
      setHasMore(has_more);
      setTotal(t);
    } catch (err: any) {
      console.error('my orders fetch error', err?.response?.data || err.message);
    }
  }, [buildParams, cursor]);

  const fetchCounts = useCallback(async (f: ProductFilters) => {
    const base = buildParams({ ...f, status: '' });
    try {
      const results = await Promise.allSettled([
        productsApi.getPaged(base, 1),
        productsApi.getPaged({ ...base, status: 'yet_to_start' }, 1),
        productsApi.getPaged({ ...base, status: 'working' }, 1),
        productsApi.getPaged({ ...base, status: 'review' }, 1),
        productsApi.getPaged({ ...base, status: 'done' }, 1),
      ]);
      const vals = results.map((r) =>
        r.status === 'fulfilled' ? (r.value.data.total ?? null) : null,
      );
      setCounts({
        '': vals[0], yet_to_start: vals[1], working: vals[2], review: vals[3], done: vals[4],
      });
    } catch {}
  }, [buildParams]);

  const load = useCallback(async (f: ProductFilters) => {
    setLoading(true);
    setCursor(undefined);
    await fetchProducts(f, false);
    fetchCounts(f);
    setLoading(false);
  }, [fetchProducts, fetchCounts]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setCursor(undefined);
    await fetchProducts(filtersRef.current, false);
    fetchCounts(filtersRef.current);
    setRefreshing(false);
  }, [fetchProducts, fetchCounts]);

  const handleLoadMore = useCallback(async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    await fetchProducts(filtersRef.current, true);
    setLoadingMore(false);
  }, [hasMore, loadingMore, fetchProducts]);

  useEffect(() => {
    usersApi.getList()
      .then((r) => setUsers(r.data?.users || r.data || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load(filters);
  }, [
    filters.status, filters.search, filters.created_by,
    filters.date_from, filters.date_to, filters.delivery_from, filters.delivery_to,
  ]);

  useWsEvents({ onProductsChanged: () => handleRefresh() });

  const { hasAny } = useProductBadges();

  const handleStatusChange = async (product: Product, newStatus: string) => {
    setProducts((prev) =>
      prev.map((p) =>
        p.id === product.id ? { ...p, status: newStatus as ProductStatus } : p,
      ).filter((p) => {
        if (filtersRef.current.status && filtersRef.current.status !== '') {
          return p.status === filtersRef.current.status;
        }
        return true;
      }),
    );
    try {
      await productsApi.updateStatus(product.id, newStatus);
    } catch {
      handleRefresh();
    }
  };

  // When filter panel applies, re-lock assigned_to to current user
  const handleApplyFilters = (f: ProductFilters) => {
    setFilters((prev) => ({ ...prev, ...f, assigned_to: userId }));
  };

  const activeFilterCount = Object.entries(filters).filter(
    ([k, v]) => k !== 'status' && k !== 'assigned_to' && k !== 'search' && v !== '',
  ).length;

  const hasActiveFilters = activeFilterCount > 0 || filters.search !== '';

  return (
    <View style={styles.screen}>

      {/* Search bar + filter btn */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          value={filters.search}
          onChangeText={(v) => setFilters((f) => ({ ...f, search: v }))}
          placeholder="Search your orders..."
          placeholderTextColor={c.textMuted}
          returnKeyType="search"
        />
        <TouchableOpacity
          style={[styles.filterBtn, hasActiveFilters && styles.filterBtnActive]}
          onPress={() => setShowFilters(true)}
        >
          <Feather name="filter" size={14} color={hasActiveFilters ? c.brand : c.textSec} />
          <Text style={[styles.filterBtnText, hasActiveFilters && { color: c.brand }]}>Filters</Text>
          {activeFilterCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Status tabs */}
      <View style={styles.tabsWrapper}>
        <FlatList
          horizontal
          data={TABS}
          keyExtractor={(t) => t.key}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabs}
          renderItem={({ item: tab }) => {
            const active = filters.status === tab.key;
            const count  = counts[tab.key];
            const color  = TAB_COLORS[tab.key];
            return (
              <TouchableOpacity
                style={[
                  styles.tab,
                  active && { borderColor: color, backgroundColor: color + '22' },
                ]}
                onPress={() => setFilters((f) => ({ ...f, status: tab.key }))}
              >
                {tab.key !== '' && (
                  <View style={[styles.statusDot, { backgroundColor: color }]} />
                )}
                <Text style={[styles.tabText, active && { color }]}>
                  {tab.label}
                </Text>
                {count !== null && (
                  <View style={[styles.countBadge, active && { backgroundColor: color + '33' }]}>
                    <Text style={[styles.countText, active && { color }]}>{count}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {/* Product list */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={c.brand} size="large" />
        </View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(p) => String(p.id)}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={c.brand} />
          }
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="clipboard" size={48} color={c.textMuted} style={{ marginBottom: 4 }} />
              <Text style={styles.emptyTitle}>No orders assigned to you</Text>
              <Text style={styles.emptySubtitle}>
                {filters.search ? 'Try a different search term' : 'Orders assigned to you will appear here'}
              </Text>
            </View>
          }
          ListHeaderComponent={
            products.length > 0 ? (
              <Text style={styles.totalText}>{total} order{total !== 1 ? 's' : ''} assigned to you</Text>
            ) : null
          }
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.loadMoreSpinner}>
                <ActivityIndicator color={c.brand} />
              </View>
            ) : hasMore ? (
              <TouchableOpacity style={styles.loadMoreBtn} onPress={handleLoadMore}>
                <Text style={styles.loadMoreText}>Load more</Text>
              </TouchableOpacity>
            ) : products.length > 0 ? (
              <Text style={styles.allLoaded}>All {products.length} items loaded</Text>
            ) : null
          }
          renderItem={({ item }) => (
            <ProductCard
              product={item}
              onPress={() => navigation.navigate('ProductDetail', { productId: item.id })}
              showStatus
              hasBadge={hasAny(item.id)}
            />
          )}
        />
      )}

      {/* Filter panel — hides "Assigned To" since it's locked */}
      <FilterPanel
        visible={showFilters}
        filters={filters}
        users={users}
        hideAssignedTo
        onApply={handleApplyFilters}
        onClose={() => setShowFilters(false)}
      />
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    searchRow: {
      flexDirection: 'row',
      gap: 10,
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 8,
    },
    searchInput: {
      flex: 1,
      backgroundColor: c.surface,
      borderRadius: 99,
      borderWidth: 1,
      borderColor: c.border2,
      color: c.text,
      paddingHorizontal: 16,
      paddingVertical: 10,
      fontSize: 14,
    },
    filterBtn: {
      backgroundColor: c.surface,
      borderRadius: 99,
      borderWidth: 1,
      borderColor: c.border2,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      justifyContent: 'center',
    },
    filterBtnActive: { borderColor: c.brand, backgroundColor: 'rgba(99,102,241,0.12)' },
    filterBtnText: { color: c.textSec, fontSize: 13, fontWeight: '600' },
    filterBadge: {
      backgroundColor: c.brand,
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 4,
    },
    filterBadgeText: {
      color: '#fff',
      fontSize: 10,
      fontWeight: '800',
    },
    tabsWrapper: { borderBottomWidth: 1, borderBottomColor: c.surface2 },
    tabs: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
    tab: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 99,
      borderWidth: 1,
      borderColor: c.border2,
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginRight: 6,
    },
    tabText: { fontSize: 13, fontWeight: '600', color: c.textMuted },
    countBadge: {
      backgroundColor: c.surface2,
      borderRadius: 99,
      paddingHorizontal: 6,
      paddingVertical: 1,
    },
    countText: { fontSize: 11, fontWeight: '700', color: c.textMuted },
    listContent: { padding: 16, paddingBottom: 100 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    empty: { alignItems: 'center', paddingTop: 80, gap: 8 },
    emptyIcon: { fontSize: 48 },
    emptyTitle: { fontSize: 16, fontWeight: '600', color: c.textSec },
    emptySubtitle: { fontSize: 13, color: c.textMuted, textAlign: 'center', paddingHorizontal: 24 },
    totalText: { fontSize: 12, color: c.textMuted, marginBottom: 10 },
    loadMoreSpinner: { paddingVertical: 16, alignItems: 'center' },
    loadMoreBtn: { paddingVertical: 14, alignItems: 'center' },
    loadMoreText: { color: c.brand, fontWeight: '600', fontSize: 14 },
    allLoaded: { textAlign: 'center', color: c.textDim, fontSize: 12, paddingVertical: 12 },
  });
}
