import { useState } from 'react';
import {
  ArrowRight, Paperclip, User, Download, Image, FileText, File,
  MessageSquare, Edit2, Trash2, Reply, MoreVertical,
} from 'lucide-react';
import { formatTime, formatDate } from '../../utils/date';
import { renderWithMentions } from '../MentionInput';
import { useAuthStore } from '../../store/authStore';
import { attachmentsApi } from '../../api/client';

export interface TimelineItemData {
  id: string;
  type: 'comment' | 'customer_message' | 'status_change' | 'attachment' | 'system';
  source: 'internal' | 'customer' | 'system';
  actor: { id?: number; name: string; avatar_url?: string };
  content: string;
  metadata?: Record<string, any>;
  comment_id?: number;
  created_at: string;
}

interface Props {
  item: TimelineItemData;
  allItems: TimelineItemData[];
  onReply?: (item: TimelineItemData) => void;
  onEdit?: (item: TimelineItemData) => void;
  onDelete?: (item: TimelineItemData) => void;
  editingId?: string | null;
  editValue?: string;
  onEditChange?: (v: string) => void;
  onEditSave?: () => void;
  onEditCancel?: () => void;
  highlightedId?: string | null;
  itemRef?: (el: HTMLDivElement | null) => void;
}

async function downloadViaFetch(url: string, filename: string) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${useAuthStore.getState().token}` } });
  if (!res.ok) throw new Error('Download failed');
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    const { url: signed } = await res.json();
    const a = document.createElement('a'); a.href = signed; a.download = filename; a.target = '_blank';
    document.body.appendChild(a); a.click(); setTimeout(() => document.body.removeChild(a), 1000);
    return;
  }
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = blobUrl; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(blobUrl); }, 1000);
}

function isImageExt(ext: string) {
  return ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext?.toLowerCase());
}

function fileIcon(ext: string) {
  if (isImageExt(ext)) return Image;
  if (['.pdf', '.doc', '.docx', '.txt'].includes(ext?.toLowerCase())) return FileText;
  return File;
}

// ── Status change pill ──
function StatusChangePill({ item }: { item: TimelineItemData }) {
  const from = item.metadata?.from as string | undefined;
  const to = item.metadata?.to as string | undefined;
  return (
    <div className="flex justify-center my-2">
      <div className="flex items-center gap-2 text-xs text-surface-400 bg-surface-800/60 border border-surface-700/40 rounded-full px-3 py-1">
        <span className="font-medium text-surface-300">{item.actor.name}</span>
        {from && to ? (
          <>
            <span>moved</span>
            <span className="font-semibold text-surface-200">{from}</span>
            <ArrowRight className="w-3 h-3 text-surface-500" />
            <span className="font-semibold text-brand-300">{to}</span>
          </>
        ) : (
          <span>{item.content}</span>
        )}
        <span className="text-surface-600">·</span>
        <span>{formatTime(item.created_at)}</span>
      </div>
    </div>
  );
}

// ── System pill (created / updated / deleted / restored) ──
function SystemPill({ item }: { item: TimelineItemData }) {
  return (
    <div className="flex justify-center my-1">
      <span className="text-[11px] text-surface-600 bg-surface-800/40 rounded-full px-3 py-0.5">
        {item.content} · {formatDate(item.created_at)}
      </span>
    </div>
  );
}

// ── Attachment card ──
function AttachmentCard({ item }: { item: TimelineItemData }) {
  const m = item.metadata || {};
  const isImg = isImageExt(m.attachment_type as string);
  const Icon = fileIcon(m.attachment_type as string);
  const [lightbox, setLightbox] = useState(false);
  const isCustomer = item.source === 'customer';

  return (
    <div className={`flex gap-2 my-2 ${isCustomer ? 'flex-row-reverse' : ''}`}>
      {/* small avatar */}
      <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white mt-auto mb-1 ${isCustomer ? 'bg-teal-600' : 'bg-gradient-to-br from-brand-400 to-purple-500'}`}>
        {isCustomer ? <User className="w-3.5 h-3.5" /> : (item.actor.name?.charAt(0) || '?')}
      </div>
      <div className={`flex flex-col max-w-[75%] ${isCustomer ? 'items-end' : 'items-start'}`}>
        <div className="flex items-baseline gap-2 mb-1 px-1">
          <span className="text-[11px] font-medium text-surface-400">{item.actor.name}</span>
          <span className="text-[10px] text-surface-500">{formatTime(item.created_at)}</span>
        </div>
        {isImg && m.view_url ? (
          <div className="relative w-[160px] aspect-square rounded-xl overflow-hidden border border-surface-700/50 cursor-pointer group" onClick={() => setLightbox(true)}>
            <img src={m.view_url as string} alt={m.attachment_name as string} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
              <Download className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
        ) : (
          <button
            onClick={() => m.attachment_id && downloadViaFetch(attachmentsApi.download(m.attachment_id as number), m.attachment_name as string)}
            className="flex items-center gap-2.5 p-2.5 bg-surface-800/60 hover:bg-surface-700/60 border border-surface-700/50 rounded-xl transition-colors text-left w-[220px]"
          >
            <div className="w-8 h-8 rounded-lg bg-surface-700 flex items-center justify-center flex-shrink-0">
              <Icon className="w-4 h-4 text-surface-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-surface-200 truncate">{m.attachment_name as string || 'File'}</p>
              <p className="text-xs text-surface-500 flex items-center gap-1"><Paperclip className="w-3 h-3" /> attachment</p>
            </div>
            <Download className="w-3.5 h-3.5 text-surface-500 flex-shrink-0" />
          </button>
        )}
        {lightbox && m.view_url && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setLightbox(false)}>
            <div className="relative max-w-4xl max-h-[90vh]" onClick={e => e.stopPropagation()}>
              <img src={m.view_url as string} alt={m.attachment_name as string} className="max-w-full max-h-[85vh] object-contain rounded-xl" />
              <div className="absolute top-3 right-3 flex gap-2">
                <button onClick={() => m.attachment_id && downloadViaFetch(attachmentsApi.download(m.attachment_id as number), m.attachment_name as string)} className="bg-white/90 p-2 rounded-lg hover:bg-white shadow-lg">
                  <Download className="w-5 h-5 text-gray-800" />
                </button>
                <button onClick={() => setLightbox(false)} className="bg-white/90 p-2 rounded-lg hover:bg-white shadow-lg text-gray-800 font-bold text-lg leading-none px-3">×</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helpers for parsing comment content ──
