import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useThemeStore } from '../../store/themeStore';
import { darkColors, lightColors, ThemeColors } from '../../theme';
import { formatRelative, formatFileSize, stripMentions } from '../../utils/helpers';
import Avatar from '../Avatar';
import { STATUS_LABELS } from '../../types';

export interface TimelineActor {
  id: number;
  name: string;
  avatar_url?: string;
}

export interface TimelineItemData {
  id: string;
  type: 'comment' | 'customer_message' | 'status_change' | 'attachment' | 'system';
  source: 'internal' | 'customer' | 'system';
  actor: TimelineActor;
  content: string;
  metadata?: {
    attachment_id?: number;
    attachment_name?: string;
    attachment_type?: string;
    attachment_size?: number;
    view_url?: string;
    from?: string;
    to?: string;
    action?: string;
  };
  comment_id?: number;
  created_at: string;
}

interface Props {
  item: TimelineItemData;
  currentUserId: number;
  onLongPress?: (item: TimelineItemData) => void;
  onImagePress?: (url: string, name: string) => void;
  onDownload?: (attachmentId: number | undefined, fallbackUrl?: string, name?: string) => void;
}

// ── Parse raw comment content into display parts ───────────────────────────

function parseContent(raw: string): { text: string; replyPreview?: string } {
  const lines = raw.split('\n');
  const textLines: string[] = [];
  let replyPreview: string | undefined;

  for (const line of lines) {
    if (/^\[attachment:\d+:.+\]$/.test(line)) continue;
    const replyMatch = line.match(/^\[reply:\d+(?::(.+))?\]$/);
    if (replyMatch) {
      if (replyMatch[1]) replyPreview = replyMatch[1];
      continue;
    }
    textLines.push(line);
  }
  return { text: stripMentions(textLines.join('\n').trim()), replyPreview };
}

function fileEmoji(type: string): string {
  const t = (type || '').toLowerCase();
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(t)) return '🖼';
  if (t === '.pdf') return '📄';
  if (['.doc', '.docx'].includes(t)) return '📝';
  if (['.xls', '.xlsx', '.csv'].includes(t)) return '📊';
  if (['.zip', '.rar'].includes(t)) return '🗜';
  return '📎';
}

