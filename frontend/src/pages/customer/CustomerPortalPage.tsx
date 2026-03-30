import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { customerPortalApi } from '../../api/client';
import { CustomerMessage, Attachment } from '../../types';
import {
  Send, Paperclip, X, ChevronDown, ChevronUp, Image,
  FileText, File, Reply, Loader2,
} from 'lucide-react';

// ── Helpers ───────────────────────────────────────────────────────────────────

const isImageType = (type: string) =>
  ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.heic'].includes(type.toLowerCase());

const parseMessage = (raw: string): { text: string; attachmentId?: number; attachmentName?: string } => {
  const lines = raw.split('\n');
  let attachmentId: number | undefined;
  let attachmentName: string | undefined;
  const textLines: string[] = [];
  for (const line of lines) {
    const attMatch = line.match(/^\[attachment:(\d+):(.+)\]$/);
    if (attMatch) { attachmentId = Number(attMatch[1]); attachmentName = attMatch[2]; continue; }
    const replyMatch = line.match(/^\[reply:(\d+):(.+)\]$/);
    if (replyMatch) { continue; }
    textLines.push(line);
  }
  return { text: textLines.join('\n').trim(), attachmentId, attachmentName };
};

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const formatDate = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
};

// ── Status ────────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  yet_to_start: 'Yet to Start',
  working:      'In Progress',
  review:       'Under Review',
  done:         'Completed',
};
const STATUS_COLORS: Record<string, string> = {
  yet_to_start: 'bg-slate-100 text-slate-600',
  working:      'bg-blue-100 text-blue-700',
  review:       'bg-amber-100 text-amber-700',
  done:         'bg-emerald-100 text-emerald-700',
};

// ── Lightbox ──────────────────────────────────────────────────────────────────

function Lightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90" onClick={onClose}>
      <button
        className="absolute top-3 right-3 text-white/80 hover:text-white bg-white/10 rounded-full p-2"
        onClick={onClose}
      >
        <X className="w-5 h-5" />
      </button>
      <img
        src={src}
        alt={alt}
        draggable={false}
        className="max-w-[95vw] max-h-[90vh] object-contain rounded-xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────

const SWIPE_THRESHOLD = 55;
const SWIPE_MAX = 75;

