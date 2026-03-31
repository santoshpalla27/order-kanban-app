import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { portalApi } from '../../api/client';
import { CustomerPortalProduct, Attachment } from '../../types';

// ── Helpers ──
const STATUS_LABELS: Record<string, string> = {
  yet_to_start: 'Yet to Start',
  working: 'In Progress',
  review: 'Review',
  done: 'Done',
};

const STATUS_COLORS: Record<string, string> = {
  yet_to_start: 'bg-gray-100 text-gray-600',
  working: 'bg-blue-100 text-blue-600',
  review: 'bg-yellow-100 text-yellow-700',
  done: 'bg-emerald-100 text-emerald-700',
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const isImageType = (ext: string) =>
  ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.heic'].includes(ext.toLowerCase());

// ── Types ──
interface PortalMessage {
  id: number;
  message: string;
  portal_sender: string;
  created_at: string;
}

interface StagedFile {
  file: File;
  preview: string | null;
  caption: string;
  uploading: boolean;
  progress: number;
  error: string | null;
}

interface ParsedMsg {
  text: string;
  replyToId: number | null;
  attachmentTokens: { id: number; name: string }[];
}

function parseMsg(raw: string): ParsedMsg {
  const result: ParsedMsg = { text: '', replyToId: null, attachmentTokens: [] };
  const lines = raw.split('\n');
  const textLines: string[] = [];
  for (const line of lines) {
    const att = line.match(/^\[attachment:(\d+):(.+?)\]$/);
    if (att) { result.attachmentTokens.push({ id: parseInt(att[1]), name: att[2] }); continue; }
    const reply = line.match(/^\[reply:(\d+)\]$/);
    if (reply) { result.replyToId = parseInt(reply[1]); continue; }
    if (!textLines.length && result.attachmentTokens.length === 0 && !line.trim()) continue;
    textLines.push(line);
  }
  result.text = textLines.join('\n').trim();
  return result;
}

function getMsgPreview(msg: PortalMessage): string {
  const parsed = parseMsg(msg.message);
  if (parsed.text) return parsed.text.slice(0, 80);
  if (parsed.attachmentTokens.length) return `📎 ${parsed.attachmentTokens[0].name}`;
  return msg.message.slice(0, 80);
}

function getMsgThumbnail(msg: PortalMessage, attachments: Attachment[]): string | null {
  const parsed = parseMsg(msg.message);
  for (const tok of parsed.attachmentTokens) {
    const att = attachments.find(a => a.id === tok.id);
    if (att && isImageType(att.file_type) && (att as any).view_url) {
      return (att as any).view_url;
    }
  }
  return null;
}

// ── Icons ──
function ChevronDown({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>;
}
function ChevronUp({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" /></svg>;
}
function SendIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>;
}
function PaperclipIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>;
}
function XIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>;
}
function ReplyIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>;
}