export default function TimelineItem({ item, currentUserId, onLongPress, onImagePress, onDownload }: Props) {
  const isDark = useThemeStore((s) => s.isDark);
  const c = isDark ? darkColors : lightColors;
  const styles = useMemo(() => makeStyles(c), [c]);

  // ── Status change pill ──────────────────────────────────────────────────────
  if (item.type === 'status_change') {
    const from = (STATUS_LABELS as any)[item.metadata?.from || ''] || item.metadata?.from || '';
    const to   = (STATUS_LABELS as any)[item.metadata?.to   || ''] || item.metadata?.to   || '';
    return (
      <View style={styles.pillRow}>
        <View style={styles.statusPill}>
          <Text style={styles.pillText}>
            {item.actor.name}{from && to ? ` moved ${from} → ${to}` : ''} · {formatRelative(item.created_at)}
          </Text>
        </View>
      </View>
    );
  }

  // ── System pill ─────────────────────────────────────────────────────────────
  if (item.type === 'system') {
    return (
      <View style={styles.pillRow}>
        <Text style={styles.systemText}>
          {item.content} · {formatRelative(item.created_at)}
        </Text>
      </View>
    );
  }

  // ── Standalone attachment (source=direct) ───────────────────────────────────
  if (item.type === 'attachment' && !item.comment_id) {
    const { attachment_name, attachment_type, attachment_size, view_url, attachment_id } = item.metadata || {};
    const isImg = /\.(jpg|jpeg|png|gif|webp)$/i.test(attachment_type || '');
    return (
      <View style={styles.attRow}>
        <Avatar name={item.actor.name || 'T'} size={28} />
        <View style={{ flex: 1 }}>
          <Text style={styles.attActorLine}>
            {item.actor.name || 'Team'}{' '}
            <Text style={styles.attActorSub}>uploaded · {formatRelative(item.created_at)}</Text>
          </Text>
          {isImg && view_url ? (
            <TouchableOpacity
              onPress={() => onImagePress?.(view_url, attachment_name || '')}
              activeOpacity={0.85}
              style={{ marginTop: 6 }}
            >
              <View style={{ position: 'relative' }}>
                <Image source={{ uri: view_url }} style={styles.attImage} resizeMode="cover" />
                {attachment_name ? (
                  <View style={styles.attImageLabel}>
                    <Text style={styles.attImageLabelText} numberOfLines={1}>{attachment_name}</Text>
                  </View>
                ) : null}
              </View>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.attFileCard}
              onPress={() => onDownload?.(attachment_id, view_url, attachment_name)}
              activeOpacity={0.85}
            >
              <Text style={{ fontSize: 20 }}>{fileEmoji(attachment_type || '')}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.attFileName} numberOfLines={1}>{attachment_name || 'File'}</Text>
                {attachment_size ? (
                  <Text style={styles.attFileMeta}>{formatFileSize(attachment_size)}</Text>
                ) : null}
              </View>
              <Feather name="download" size={16} color={c.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  // ── Comment / customer_message bubble ────────────────────────────────────────
  const isOwn     = item.type === 'comment' && item.actor.id === currentUserId;
  const isCustomer = item.type === 'customer_message';
  const { text, replyPreview } = parseContent(item.content);
  const { attachment_name, attachment_type, view_url, attachment_id, attachment_size } = item.metadata || {};
  const hasAtt    = !!attachment_name;
  const attIsImg  = /\.(jpg|jpeg|png|gif|webp)$/i.test(attachment_type || '');

  return (
    <TouchableOpacity
      activeOpacity={onLongPress ? 0.85 : 1}
      onLongPress={onLongPress ? () => onLongPress(item) : undefined}
      style={[styles.bubbleRow, isOwn ? styles.bubbleRowOwn : styles.bubbleRowOther]}
    >
      {!isOwn && (
        <View style={styles.avatarWrap}>
          {isCustomer ? (
            <View style={styles.customerAvatar}>
              <Text style={styles.customerAvatarText}>{(item.actor.name || 'C').charAt(0).toUpperCase()}</Text>
            </View>
          ) : (
            <Avatar name={item.actor.name} avatarUrl={item.actor.avatar_url} size={28} />
          )}
        </View>
      )}

      <View style={[styles.bubbleWrap, isOwn ? styles.bubbleWrapOwn : styles.bubbleWrapOther]}>
        {!isOwn && (
          <Text style={[styles.senderName, isCustomer ? styles.senderNameCustomer : styles.senderNameOther]}>
            {item.actor.name}
          </Text>
        )}

        <View style={[styles.bubble, isOwn ? styles.bubbleOwn : isCustomer ? styles.bubbleCustomer : styles.bubbleOther]}>
          {/* Reply quote */}
          {replyPreview ? (
            <View style={[styles.replyQuote, isOwn ? styles.replyQuoteOwn : isCustomer ? styles.replyQuoteCustomer : styles.replyQuoteOther]}>
              <Text style={styles.replyQuoteText} numberOfLines={2}>{replyPreview}</Text>
            </View>
          ) : null}

          {/* Attachment in bubble */}
          {hasAtt && attIsImg && view_url ? (
            <TouchableOpacity
              onPress={() => onImagePress?.(view_url, attachment_name || '')}
              style={styles.attThumb}
              activeOpacity={0.85}
            >
              <Image source={{ uri: view_url }} style={styles.attThumbImg} resizeMode="cover" />
              {attachment_name ? (
                <View style={styles.attThumbOverlay}>
                  <Text style={styles.attThumbName} numberOfLines={1}>{attachment_name}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          ) : hasAtt ? (
            <TouchableOpacity
              style={[styles.attFile, isOwn ? styles.attFileOwn : isCustomer ? styles.attFileCustomer : styles.attFileOther]}
              onPress={() => onDownload?.(attachment_id, view_url, attachment_name)}
            >
              <Text style={{ fontSize: 16 }}>{fileEmoji(attachment_type || '')}</Text>
              <Text
                style={[styles.attFileLabelText, isOwn ? { color: 'rgba(255,255,255,0.85)' } : { color: c.text }]}
                numberOfLines={1}
              >
                {attachment_name}
              </Text>
              {attachment_size ? (
                <Text style={[styles.attFileMeta2, isOwn ? { color: 'rgba(255,255,255,0.6)' } : { color: c.textMuted }]}>
                  {formatFileSize(attachment_size)}
                </Text>
              ) : null}
            </TouchableOpacity>
          ) : null}

          {/* Text */}
          {!!text && (
            <Text style={[styles.msgText, isOwn ? styles.msgTextOwn : styles.msgTextOther]}>
              {text}
            </Text>
          )}

          {/* Timestamp */}
          <Text style={[styles.timestamp, isOwn ? styles.timestampOwn : styles.timestampOther]}>
            {formatRelative(item.created_at)}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    pillRow: { alignItems: 'center', marginVertical: 8, paddingHorizontal: 16 },
    statusPill: {
      backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2,
      borderRadius: 99, paddingHorizontal: 14, paddingVertical: 5,
    },
    pillText: { fontSize: 12, color: c.textMuted, textAlign: 'center' },
    systemText: { fontSize: 11, color: c.textMuted, textAlign: 'center', fontStyle: 'italic' },

    attRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginVertical: 4, alignItems: 'flex-start' },
    attActorLine: { fontSize: 13, fontWeight: '700', color: c.text },
    attActorSub: { fontSize: 11, fontWeight: '400', color: c.textMuted },
    attImage: { width: '100%', height: 180, borderRadius: 12, overflow: 'hidden' },
    attImageLabel: {
      position: 'absolute', bottom: 0, left: 0, right: 0,
      backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 8, paddingVertical: 4,
      borderBottomLeftRadius: 12, borderBottomRightRadius: 12,
    },
    attImageLabelText: { fontSize: 10, color: '#fff' },
    attFileCard: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: c.surface, borderRadius: 12, padding: 12,
      borderWidth: 1, borderColor: c.border2, marginTop: 6,
    },
    attFileName: { fontSize: 13, fontWeight: '600', color: c.text },
    attFileMeta: { fontSize: 11, color: c.textMuted, marginTop: 1 },

    bubbleRow: { flexDirection: 'row', marginVertical: 2, paddingHorizontal: 12, alignItems: 'flex-end' },
    bubbleRowOwn: { justifyContent: 'flex-end' },
    bubbleRowOther: { justifyContent: 'flex-start' },
    avatarWrap: { marginRight: 6, marginBottom: 2 },
    customerAvatar: {
      width: 28, height: 28, borderRadius: 14,
      backgroundColor: '#25D366', alignItems: 'center', justifyContent: 'center',
    },
    customerAvatarText: { fontSize: 12, fontWeight: '700', color: '#fff' },
    bubbleWrap: { maxWidth: '78%', gap: 2 },
    bubbleWrapOwn: { alignItems: 'flex-end' },
    bubbleWrapOther: { alignItems: 'flex-start' },
    senderName: { fontSize: 11, fontWeight: '700', marginLeft: 4 },
    senderNameOther: { color: c.brandLight },
    senderNameCustomer: { color: '#25D366' },
    bubble: { borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8, paddingBottom: 6 },
    bubbleOwn: { backgroundColor: c.brand, borderBottomRightRadius: 4 },
    bubbleOther: { backgroundColor: c.surface2, borderWidth: 1, borderColor: c.border2, borderBottomLeftRadius: 4 },
    bubbleCustomer: {
      backgroundColor: 'rgba(37,211,102,0.08)',
      borderWidth: 1, borderColor: 'rgba(37,211,102,0.2)', borderBottomLeftRadius: 4,
    },
    replyQuote: { borderLeftWidth: 3, paddingLeft: 8, marginBottom: 6, borderRadius: 4, paddingVertical: 3 },
    replyQuoteOwn: { borderLeftColor: 'rgba(255,255,255,0.4)', backgroundColor: 'rgba(255,255,255,0.08)' },
    replyQuoteOther: { borderLeftColor: c.brand, backgroundColor: 'rgba(99,102,241,0.06)' },
    replyQuoteCustomer: { borderLeftColor: '#25D366', backgroundColor: 'rgba(37,211,102,0.06)' },
    replyQuoteText: { fontSize: 11, color: c.textSec, fontStyle: 'italic' },
    attThumb: { borderRadius: 10, overflow: 'hidden', marginTop: 4, marginBottom: 2, width: 140, height: 140 },
    attThumbImg: { width: '100%', height: '100%' },
    attThumbOverlay: {
      position: 'absolute', bottom: 0, left: 0, right: 0,
      backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 6, paddingVertical: 3,
    },
    attThumbName: { fontSize: 10, color: '#fff' },
    attFile: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, padding: 8, marginTop: 4 },
    attFileOwn: { backgroundColor: 'rgba(255,255,255,0.1)' },
    attFileOther: { backgroundColor: c.surface },
    attFileCustomer: { backgroundColor: 'rgba(37,211,102,0.08)' },
    attFileLabelText: { flex: 1, fontSize: 12 },
    attFileMeta2: { fontSize: 10 },
    msgText: { fontSize: 14, lineHeight: 20 },
    msgTextOwn: { color: '#fff' },
    msgTextOther: { color: c.text },
    timestamp: { fontSize: 10, marginTop: 3 },
    timestampOwn: { color: 'rgba(255,255,255,0.55)', textAlign: 'right' },
    timestampOther: { color: c.textMuted },
  });
}
