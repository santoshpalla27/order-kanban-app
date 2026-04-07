import React, { useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, Platform, PanResponder,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNotificationStore } from '../store/notificationStore';
import { useThemeStore } from '../store/themeStore';
import { darkColors, lightColors } from '../theme';
import { Toast } from '../types';
import { navigationRef } from '../navigation';

function toastIcon(type: string): { name: React.ComponentProps<typeof Feather>['name']; color: string } {
  switch (type) {
    case 'comment_added':
    case 'customer_comment_added':
    case 'mention':
      return { name: 'message-circle', color: '#818CF8' };
    case 'attachment_uploaded':
    case 'customer_attachment_uploaded':
      return { name: 'paperclip', color: '#F97316' };
    case 'chat_message':
      return { name: 'message-square', color: '#34D399' };
    case 'status_change':
    case 'activity':
      return { name: 'zap', color: '#FBBF24' };
    case 'product_created':
      return { name: 'package', color: '#60A5FA' };
    default:
      return { name: 'bell', color: '#6366F1' };
  }
}

function handleToastPress(toast: Toast) {
  if (!navigationRef.isReady()) return;
  if (toast.entityType === 'product' && toast.entityId) {
    navigationRef.navigate('ProductDetail', { productId: toast.entityId });
  } else if (toast.entityType === 'chat') {
    navigationRef.navigate('TeamChat');
  }
}

function ToastItem({ toast }: { toast: Toast }) {
  const isDark = useThemeStore((s) => s.isDark);
  const c = isDark ? darkColors : lightColors;
  const removeToast = useNotificationStore((s) => s.removeToast);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-12)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const icon = toastIcon(toast.type);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();
  }, []);

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: -12, duration: 150, useNativeDriver: true }),
    ]).start(() => removeToast(toast.id));
  };

  const swipeDismiss = () => {
    Animated.parallel([
      Animated.timing(translateX, { toValue: 400, duration: 200, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => removeToast(toast.id));
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) => gs.dx > 8 && Math.abs(gs.dy) < Math.abs(gs.dx),
      onPanResponderMove: (_, gs) => {
        if (gs.dx > 0) translateX.setValue(gs.dx);
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dx > 80) {
          swipeDismiss();
        } else {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
      },
    })
  ).current;

  return (
    <Animated.View
      style={[t.card, { backgroundColor: isDark ? '#1E2130' : '#FFFFFF', opacity, transform: [{ translateY }, { translateX }] }]}
      {...panResponder.panHandlers}
    >
      <TouchableOpacity
        style={t.inner}
        activeOpacity={0.85}
        onPress={() => { dismiss(); handleToastPress(toast); }}
      >
        <View style={[t.iconWrap, { backgroundColor: icon.color + '22' }]}>
          <Feather name={icon.name} size={18} color={icon.color} />
        </View>
        <View style={t.textWrap}>
          {!!toast.senderName && (
            <Text style={[t.sender, { color: c.text }]} numberOfLines={1}>
              {toast.senderName}
            </Text>
          )}
          <Text style={[t.msg, { color: toast.senderName ? c.textMuted : c.text }]} numberOfLines={3}>
            {toast.message}
          </Text>
        </View>
        <TouchableOpacity onPress={dismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginTop: 3 }}>
          <Feather name="x" size={14} color={c.textMuted} />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function ToastOverlay() {
  const toasts = useNotificationStore((s) => s.toasts);
  const insets = useSafeAreaInsets();

  if (!toasts.length) return null;

  return (
    <View style={[t.container, { top: insets.top + (Platform.OS === 'android' ? 20 : 16) }]} pointerEvents="box-none">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </View>
  );
}

const t = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 9999,
    gap: 8,
  },
  card: {
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.15)',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    gap: 12,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  textWrap: {
    flex: 1,
    gap: 2,
  },
  sender: {
    fontSize: 14,
    fontWeight: '600',
  },
  msg: {
    fontSize: 13,
    lineHeight: 18,
  },
});