function MessageBubble({
  msg,
  attachments,
  onReply,
  onImageClick,
}: {
  msg: CustomerMessage;
  attachments: (Attachment & { view_url?: string })[];
  onReply: (msg: CustomerMessage) => void;
  onImageClick: (src: string, alt: string) => void;
}) {
  const isCustomer = msg.sender_type === 'customer';
  const parsed = parseMessage(msg.message);
  const att = parsed.attachmentId ? attachments.find((a) => a.id === parsed.attachmentId) : null;

  const replyParsed = msg.reply_to ? parseMessage(msg.reply_to.message) : null;
  const replyAtt = replyParsed?.attachmentId
    ? attachments.find((a) => a.id === replyParsed.attachmentId)
    : null;

  // Swipe-to-reply
  const [dragX, setDragX] = useState(0);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const activeRef = useRef(false);
  const dirRef = useRef<'h' | 'v' | null>(null);
  const triggeredRef = useRef(false);

  const onPointerDown = (e: React.PointerEvent) => {
    startXRef.current = e.clientX;
    startYRef.current = e.clientY;
    activeRef.current = true;
    dirRef.current = null;
    triggeredRef.current = false;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!activeRef.current) return;
    const dx = e.clientX - startXRef.current;
    const dy = e.clientY - startYRef.current;
    if (!dirRef.current) {
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
        dirRef.current = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
        if (dirRef.current === 'h') {
          try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
        }
      }
      return;
    }
    if (dirRef.current === 'v') return;
    const x = Math.max(-SWIPE_MAX, Math.min(dx, SWIPE_MAX));
    setDragX(x);
    if (Math.abs(x) >= SWIPE_THRESHOLD && !triggeredRef.current) {
      triggeredRef.current = true;
      onReply(msg);
      if (navigator.vibrate) navigator.vibrate(40);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    activeRef.current = false;
    dirRef.current = null;
    setDragX(0);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
  };

  const swipeProgress = Math.min(Math.abs(dragX) / SWIPE_THRESHOLD, 1);

  return (
    <div
      className={`flex ${isCustomer ? 'justify-end' : 'justify-start'} group mb-1 select-none`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDragStart={(e) => e.preventDefault()}
    >
      {/* Swipe icon — left (drag right) */}
      <div
        className="flex items-center justify-center w-6 sm:w-8 flex-shrink-0 self-center"
        style={{ opacity: dragX > 0 ? swipeProgress : 0 }}
      >
        <div className={`p-1 sm:p-1.5 rounded-full bg-white border border-gray-200 shadow-sm transition-transform ${dragX > 0 ? 'scale-100' : 'scale-75'}`}>
          <Reply className="w-3 h-3 sm:w-4 sm:h-4 text-gray-500" />
        </div>
      </div>

      <div
        className="relative max-w-[80%] sm:max-w-[75%] flex flex-col"
        style={{
          transform: `translateX(${dragX}px)`,
          transition: dragX === 0 ? 'transform 0.2s ease' : 'none',
        }}
      >
        {/* Reply button — always visible */}
        <button
          onClick={() => onReply(msg)}
          className={`absolute top-1 ${isCustomer ? '-left-7 sm:-left-9' : '-right-7 sm:-right-9'} p-1 sm:p-1.5 rounded-full bg-white border border-gray-200 shadow-sm hover:bg-gray-100 transition-colors`}
          title="Reply"
        >
          <Reply className="w-3 h-3 sm:w-4 sm:h-4 text-gray-500" />
        </button>

        <div
          className={`rounded-2xl px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm leading-relaxed shadow-sm ${
            isCustomer
              ? 'bg-[#d9fdd3] text-gray-800 rounded-br-sm'
              : 'bg-white text-gray-800 rounded-bl-sm'
          }`}
        >
          {/* Sender name (staff only) */}
          {!isCustomer && (
            <p className="text-[10px] sm:text-xs font-semibold text-emerald-600 mb-1">{msg.sender_name || 'Support'}</p>
          )}

          {/* Reply preview */}
          {msg.reply_to && (
            <div className="mb-1.5 pl-2 border-l-2 border-emerald-500 rounded bg-black/5 pr-2 py-1">
              <div className="flex items-center gap-1.5">
                {replyAtt && isImageType(replyAtt.file_type) && replyAtt.view_url && (
                  <img
                    src={replyAtt.view_url}
                    alt={replyAtt.file_name}
                    draggable={false}
                    className="w-8 h-8 sm:w-10 sm:h-10 object-cover rounded flex-shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] sm:text-xs font-medium text-emerald-600">
                    {msg.reply_to.sender_type === 'customer' ? 'You' : (msg.reply_to.sender_name || 'Support')}
                  </p>
                  <p className="text-[10px] sm:text-xs text-gray-500 truncate max-w-[120px] sm:max-w-[180px]">
                    {replyParsed?.text || (replyAtt ? replyAtt.file_name : '📎 Attachment')}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Attachment */}
          {att && (
            <div className="mb-1.5">
              {isImageType(att.file_type) && att.view_url ? (
                <div>
                  <img
                    src={att.view_url}
                    alt={att.file_name}
                    draggable={false}
                    className="rounded-lg max-w-[160px] sm:max-w-[220px] max-h-[200px] sm:max-h-[260px] object-cover cursor-pointer"
                    onClick={() => onImageClick(att.view_url!, att.file_name)}
                  />
                  <p className="text-[10px] sm:text-xs text-gray-500 mt-1 truncate max-w-[160px] sm:max-w-[220px]">{att.file_name}</p>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 bg-black/5 rounded-lg px-2 sm:px-3 py-1.5 sm:py-2">
                  {att.file_type === '.pdf'
                    ? <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-red-500 flex-shrink-0" />
                    : <File className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500 flex-shrink-0" />
                  }
                  <span className="text-[10px] sm:text-xs truncate max-w-[120px] sm:max-w-[160px] text-gray-700">{att.file_name}</span>
                </div>
              )}
            </div>
          )}

          {/* Text */}
          {parsed.text && <p className="whitespace-pre-wrap break-words text-gray-800">{parsed.text}</p>}

          {/* Timestamp */}
          <p className={`text-[9px] sm:text-[10px] mt-1 ${isCustomer ? 'text-right' : 'text-left'} text-gray-400`}>
            {formatTime(msg.created_at)}
          </p>
        </div>
      </div>

      {/* Swipe icon — right (drag left) */}
      <div
        className="flex items-center justify-center w-6 sm:w-8 flex-shrink-0 self-center"
        style={{ opacity: dragX < 0 ? swipeProgress : 0 }}
      >
        <div className={`p-1 sm:p-1.5 rounded-full bg-white border border-gray-200 shadow-sm transition-transform ${dragX < 0 ? 'scale-100' : 'scale-75'}`}>
          <Reply className="w-3 h-3 sm:w-4 sm:h-4 text-gray-500" />
        </div>
      </div>
    </div>
  );
}

// ── Date separator ────────────────────────────────────────────────────────────

function DateSeparator({ label }: { label: string }) {
  return (
    <div className="flex justify-center my-2 sm:my-3">
      <span className="bg-[#e9edef] text-gray-500 text-[10px] sm:text-xs px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full shadow-sm">
        {label}
      </span>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CustomerPortalPage() {
  const { token } = useParams<{ token: string }>();
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<CustomerMessage | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<{ name: string; progress: number; index: number; total: number } | null>(null);
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [senderName] = useState(() => sessionStorage.getItem(`customer_name_${token}`) || 'Customer');

  // ── Queries ──

  const { data: infoData, isLoading: infoLoading, isError: infoError } = useQuery({
    queryKey: ['customer-portal', token],
    queryFn: () => customerPortalApi.getInfo(token!),
    enabled: !!token,
    retry: false,
  });
  const info = infoData?.data;

  const { data: msgsData } = useQuery({
    queryKey: ['customer-portal-messages', token],
    queryFn: () => customerPortalApi.getMessages(token!),
    enabled: !!token && !!info,
    refetchInterval: 10_000,
  });
  const messages: CustomerMessage[] = msgsData?.data || [];

  const { data: attsData } = useQuery({
    queryKey: ['customer-portal-attachments', token],
    queryFn: () => customerPortalApi.getAttachments(token!),
    enabled: !!token && !!info,
    refetchInterval: 15_000,
  });
  const attachments: (Attachment & { view_url?: string })[] = attsData?.data || [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // ── Send message ──

  const sendMutation = useMutation({
    mutationFn: ({ message, replyToId }: { message: string; replyToId?: number | null }) =>
      customerPortalApi.sendMessage(token!, message, senderName, replyToId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-portal-messages', token] });
      setText('');
      setReplyTo(null);
    },
  });

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || sendMutation.isPending) return;
    sendMutation.mutate({ message: trimmed, replyToId: replyTo?.id });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // ── File upload ──

  const handleFilesUpload = useCallback(async (files: File[], capturedReplyTo: CustomerMessage | null) => {
    if (!files.length || !token) return;
    setReplyTo(null);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setUploadQueue({ name: file.name, progress: 0, index: i + 1, total: files.length });
      try {
        const res = await customerPortalApi.uploadAttachment(
          token, file,
          (pct) => setUploadQueue((q) => q ? { ...q, progress: pct } : q),
        );
        const att = res.data;
        queryClient.invalidateQueries({ queryKey: ['customer-portal-attachments', token] });
        await customerPortalApi.sendMessage(
          token, `[attachment:${att.id}:${att.file_name}]`, senderName,
          i === 0 ? capturedReplyTo?.id : null,
        );
        queryClient.invalidateQueries({ queryKey: ['customer-portal-messages', token] });
      } catch {
        alert(`Upload failed for "${file.name}". Skipping.`);
      }
    }
    setUploadQueue(null);
  }, [token, senderName, queryClient]);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    if (fileInputRef.current) fileInputRef.current.value = '';
    await handleFilesUpload(files, replyTo);
  }, [replyTo, handleFilesUpload]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDragging(false);
    if (uploadQueue) return;
    const files = Array.from(e.dataTransfer.files).filter((f) => {
      const ext = '.' + f.name.split('.').pop()?.toLowerCase();
      return ['.jpg','.jpeg','.png','.gif','.webp','.pdf','.docx','.doc','.xlsx','.txt','.csv','.zip'].includes(ext);
    });
    await handleFilesUpload(files, replyTo);
  }, [replyTo, handleFilesUpload, uploadQueue]);

  // ── Group messages by date ──

  const grouped: { date: string; msgs: CustomerMessage[] }[] = [];
  for (const msg of messages) {
    const label = formatDate(msg.created_at);
    if (!grouped.length || grouped[grouped.length - 1].date !== label) {
      grouped.push({ date: label, msgs: [msg] });
    } else {
      grouped[grouped.length - 1].msgs.push(msg);
    }
  }

  const replyParsedForInput = replyTo ? parseMessage(replyTo.message) : null;
  const replyAttForInput = replyParsedForInput?.attachmentId
    ? attachments.find((a) => a.id === replyParsedForInput.attachmentId)
    : null;

  // ── Render ──

  if (infoLoading) {
    return (
      <div className="h-dvh bg-[#f0f2f5] flex items-center justify-center">
        <Loader2 className="w-7 h-7 sm:w-8 sm:h-8 text-emerald-500 animate-spin" />
      </div>
    );
  }

  if (infoError || !info) {
    return (
      <div className="h-dvh bg-[#f0f2f5] flex flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-red-100 flex items-center justify-center">
          <X className="w-7 h-7 sm:w-8 sm:h-8 text-red-500" />
        </div>
        <h1 className="text-lg sm:text-xl font-semibold text-gray-800">Link not found</h1>
        <p className="text-gray-500 text-xs sm:text-sm max-w-xs">
          This link may have expired or been revoked. Please contact us for a new link.
        </p>
      </div>
    );
  }

  return (
    <div
      className="h-dvh bg-[#efeae2] flex flex-col w-full max-w-2xl mx-auto relative overflow-hidden"
      onDragEnter={(e) => { e.preventDefault(); if (!Array.from(e.dataTransfer.types).includes('Files')) return; dragCounterRef.current++; setIsDragging(true); }}
      onDragLeave={() => { dragCounterRef.current--; if (dragCounterRef.current <= 0) { dragCounterRef.current = 0; setIsDragging(false); } }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-emerald-500/10 border-2 border-dashed border-emerald-500 flex items-center justify-center pointer-events-none">
          <div className="text-center bg-white/90 rounded-2xl px-6 sm:px-8 py-5 sm:py-6 shadow-lg">
            <Paperclip className="w-8 h-8 sm:w-10 sm:h-10 text-emerald-500 mx-auto mb-2" />
            <p className="text-emerald-700 font-semibold text-sm sm:text-base">Drop files to upload</p>
            <p className="text-gray-400 text-xs mt-1">Images, PDFs, documents…</p>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div className="bg-white border-b border-gray-200 flex-shrink-0 shadow-sm z-10">
        <div className="flex items-center px-3 sm:px-4 py-2 sm:py-3 gap-2 sm:gap-3">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-emerald-500 flex items-center justify-center text-white font-semibold text-xs sm:text-sm flex-shrink-0 shadow-sm">
            {info.customer_name?.[0]?.toUpperCase() || 'C'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-gray-800 font-semibold text-xs sm:text-sm truncate">{info.customer_name}</p>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            <p className="text-gray-400 text-[10px] sm:text-xs">#{info.product_id}</p>
            <button
              onClick={() => setDetailsOpen((v) => !v)}
              className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
            >
              {detailsOpen ? <ChevronUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <ChevronDown className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
            </button>
          </div>
        </div>

        {detailsOpen && (
          <div className="px-3 sm:px-4 pb-2 sm:pb-3 pt-0 border-t border-gray-100 space-y-1.5 sm:space-y-2">
            {info.description && (
              <div>
                <p className="text-[9px] sm:text-[10px] uppercase tracking-wider text-gray-400 mb-0.5">Description</p>
                <p className="text-gray-600 text-xs sm:text-sm">{info.description}</p>
              </div>
            )}
            {info.delivery_at && (
              <div>
                <p className="text-[9px] sm:text-[10px] uppercase tracking-wider text-gray-400 mb-0.5">Delivery Date</p>
                <p className="text-gray-600 text-xs sm:text-sm">
                  {new Date(info.delivery_at).toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-2 sm:px-4 py-3 sm:py-4">
        {grouped.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-emerald-100 flex items-center justify-center mb-3">
              <Image className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-500" />
            </div>
            <p className="text-gray-500 text-xs sm:text-sm">No messages yet.</p>
            <p className="text-gray-400 text-[10px] sm:text-xs mt-1">Start by uploading images or sending a message below.</p>
          </div>
        ) : (
          grouped.map((group) => (
            <div key={group.date}>
              <DateSeparator label={group.date} />
              {group.msgs.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  msg={msg}
                  attachments={attachments}
                  onReply={setReplyTo}
                  onImageClick={(src, alt) => setLightbox({ src, alt })}
                />
              ))}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* ── Input ── */}
      <div className="bg-[#f0f2f5] border-t border-gray-200 px-2 sm:px-3 py-1.5 sm:py-2 flex-shrink-0">
        {/* Reply preview */}
        {replyTo && (
          <div className="flex items-center gap-2 mb-1.5 bg-white rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 border-l-4 border-emerald-500 shadow-sm">
            {replyAttForInput && isImageType(replyAttForInput.file_type) && replyAttForInput.view_url && (
              <img
                src={replyAttForInput.view_url}
                alt={replyAttForInput.file_name}
                className="w-9 h-9 sm:w-12 sm:h-12 object-cover rounded flex-shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-[10px] sm:text-xs font-semibold text-emerald-600 mb-0.5">
                {replyTo.sender_type === 'customer' ? 'You' : (replyTo.sender_name || 'Support')}
              </p>
              <p className="text-[10px] sm:text-xs text-gray-500 truncate">
                {replyParsedForInput?.text || (replyAttForInput ? replyAttForInput.file_name : '📎 Attachment')}
              </p>
            </div>
            <button onClick={() => setReplyTo(null)} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
              <X className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            </button>
          </div>
        )}

        {/* Upload progress */}
        {uploadQueue && (
          <div className="mb-1.5 px-1">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 animate-spin text-emerald-500 flex-shrink-0" />
                <span className="text-[10px] sm:text-xs text-gray-600 truncate max-w-[120px] sm:max-w-[200px]">{uploadQueue.name}</span>
              </div>
              <span className="text-[10px] sm:text-xs text-gray-400 flex-shrink-0 ml-2">
                {uploadQueue.index}/{uploadQueue.total} · {uploadQueue.progress}%
              </span>
            </div>
            <div className="h-0.5 sm:h-1 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-200"
                style={{ width: `${uploadQueue.progress}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex items-end gap-1.5 sm:gap-2">
          {/* Attach */}
          <label className={`flex-shrink-0 p-1.5 sm:p-2 rounded-full transition-colors cursor-pointer ${uploadQueue ? 'opacity-40 pointer-events-none' : 'hover:bg-gray-200'}`}>
            <Paperclip className="w-4 h-4 sm:w-5 sm:h-5 text-gray-500" />
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.docx,.doc,.xlsx,.txt,.csv,.zip"
              onChange={handleFileChange}
              disabled={!!uploadQueue}
            />
          </label>

          {/* Textarea */}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message…"
            rows={1}
            className="flex-1 resize-none bg-white text-gray-800 placeholder-gray-400 rounded-xl px-2.5 sm:px-3 py-2 sm:py-2.5 text-xs sm:text-sm outline-none border border-gray-200 focus:border-emerald-300 focus:ring-1 focus:ring-emerald-200 min-h-[36px] sm:min-h-[42px] max-h-[100px] sm:max-h-[120px] shadow-sm"
            style={{ overflow: 'hidden' }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = Math.min(el.scrollHeight, 120) + 'px';
            }}
          />

          {/* Send */}
          <button
            onClick={handleSend}
            disabled={!text.trim() || sendMutation.isPending || !!uploadQueue}
            className="flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-emerald-500 flex items-center justify-center disabled:opacity-40 transition-opacity hover:bg-emerald-600 shadow-sm"
          >
            <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
          </button>
        </div>
      </div>

      {lightbox && <Lightbox src={lightbox.src} alt={lightbox.alt} onClose={() => setLightbox(null)} />}
    </div>
  );
}