// ── Main Page ──
export default function CustomerPortalPage() {
  const { token } = useParams<{ token: string }>();
  const [product, setProduct] = useState<CustomerPortalProduct | null>(null);
  const [messages, setMessages] = useState<PortalMessage[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [textInput, setTextInput] = useState('');
  const [sending, setSending] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);

  // Reply / mention
  const [replyTo, setReplyTo] = useState<PortalMessage | null>(null);
  const [highlightedMsgId, setHighlightedMsgId] = useState<number | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Per-message refs for scroll-to
  const messageRefs = useRef<Record<number, HTMLDivElement | null>>({});

  // Swipe state (pointer-based, works on both touch and mouse)
  const msgSwipeRef = useRef<{ id: number; startX: number; startY: number } | null>(null);
  const [swipeState, setSwipeState] = useState<{ id: number; offset: number } | null>(null);
  const wasSwipedRef = useRef(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dragCounter = useRef(0);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (!token) return;
    Promise.all([
      portalApi.getProduct(token),
      portalApi.getMessages(token),
      portalApi.getAttachments(token),
    ]).then(([prod, msgs, atts]) => {
      if (prod?.error) { setError(prod.error); return; }
      setProduct(prod);
      setMessages(msgs?.data || []);
      setAttachments(atts || []);
    }).catch(() => setError('Failed to load order information.'))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);
  useEffect(() => { if (replyTo) textareaRef.current?.focus(); }, [replyTo]);

  // ── Highlight a message (scroll to it + 5s glow) ──
  const highlightMessage = useCallback((msgId: number) => {
    const el = messageRefs.current[msgId];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    setHighlightedMsgId(msgId);
    highlightTimer.current = setTimeout(() => setHighlightedMsgId(null), 5000);
  }, []);

  // ── Select a message as reply (scroll to it briefly, then focus input) ──
  const handleSelectReply = useCallback((msg: PortalMessage) => {
    setReplyTo(msg);
    // Briefly scroll to show the selected message, then scroll back to bottom
    const el = messageRefs.current[msg.id];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 800);
    }
    setTimeout(() => textareaRef.current?.focus(), 900);
  }, []);

  // ── File staging ──
  const stageFiles = (files: File[]) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.docx', '.doc', '.xlsx', '.txt', '.csv', '.zip'];
    const valid = files.filter(f => allowed.includes('.' + f.name.split('.').pop()?.toLowerCase()));
    if (valid.length === 0) return;
    const newStaged: StagedFile[] = valid.map(f => {
      const ext = '.' + f.name.split('.').pop()?.toLowerCase();
      return { file: f, preview: isImageType(ext) ? URL.createObjectURL(f) : null, caption: '', uploading: false, progress: 0, error: null };
    });
    setStagedFiles(prev => [...prev, ...newStaged]);
  };

  const removeStagedFile = (idx: number) => {
    setStagedFiles(prev => {
      const copy = [...prev];
      if (copy[idx].preview) URL.revokeObjectURL(copy[idx].preview!);
      copy.splice(idx, 1);
      return copy;
    });
  };

  // ── File drag-drop ──
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); };
  const handleDragEnter = (e: React.DragEvent) => { e.preventDefault(); dragCounter.current++; };
  const handleDragLeave = () => { dragCounter.current--; };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    stageFiles(Array.from(e.dataTransfer.files));
  };

  // ── Staged file caption swipe ──
  const captionSwipe = useRef<{ x: number; idx: number } | null>(null);
  const handleCaptionTouchStart = (e: React.TouchEvent, idx: number) => {
    captionSwipe.current = { x: e.touches[0].clientX, idx };
  };
  const handleCaptionTouchEnd = (e: React.TouchEvent, idx: number) => {
    if (!captionSwipe.current || captionSwipe.current.idx !== idx) return;
    if (Math.abs(e.changedTouches[0].clientX - captionSwipe.current.x) > 60)
      document.getElementById(`caption-${idx}`)?.focus();
    captionSwipe.current = null;
  };

  // ── Message swipe-to-reply (pointer events — works on touch + mouse) ──
  const handleMsgPointerDown = (e: React.PointerEvent, msg: PortalMessage) => {
    // Only track horizontal-intent gestures; ignore if on a button
    if ((e.target as HTMLElement).closest('button')) return;
    wasSwipedRef.current = false;
    msgSwipeRef.current = { id: msg.id, startX: e.clientX, startY: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const handleMsgPointerMove = (e: React.PointerEvent, msg: PortalMessage) => {
    if (!msgSwipeRef.current || msgSwipeRef.current.id !== msg.id) return;
    const dx = e.clientX - msgSwipeRef.current.startX;
    const dy = e.clientY - msgSwipeRef.current.startY;
    // Cancel if mostly vertical (user is scrolling)
    if (Math.abs(dy) > Math.abs(dx) + 10) { msgSwipeRef.current = null; setSwipeState(null); return; }
    if (Math.abs(dx) > 5) {
      e.preventDefault();
      setSwipeState({ id: msg.id, offset: Math.max(-80, Math.min(80, dx)) });
    }
  };
  const handleMsgPointerUp = (msg: PortalMessage) => {
    if (swipeState && Math.abs(swipeState.offset) > 50) {
      wasSwipedRef.current = true;
      handleSelectReply(msg);
    }
    setSwipeState(null);
    msgSwipeRef.current = null;
  };

  // ── Upload a single file ──
  const uploadFile = async (sf: StagedFile, idx: number): Promise<number | null> => {
    if (!token) return null;
    const ext = '.' + sf.file.name.split('.').pop()?.toLowerCase();
    setStagedFiles(prev => prev.map((f, i) => i === idx ? { ...f, uploading: true, progress: 0, error: null } : f));
    try {
      const presign = await portalApi.getPresignedUrl(token, sf.file.name);
      if (presign.error) throw new Error(presign.error);
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', presign.upload_url);
        xhr.setRequestHeader('Content-Type', presign.content_type);
        xhr.upload.onprogress = (e) => {
          if (e.total) setStagedFiles(prev => prev.map((f, i) => i === idx ? { ...f, progress: Math.round(e.loaded / e.total * 100) } : f));
        };
        xhr.onload = () => xhr.status < 300 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`));
        xhr.onerror = () => reject(new Error('Upload failed'));
        xhr.send(sf.file);
      });
      const confirmed = await portalApi.confirmUpload(token, {
        s3_key: presign.s3_key, file_name: sf.file.name, file_size: sf.file.size, file_type: ext,
      });
      if (confirmed.error) throw new Error(confirmed.error);
      setAttachments(prev => [...prev, confirmed]);
      setStagedFiles(prev => prev.map((f, i) => i === idx ? { ...f, uploading: false, progress: 100 } : f));
      return confirmed.id as number;
    } catch (err: any) {
      setStagedFiles(prev => prev.map((f, i) => i === idx ? { ...f, uploading: false, error: err.message || 'Upload failed' } : f));
      return null;
    }
  };

  // ── Send ──
  const handleSend = async () => {
    if (!token) return;
    if (stagedFiles.length === 0 && !textInput.trim()) return;
    setSending(true);
    const replyPrefix = replyTo ? `[reply:${replyTo.id}]\n` : '';
    try {
      if (textInput.trim()) {
        const sent = await portalApi.postMessage(token, replyPrefix + textInput.trim());
        if (!sent.error) setMessages(prev => [...prev, { ...sent, portal_sender: product?.customer_name || 'Customer' }]);
      }
      for (let i = 0; i < stagedFiles.length; i++) {
        const id = await uploadFile(stagedFiles[i], i);
        if (id) {
          const captionLine = stagedFiles[i].caption.trim() ? `${stagedFiles[i].caption.trim()}\n` : '';
          const sent = await portalApi.postMessage(token, replyPrefix + captionLine + `[attachment:${id}:${stagedFiles[i].file.name}]`);
          if (!sent.error) setMessages(prev => [...prev, { ...sent, portal_sender: product?.customer_name || 'Customer' }]);
        }
      }
      stagedFiles.forEach(sf => { if (sf.preview) URL.revokeObjectURL(sf.preview); });
      setStagedFiles([]);
      setTextInput('');
      setReplyTo(null);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    if (e.key === 'Escape') setReplyTo(null);
  };

  // ── Quoted block (reusable) ──
  const QuotedBlock = ({ quotedMsg, onClick }: { quotedMsg: PortalMessage; onClick?: () => void }) => {
    const thumb = getMsgThumbnail(quotedMsg, attachments);
    return (
      <div
        className={`flex items-stretch gap-0 rounded-lg overflow-hidden border-l-4 ${onClick ? 'cursor-pointer hover:brightness-95' : ''}`}
        style={{ background: 'rgba(0,0,0,0.06)', borderColor: '#25d366' }}
        onClick={onClick}
      >
        <div className="flex-1 min-w-0 px-2.5 py-1.5">
          <p className="text-[10px] font-semibold truncate" style={{ color: '#25d366' }}>{quotedMsg.portal_sender}</p>
          <p className="text-xs truncate" style={{ color: '#667781' }}>{getMsgPreview(quotedMsg)}</p>
        </div>
        {thumb && (
          <div className="w-12 h-12 flex-shrink-0 overflow-hidden">
            <img src={thumb} alt="preview" className="w-full h-full object-cover" />
          </div>
        )}
      </div>
    );
  };

  // ── Render ──
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#efeae2' }}>
        <div className="w-8 h-8 border-2 border-[#25d366]/30 border-t-[#25d366] rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6" style={{ background: '#efeae2' }}>
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
          <XIcon className="w-8 h-8 text-red-500" />
        </div>
        <h1 className="text-xl font-semibold text-gray-800">Link Unavailable</h1>
        <p className="text-gray-500 text-sm text-center max-w-sm">
          {error || 'This customer link is invalid or has been revoked.'}
        </p>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] flex flex-col max-w-2xl mx-auto" style={{ background: '#efeae2' }}>
      {/* ── Header ── */}
      <div className="sticky top-0 z-10" style={{ background: '#075e54' }}>
        <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#25d366] flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
              {product.customer_name.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-semibold text-white leading-tight">{product.product_id}</p>
              <p className="text-xs text-white/70">{product.customer_name}</p>
            </div>
          </div>
          <button
            onClick={() => setDetailsOpen(o => !o)}
            className="flex items-center gap-1.5 text-xs text-white/70 hover:text-white transition-colors px-2 py-1.5 rounded-lg hover:bg-white/10"
          >
            {detailsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            Details
          </button>
        </div>
        {detailsOpen && (
          <div className="px-4 pb-4 pt-1 border-t border-white/10 space-y-2" style={{ background: '#128c7e' }}>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              <div>
                <p className="text-[10px] text-white/50 uppercase tracking-wider">Order ID</p>
                <p className="text-sm text-white font-medium">{product.product_id}</p>
              </div>
              <div>
                <p className="text-[10px] text-white/50 uppercase tracking-wider">Status</p>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[product.status] || 'bg-gray-100 text-gray-600'}`}>
                  {STATUS_LABELS[product.status] || product.status}
                </span>
              </div>
              {product.delivery_at && (
                <div>
                  <p className="text-[10px] text-white/50 uppercase tracking-wider">Delivery</p>
                  <p className="text-sm text-white">{formatDateTime(product.delivery_at)}</p>
                </div>
              )}
              {product.description && (
                <div className="col-span-2">
                  <p className="text-[10px] text-white/50 uppercase tracking-wider">Description</p>
                  <p className="text-sm text-white/90 whitespace-pre-wrap">{product.description}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Messages ── */}
      <div
        className="flex-1 overflow-y-auto px-2 sm:px-3 py-2 sm:py-3 space-y-1 overflow-x-hidden"
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-16" style={{ color: '#667781' }}>
            <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: 'rgba(37,211,102,0.1)' }}>
              <svg className="w-8 h-8 opacity-60" style={{ color: '#25d366' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p className="text-sm">Send a message or upload files</p>
            <p className="text-xs opacity-60">You can also drag & drop files here</p>
          </div>
        )}

        {messages.map((msg) => {
          const parsed = parseMsg(msg.message);
          const quotedMsg = parsed.replyToId ? messages.find(m => m.id === parsed.replyToId) : null;
          const swipeOffset = swipeState?.id === msg.id ? swipeState.offset : 0;
          const isHighlighted = highlightedMsgId === msg.id;

          return (
            <div
              key={msg.id}
              ref={(el) => { messageRefs.current[msg.id] = el; }}
              className="rounded-lg transition-colors duration-500"
              style={{ background: isHighlighted ? 'rgba(37,211,102,0.22)' : 'transparent' }}
            >
              <div
                className="flex justify-end items-center gap-1.5 group py-0.5 select-none"
                onPointerDown={(e) => handleMsgPointerDown(e, msg)}
                onPointerMove={(e) => handleMsgPointerMove(e, msg)}
                onPointerUp={() => handleMsgPointerUp(msg)}
                onPointerCancel={() => { setSwipeState(null); msgSwipeRef.current = null; }}
                onDragStart={(e) => e.preventDefault()}
                style={{ touchAction: 'pan-y' }}
              >
                {/* Reply arrow — visible on hover */}
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => handleSelectReply(msg)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-full flex-shrink-0 hover:bg-black/10"
                  title="Reply"
                >
                  <ReplyIcon className="w-4 h-4 text-[#667781]" />
                </button>

                {/* Bubble — slides with swipe */}
                <div
                  className="max-w-[88%] sm:max-w-[80%]"
                  style={{
                    transform: `translateX(${swipeOffset}px)`,
                    transition: swipeState?.id === msg.id ? 'none' : 'transform 0.2s ease',
                  }}
                >
                  <div className="rounded-2xl rounded-tr-sm px-3 py-2 shadow-sm" style={{ background: '#d9fdd3' }}>
                    {/* Quoted reply block inside bubble */}
                    {quotedMsg && (
                      <div className="mb-2">
                        <QuotedBlock
                          quotedMsg={quotedMsg}
                          onClick={() => highlightMessage(quotedMsg.id)}
                        />
                      </div>
                    )}

                    {parsed.text && (
                      <p className="text-sm whitespace-pre-wrap" style={{ color: '#111b21' }}>{parsed.text}</p>
                    )}
                    {parsed.attachmentTokens.map((tok) => {
                      const att = attachments.find(a => a.id === tok.id);
                      const attIsImage = att ? isImageType(att.file_type) : false;
                      const attUrl = (att as any)?.view_url || '';
                      return (
                        <div key={tok.id}>
                          {att && attIsImage && attUrl && (
                            <div
                              className="mt-2 rounded-xl overflow-hidden cursor-pointer w-full max-w-[180px] aspect-square"
                              onClick={() => { if (!wasSwipedRef.current) setLightbox(attUrl); wasSwipedRef.current = false; }}
                            >
                              <img src={attUrl} alt={att.file_name} className="w-full h-full object-cover" />
                            </div>
                          )}
                          {att && !attIsImage && (
                            <div className="mt-2 flex items-center gap-2 rounded-lg p-2" style={{ background: 'rgba(0,0,0,0.06)' }}>
                              <svg className="w-5 h-5 flex-shrink-0" style={{ color: '#667781' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              <span className="text-xs truncate" style={{ color: '#111b21' }}>{att.file_name}</span>
                              <span className="text-[10px] flex-shrink-0" style={{ color: '#667781' }}>{formatSize(att.file_size)}</span>
                            </div>
                          )}
                          {!att && (
                            <div className="mt-2 flex items-center gap-2 rounded-lg p-2" style={{ background: 'rgba(0,0,0,0.06)' }}>
                              <svg className="w-5 h-5 flex-shrink-0" style={{ color: '#667781' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              <span className="text-xs truncate" style={{ color: '#111b21' }}>{tok.name}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <p className="text-[10px] text-right mt-0.5" style={{ color: '#667781' }}>
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Staged files ── */}
      {stagedFiles.length > 0 && (
        <div className="border-t px-3 py-2 space-y-2 max-h-48 overflow-y-auto flex-shrink-0" style={{ background: '#f0f2f5', borderColor: '#d1d7db' }}>
          <p className="text-xs mb-1" style={{ color: '#667781' }}>Files to send</p>
          {stagedFiles.map((sf, idx) => (
            <div
              key={idx}
              className="flex items-start gap-3 rounded-xl p-2.5 border"
              style={{ background: '#ffffff', borderColor: '#d1d7db' }}
              onTouchStart={(e) => handleCaptionTouchStart(e, idx)}
              onTouchEnd={(e) => handleCaptionTouchEnd(e, idx)}
            >
              <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center" style={{ background: '#e9edef' }}>
                {sf.preview ? (
                  <img src={sf.preview} alt={sf.file.name} className="w-full h-full object-cover" />
                ) : (
                  <svg className="w-6 h-6" style={{ color: '#667781' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                )}
              </div>
              <div className="flex-1 min-w-0 space-y-1.5">
                <p className="text-xs truncate" style={{ color: '#111b21' }}>{sf.file.name}</p>
                <p className="text-[10px]" style={{ color: '#667781' }}>{formatSize(sf.file.size)}</p>
                <input
                  id={`caption-${idx}`}
                  type="text"
                  value={sf.caption}
                  onChange={(e) => setStagedFiles(prev => prev.map((f, i) => i === idx ? { ...f, caption: e.target.value } : f))}
                  placeholder="Add a caption… (optional)"
                  className="w-full text-xs rounded-lg px-2.5 py-1.5 focus:outline-none"
                  style={{ background: '#f0f2f5', border: '1px solid #d1d7db', color: '#111b21' }}
                />
                {sf.uploading && (
                  <div className="h-1 rounded-full overflow-hidden" style={{ background: '#d1d7db' }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${sf.progress}%`, background: '#25d366' }} />
                  </div>
                )}
                {sf.error && <p className="text-[10px] text-red-500">{sf.error}</p>}
              </div>
              <button onClick={() => removeStagedFile(idx)} className="p-1 rounded-full transition-colors flex-shrink-0 hover:bg-gray-100">
                <XIcon className="w-4 h-4 text-[#667781]" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Reply preview bar ── */}
      {replyTo && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-t flex-shrink-0" style={{ background: '#f0f2f5', borderColor: '#d1d7db' }}>
          <ReplyIcon className="w-4 h-4 flex-shrink-0 text-[#25d366]" />
          <div className="flex-1 min-w-0">
            <QuotedBlock quotedMsg={replyTo} />
          </div>
          <button onClick={() => setReplyTo(null)} className="p-1 rounded-full hover:bg-gray-200 flex-shrink-0 ml-1">
            <XIcon className="w-4 h-4 text-[#667781]" />
          </button>
        </div>
      )}

      {/* ── Input bar ── */}
      <div className="px-2 sm:px-3 py-2 sm:py-2.5 flex items-end gap-1.5 sm:gap-2 flex-shrink-0" style={{ background: '#f0f2f5' }}>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.doc,.docx,.txt,.xlsx,.csv,.zip"
          className="hidden"
          onChange={(e) => { if (e.target.files) { stageFiles(Array.from(e.target.files)); e.target.value = ''; } }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="p-2.5 rounded-full transition-colors flex-shrink-0 hover:bg-gray-200"
          style={{ color: '#667781' }}
          title="Attach files"
        >
          <PaperclipIcon className="w-5 h-5" />
        </button>

        <textarea
          ref={textareaRef}
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message…"
          rows={1}
          className="flex-1 rounded-2xl px-4 py-2.5 text-sm focus:outline-none resize-none overflow-hidden"
          style={{ minHeight: 44, maxHeight: 120, background: '#ffffff', color: '#111b21', border: 'none' }}
          onInput={(e) => {
            const el = e.currentTarget;
            el.style.height = 'auto';
            el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
          }}
        />

        <button
          onClick={handleSend}
          disabled={sending || (stagedFiles.length === 0 && !textInput.trim())}
          className="p-2.5 rounded-full disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors flex-shrink-0"
          style={{ background: '#25d366' }}
          title="Send"
        >
          {sending ? (
            <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          ) : (
            <SendIcon className="w-5 h-5" />
          )}
        </button>
      </div>

      {/* ── Lightbox ── */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
          onClick={() => setLightbox(null)}
        >
          <img
            src={lightbox}
            alt="attachment"
            className="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 bg-white/20 hover:bg-white/30 p-2 rounded-full transition-colors"
          >
            <XIcon className="w-6 h-6 text-white" />
          </button>
        </div>
      )}
    </div>
  );
}