interface Parsed { text: string; attachmentId?: number; attachmentName?: string; replyToId?: number; replyPreview?: string; }
function parseContent(raw: string): Parsed {
  const result: Parsed = { text: '' };
  const lines = raw.split('\n');
  const textLines: string[] = [];
  for (const line of lines) {
    const att = line.match(/^\[attachment:(.+):(.+?)\]$/);
    if (att) { const n = parseInt(att[1]); if (!isNaN(n)) result.attachmentId = n; result.attachmentName = att[2]; continue; }
    const rep = line.match(/^\[reply:(\d+)(?::(.+?))?\]$/);
    if (rep) { result.replyToId = parseInt(rep[1]); if (rep[2]) result.replyPreview = rep[2]; continue; }
    if (/^💬 \[Re:/.test(line) || /^📎 \/uploads\//.test(line)) continue;
    textLines.push(line);
  }
  result.text = textLines.join('\n').trim();
  return result;
}

// ── Chat-bubble item (comment or customer_message) ──
function BubbleItem({ item, allItems, onReply, onEdit, onDelete, editingId, editValue, onEditChange, onEditSave, onEditCancel, highlightedId, itemRef }: Props) {
  const user = useAuthStore((s) => s.user);
  const isCustomer = item.source === 'customer';
  const isOwn = !isCustomer && item.actor.id === user?.id;
  const [menuOpen, setMenuOpen] = useState(false);
  const parsed = parseContent(item.content);
  const isEditing = editingId === item.id;
  const isHighlighted = highlightedId === item.id;

  // Resolve reply-to item
  const repliedItem = parsed.replyToId ? allItems.find(i => i.comment_id === parsed.replyToId) : null;
  const repliedParsed = repliedItem ? parseContent(repliedItem.content) : null;

  return (
    <div
      ref={itemRef}
      className={`group flex gap-2 w-full rounded-lg transition-colors duration-500 ${isOwn ? 'justify-end' : 'justify-start'} ${isCustomer ? 'justify-start' : ''}`}
      style={{ background: isHighlighted ? 'rgba(99,102,241,0.15)' : 'transparent', padding: '2px 0' }}
    >
      {/* Avatar for others */}
      {!isOwn && (
        <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white mt-auto mb-1 shadow-sm ${isCustomer ? 'bg-teal-600' : 'bg-gradient-to-br from-brand-400 to-purple-500'}`}>
          {isCustomer ? <User className="w-3.5 h-3.5" /> : (item.actor.name?.charAt(0)?.toUpperCase() || '?')}
        </div>
      )}

      {/* Left-side menu for own messages */}
      {isOwn && !isEditing && (
        <div className="flex flex-col justify-center opacity-0 group-hover:opacity-100 transition-opacity px-1">
          <div className="relative">
            <button onClick={() => setMenuOpen(!menuOpen)} className="btn-ghost p-1 rounded-full bg-surface-800/80 shadow-sm border border-surface-700/50 hover:bg-surface-700">
              <MoreVertical className="w-3.5 h-3.5 text-surface-400" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-8 z-10 glass rounded-lg py-1 min-w-[120px] shadow-xl animate-scale-in">
                {onReply && <button onClick={() => { onReply(item); setMenuOpen(false); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-surface-300 hover:bg-surface-700/50"><Reply className="w-3 h-3" /> Reply</button>}
                {onEdit && <button onClick={() => { onEdit(item); setMenuOpen(false); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-surface-300 hover:bg-surface-700/50"><Edit2 className="w-3 h-3" /> Edit</button>}
                {onDelete && <button onClick={() => { onDelete(item); setMenuOpen(false); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-surface-700/50"><Trash2 className="w-3 h-3" /> Delete</button>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bubble */}
      <div className={`flex flex-col max-w-[85%] ${isOwn ? 'items-end' : 'items-start'}`}>
        <div className={`flex items-baseline gap-2 mb-1 px-1 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
          {!isOwn && <span className="text-[11px] font-medium text-surface-400">{item.actor.name}</span>}
          {isCustomer && <span className="text-[10px] text-teal-400 font-medium">Customer</span>}
          <span className="text-[10px] text-surface-500">{formatTime(item.created_at)}</span>
        </div>
        <div className={`relative px-3.5 py-2 shadow-sm ${
          isOwn ? 'bg-brand-600 text-white rounded-2xl rounded-tr-sm'
          : isCustomer ? 'bg-teal-900/40 border border-teal-700/40 rounded-2xl rounded-tl-sm text-surface-200'
          : 'text-surface-200 rounded-2xl rounded-tl-sm border border-surface-700/50'
        }`}>
          {/* Reply reference */}
          {parsed.replyToId && parsed.replyPreview && (
            <div className={`mb-1.5 flex items-center gap-1.5 rounded-lg overflow-hidden border-l-2 px-2.5 py-1.5 text-xs cursor-pointer hover:brightness-95 ${isOwn ? 'bg-black/10 border-white/40 text-white/90' : 'bg-surface-900/60 border-brand-500/50 text-surface-300'}`}>
              <Reply className="w-3 h-3 flex-shrink-0 rotate-180" />
              <span className="truncate">{repliedParsed?.text || parsed.replyPreview}</span>
            </div>
          )}

          {isEditing ? (
            <div className="flex gap-2">
              <input value={editValue} onChange={(e) => onEditChange?.(e.target.value)} className={`text-sm rounded px-2 py-1 min-w-[200px] ${isOwn ? 'bg-black/20 border border-white/20 text-white' : 'bg-surface-900 border border-surface-700 text-surface-200'}`} autoFocus />
              <div className="flex flex-col gap-1">
                <button onClick={onEditSave} className={`text-[10px] px-2 py-0.5 rounded font-bold ${isOwn ? 'bg-white text-brand-600' : 'bg-brand-500 text-white'}`}>Save</button>
                <button onClick={onEditCancel} className={`text-[10px] px-2 py-0.5 rounded ${isOwn ? 'bg-black/30 text-white' : 'bg-surface-700 text-surface-300'}`}>Cancel</button>
              </div>
            </div>
          ) : (
            <>
              {parsed.text && (
                <p className={`text-sm whitespace-pre-wrap ${isOwn ? 'text-white/95' : 'text-surface-200'}`}>
                  {renderWithMentions(parsed.text, user?.name, undefined, isOwn)}
                </p>
              )}
              {!parsed.text && !parsed.attachmentId && (
                <p className={`text-sm italic ${isOwn ? 'text-white/60' : 'text-surface-500'}`}>(attachment)</p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Right-side menu for others' messages */}
      {!isOwn && !isEditing && (
        <div className="flex flex-col justify-center opacity-0 group-hover:opacity-100 transition-opacity px-1">
          <div className="relative">
            {onReply && (
              <button onClick={() => onReply(item)} className="btn-ghost p-1 rounded-full bg-surface-800/80 shadow-sm border border-surface-700/50 hover:bg-surface-700">
                <Reply className="w-3.5 h-3.5 text-surface-400" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function TimelineItem(props: Props) {
  const { item } = props;
  if (item.type === 'status_change') return <StatusChangePill item={item} />;
  if (item.type === 'system') return <SystemPill item={item} />;
  if (item.type === 'attachment') return <AttachmentCard item={item} />;
  return <BubbleItem {...props} />;
}
