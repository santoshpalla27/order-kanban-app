import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { ProductStatus, STATUS_LABELS, STATUS_COLORS, STATUS_ORDER } from '../types';

interface Props {
  status: ProductStatus;
  onPress?: () => void;
  size?: 'sm' | 'md';
}

export default function StatusChip({ status, onPress, size = 'md' }: Props) {
  const colors = STATUS_COLORS[status];
  const label = STATUS_LABELS[status];

  const chip = (
    <View
      style={[
        styles.chip,
        size === 'sm' && styles.chipSm,
        {
          backgroundColor: colors.bg,
          borderColor: colors.border,
        },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: colors.dot }]} />
      <Text style={[styles.label, size === 'sm' && styles.labelSm, { color: colors.text }]}>
        {label}
      </Text>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {chip}
      </TouchableOpacity>
    );
  }
  return chip;
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 99,
    borderWidth: 1,
  },
  chipSm: {
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 99,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
  labelSm: {
    fontSize: 11,
  },
});
