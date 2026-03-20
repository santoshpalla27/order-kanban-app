import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { getAvatarColors, getInitials } from '../utils/helpers';

interface Props {
  name: string;
  avatarUrl?: string;
  size?: number;
}

export default function Avatar({ name, avatarUrl, size = 36 }: Props) {
  const [c1, c2] = getAvatarColors(name);
  const fontSize = size * 0.38;

  if (avatarUrl) {
    return (
      <Image
        source={{ uri: avatarUrl }}
        style={[styles.image, { width: size, height: size, borderRadius: size / 2 }]}
      />
    );
  }

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: c1,
        },
      ]}
    >
      <Text style={[styles.initials, { fontSize, color: '#fff' }]}>
        {getInitials(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    fontWeight: '700',
  },
  image: {
    resizeMode: 'cover',
  },
});
