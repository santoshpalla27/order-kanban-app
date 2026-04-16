import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { productsApi, attachmentsApi, commentsApi, usersApi, notificationsApi, customerLinkApi } from '../api/client';
import { useProductBadges, STATUS_CHANGE_TYPES } from '../hooks/useProductBadges';
import { formatDate, formatDateTime, formatTime } from '../utils/date';
import { useAuthStore } from '../store/authStore';
import { Product, Attachment, Comment, CustomerLink, STATUS_LABELS, STATUS_ORDER } from '../types';
import MentionInput, { renderWithMentions, MentionInputHandle } from './MentionInput';
import TimelineFeed from './timeline/TimelineFeed';
import {
  X, Paperclip, MessageSquare, Package, Upload, Download, Trash2,
  Send, Edit2, Image, FileText, File, ImagePlus, Plus, Reply, MoreVertical,
  ExternalLink, Link2, Copy, Check, User, Pin, PinOff,
} from 'lucide-react';
import { UserAvatar } from './UserAvatar';

function todayAtMidnight() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T00:00`;
}

interface Props {
  productId: number;
  onClose: () => void;
  initialTab?: string;
}

// ── Download helper ──
async function downloadViaFetch(url: string, filename: string, withAuth = false) {
  const headers: Record<string, string> = {};
  if (withAuth) {
    const token = useAuthStore.getState().token;
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    // R2 mode: backend returns { url: presignedUrl } — navigate directly (bypasses CORS)
    const { url: presignedUrl } = await res.json();
    const link = document.createElement('a');
    link.href = presignedUrl;
    link.download = filename;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => document.body.removeChild(link), 1000);
    return;
  }
  // Local mode: response is the binary file
  const blob = await res.blob();
  const blobUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  setTimeout(() => { document.body.removeChild(link); window.URL.revokeObjectURL(blobUrl); }, 1000);
}

// ── Helpers ──
const getFileIcon = (type: string) => {
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(type)) return Image;
  if (['.pdf', '.docx', '.doc', '.txt'].includes(type)) return FileText;
  return File;
};
const isImageType = (type: string) => ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.heic'].includes(type.toLowerCase());
const isImageUrl = (url: string) => /\.(jpg|jpeg|png|gif|webp|bmp|svg|heic)(\?|$)/i.test(url);
const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};
const getAttachmentUrl = (att: Attachment) => att.view_url || '';

// ── Upload progress types + modal ──
interface FileUploadState {
  name: string;
  size: number;
  progress: number;
  status: 'pending' | 'uploading' | 'done' | 'error' | 'cancelled';
}

function UploadProgressModal({ files, onCancel }: { files: FileUploadState[]; onCancel: () => void }) {
  const done = files.filter(f => f.status === 'done').length;
  const allSettled = files.every(f => ['done', 'error', 'cancelled'].includes(f.status));

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4 bg-surface-900 border border-surface-700/50 rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-surface-700/50 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-surface-100">
              {allSettled ? 'Upload Complete' : 'Uploading Files'}
            </h3>
            <p className="text-xs text-surface-400 mt-0.5">{done} of {files.length} done</p>
          </div>
          {!allSettled && (
            <button
              onClick={onCancel}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-red-400 border border-red-400/30 hover:bg-red-400/10 transition-colors"
            >
              <X className="w-3.5 h-3.5" /> Cancel
            </button>
          )}
        </div>
        <div className="px-6 py-4 space-y-4 max-h-72 overflow-y-auto">
          {files.map((f, i) => (
            <div key={i}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-sm text-surface-200 flex-1 truncate">{f.name}</span>
                <span className={`text-xs flex-shrink-0 ${
                  f.status === 'done' ? 'text-emerald-400' :
                  f.status === 'error' ? 'text-red-400' :
                  f.status === 'cancelled' ? 'text-surface-500' :
                  'text-brand-400'
                }`}>
                  {f.status === 'done' ? '✓ Done' :
                   f.status === 'error' ? '✗ Failed' :
                   f.status === 'cancelled' ? 'Cancelled' :
                   f.status === 'pending' ? 'Waiting…' :
                   `${f.progress}%`}
                </span>
              </div>
              <div className="h-1.5 bg-surface-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-200 ${
                    f.status === 'done' ? 'bg-emerald-500' :
                    f.status === 'error' ? 'bg-red-500' :
                    f.status === 'cancelled' ? 'bg-surface-600' :
                    'bg-brand-500'
                  }`}
                  style={{ width: `${f.progress}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Shared multi-file upload hook ──
function useMultiUpload(productId: number, source = 'direct') {
  const queryClient = useQueryClient();
  const [uploadFiles_state, setUploadFiles_state] = useState<FileUploadState[]>([]);
  const [uploading, setUploading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const uploadFiles = async (files: FileList | File[], onFileDone?: (att: any) => void) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setUploading(true);
    setUploadFiles_state(fileArray.map(f => ({ name: f.name, size: f.size, progress: 0, status: 'pending' })));

    for (let i = 0; i < fileArray.length; i++) {
      if (controller.signal.aborted) {
        setUploadFiles_state(prev => prev.map((f, idx) => idx >= i ? { ...f, status: 'cancelled' } : f));
        break;
      }
      setUploadFiles_state(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'uploading' } : f));
      try {
        const res = await attachmentsApi.uploadWithProgress(
          productId,
          fileArray[i],
          (pct) => setUploadFiles_state(prev => prev.map((f, idx) => idx === i ? { ...f, progress: pct } : f)),
          controller.signal,
          source,
        );
        setUploadFiles_state(prev => prev.map((f, idx) => idx === i ? { ...f, progress: 100, status: 'done' } : f));
        onFileDone?.(res.data);
      } catch (err: any) {
        if (err.name === 'AbortError') {
          setUploadFiles_state(prev => prev.map((f, idx) => idx >= i ? { ...f, status: 'cancelled' } : f));
          break;
        }
        setUploadFiles_state(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'error' } : f));
      }
    }

    queryClient.invalidateQueries({ queryKey: ['attachments', productId] });
    await new Promise(r => setTimeout(r, 900));
    setUploading(false);
    setUploadFiles_state([]);
    abortRef.current = null;
  };

  const cancelUpload = () => abortRef.current?.abort();

  return { uploading, uploadFiles_state, uploadFiles, cancelUpload };
}

// ── Image Comment Modal (triggered from Details/Attachments) ──
function ImageCommentModal({
  attachment,
  productId,
  onClose,
}: {
  attachment: Attachment;
  productId: number;
  onClose: () => void;
}) {
  const [comment, setComment] = useState('');
  const queryClient = useQueryClient();

  const commentMutation = useMutation({
    mutationFn: (msg: string) => commentsApi.create(productId, msg),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', productId] });
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) return;
    // Store as structured format: comment text + image URL on a new line
    const msg = `${comment.trim()}\n[attachment:${attachment.id}:${attachment.file_name}]`;
    commentMutation.mutate(msg);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg glass rounded-2xl animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-surface-700/50">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-brand-400" /> Comment on Attachment
          </h3>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-4">
          {isImageType(attachment.file_type) ? (
            <div className="rounded-xl overflow-hidden border border-surface-700/50 bg-surface-900">
              <img src={getAttachmentUrl(attachment)} alt={attachment.file_name} className="w-full max-h-[300px] object-contain" />
            </div>
          ) : (
            <div className="flex items-center gap-3 p-3 bg-surface-800/50 rounded-xl">
              <div className="w-10 h-10 rounded bg-surface-700 flex items-center justify-center"><File className="w-5 h-5 text-surface-400" /></div>
              <div><p className="text-sm font-medium">{attachment.file_name}</p><p className="text-xs text-surface-500">{formatSize(attachment.file_size)}</p></div>
            </div>
          )}
          <p className="text-xs text-surface-500">{attachment.file_name} · {formatSize(attachment.file_size)}</p>
          <form onSubmit={handleSubmit} className="space-y-3">
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Write your comment about this attachment..." rows={3} className="w-full resize-none" autoFocus />
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={onClose} className="btn-ghost px-4 py-2 text-sm">Cancel</button>
              <button type="submit" disabled={!comment.trim() || commentMutation.isPending} className="btn-primary px-4 py-2 text-sm flex items-center gap-2">
                <Send className="w-3.5 h-3.5" /> {commentMutation.isPending ? 'Posting...' : 'Post Comment'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ── Image Lightbox ──
function ImageLightbox({ src, alt, attId, onClose }: { src: string; alt: string; attId?: number; onClose: () => void }) {
  const handleDownload = () => {
    if (attId) {
      downloadViaFetch(attachmentsApi.download(attId), alt || 'attachment', true);
    } else {
      downloadViaFetch(src, alt || 'attachment');
    }
  };
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="relative max-w-4xl max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <img src={src} alt={alt} className="max-w-full max-h-[85vh] object-contain rounded-xl" />
        <div className="absolute top-3 right-3 flex gap-2">
          <button onClick={handleDownload} className="bg-white/90 backdrop-blur-sm p-2 rounded-lg hover:bg-white transition-colors shadow-lg" title="Download">
            <Download className="w-5 h-5 text-gray-800" />
          </button>
          <a href={src} target="_blank" rel="noreferrer" className="bg-white/90 backdrop-blur-sm p-2 rounded-lg hover:bg-white transition-colors shadow-lg" title="Open in new tab">
            <ExternalLink className="w-5 h-5 text-gray-800" />
          </a>
          <button onClick={onClose} className="bg-white/90 backdrop-blur-sm p-2 rounded-lg hover:bg-white transition-colors shadow-lg" title="Close">
            <X className="w-5 h-5 text-gray-800" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Modal ──
export default function ProductDetailModal({ productId, onClose, initialTab }: Props) {
  // Map old tab names to the new 2-tab system for backwards compatibility
  const resolveInitialTab = (t?: string): 'details' | 'timeline' => {
    if (!t || t === 'details') return 'details';
    return 'timeline';
  };
  type TabId = 'details' | 'timeline';
  const [activeTab, setActiveTab] = useState<TabId>(resolveInitialTab(initialTab));
  const queryClient = useQueryClient();

  const { data: productData } = useQuery({ queryKey: ['products', productId], queryFn: () => productsApi.getById(productId) });
  const product: Product | null = productData?.data || null;

  const { data: attachmentsData } = useQuery({ queryKey: ['attachments', productId], queryFn: () => attachmentsApi.getByProduct(productId) });
  const attachments: Attachment[] = attachmentsData?.data || [];

  const { has } = useProductBadges();

  const invalidateNotifs = () => {
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
    queryClient.invalidateQueries({ queryKey: ['unread-count'] });
    queryClient.invalidateQueries({ queryKey: ['unread-summary'] });
  };

  // On open: mark all product notifications as read (single call covers all types)
  useEffect(() => {
    notificationsApi.markReadByEntityAndTypes('product', productId,
      ['mention', 'assigned', 'customer_message', 'completed', 'product_created']
    ).then(invalidateNotifs);
  }, [productId]);

  // On close: mark status_change as read if any
  const handleClose = () => {
    if (has(productId, 'status_change')) {
      notificationsApi.markReadByEntityAndTypes('product', productId, STATUS_CHANGE_TYPES).then(invalidateNotifs);
    }
    onClose();
  };

  const statusMutation = useMutation({
    mutationFn: (newStatus: string) => productsApi.updateStatus(productId, newStatus),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  });

  const pinMutation = useMutation({
    mutationFn: () => product?.pinned_at ? productsApi.unpin(productId) : productsApi.pin(productId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  });

  const { canCreateProduct } = useAuthStore();

  const tabs = [
    { id: 'details' as const, label: 'Details', icon: Package },
    { id: 'timeline' as const, label: 'Timeline', icon: MessageSquare, badge: has(productId, 'mentions') || has(productId, 'customer_comments') },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in" onMouseDown={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
      <div className="w-full max-w-2xl max-h-[90vh] glass rounded-2xl flex flex-col animate-scale-in" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center gap-3 p-5 border-b border-surface-700/50">
          <h2 className="text-lg font-semibold flex-1 min-w-0 truncate">{product?.product_id || 'Loading...'}</h2>
          {product && (
            <button onClick={() => pinMutation.mutate()} disabled={pinMutation.isPending} title={product.pinned_at ? 'Unpin order' : 'Pin to top'}
              className={`btn-ghost p-2 rounded-lg transition-colors flex-shrink-0 ${product.pinned_at ? 'text-amber-400 hover:text-amber-300' : 'text-surface-400 hover:text-surface-200'}`}>
              {product.pinned_at ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
            </button>
          )}
          <div className="flex items-center gap-3 flex-shrink-0">
            {product && (
              <select value={product.status} onChange={(e) => statusMutation.mutate(e.target.value)} disabled={statusMutation.isPending}
                className={`text-xs px-2.5 py-1 rounded-full status-${product.status} bg-transparent border-0 cursor-pointer disabled:opacity-60`}>
                {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            )}
            <button onClick={handleClose} className="btn-ghost p-2 rounded-lg"><X className="w-5 h-5" /></button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex-shrink-0 flex border-b border-surface-700/50">
          {tabs.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-5 py-3 text-xs font-medium transition-all duration-200 border-b-2 ${activeTab === tab.id ? 'border-brand-500 text-brand-400' : 'border-transparent text-surface-400 hover:text-surface-200'}`}>
              <tab.icon className="w-3.5 h-3.5" /> {tab.label}
              {tab.badge && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className={`flex-1 min-h-0 ${activeTab === 'timeline' ? 'flex flex-col p-5' : 'overflow-y-auto p-5'}`}>
          {activeTab === 'details' && product && (
            <DetailsTab product={product} productId={productId} attachments={attachments}
              onViewTimeline={() => setActiveTab('timeline')} />
          )}
          {activeTab === 'timeline' && (
            <TimelineFeed productId={productId} canPost={canCreateProduct() || true} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Details Tab ──
function DetailsTab({ product, productId, attachments, onViewTimeline }: { product: Product; productId: number; attachments: Attachment[]; onViewTimeline: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploading, uploadFiles_state, uploadFiles, cancelUpload } = useMultiUpload(productId);
  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files) uploadFiles(e.target.files); if (fileInputRef.current) fileInputRef.current.value = ''; };

  const queryClient = useQueryClient();
  const { canCreateProduct } = useAuthStore();
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ product_id: '', customer_name: '', customer_phone: '', description: '', delivery_at: '' });
  const [editAssigneeIds, setEditAssigneeIds] = useState<number[]>([]);


  const { data: usersData } = useQuery({
    queryKey: ['users-list'],
    queryFn: () => usersApi.getList(),
  });
  const usersList = usersData?.data || [];
  const [editError, setEditError] = useState<string | null>(null);

  const startEdit = () => {
    setEditForm({
      product_id: product.product_id,
      customer_name: product.customer_name,
      customer_phone: product.customer_phone || '',
      description: product.description || '',
      delivery_at: product.delivery_at ? new Date(product.delivery_at).toISOString().slice(0, 16) : '',
    });
    setEditAssigneeIds((product.assignees || []).map(u => u.id));
    setEditError(null);
    setEditing(true);
  };

  const editMutation = useMutation({
    mutationFn: (data: typeof editForm) => productsApi.update(productId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setEditing(false);
      setEditError(null);
    },
    onError: (err: any) => {
      setEditError(err.response?.data?.error || 'Failed to save changes');
    },
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editForm.product_id.trim() || !editForm.customer_name.trim()) return;
    editMutation.mutate({
      ...editForm,
      delivery_at: editForm.delivery_at ? new Date(editForm.delivery_at).toISOString() : null,
      assignee_ids: editAssigneeIds,
    } as any);
  };

  return (
    <>
    {uploading && <UploadProgressModal files={uploadFiles_state} onCancel={cancelUpload} />}
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-surface-500 uppercase tracking-wider">Product Details</span>
          {canCreateProduct() && !editing && (
            <button onClick={startEdit} className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 transition-colors bg-brand-500/10 hover:bg-brand-500/20 px-2.5 py-1.5 rounded-lg">
              <Edit2 className="w-3.5 h-3.5" /> Edit
            </button>
          )}
        </div>

        {editing ? (
          <form onSubmit={handleSave} className="space-y-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-surface-500 uppercase tracking-wider">Product ID</label>
              <input
                value={editForm.product_id}
                onChange={(e) => setEditForm(f => ({ ...f, product_id: e.target.value }))}
                className="text-sm"
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-surface-500 uppercase tracking-wider">Customer Name</label>
              <input
                value={editForm.customer_name}
                onChange={(e) => setEditForm(f => ({ ...f, customer_name: e.target.value }))}
                className="text-sm"
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-surface-500 uppercase tracking-wider">Customer Phone</label>
              <input
                value={editForm.customer_phone}
                onChange={(e) => setEditForm(f => ({ ...f, customer_phone: e.target.value }))}
                className="text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-surface-500 uppercase tracking-wider">Description</label>
              <textarea
                value={editForm.description}
                onChange={(e) => setEditForm(f => ({ ...f, description: e.target.value }))}
                rows={3}
                className="text-sm resize-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-surface-500 uppercase tracking-wider">Delivery Date & Time</label>
              <input
                type="datetime-local"
                value={editForm.delivery_at}
                onFocus={() => { if (!editForm.delivery_at) setEditForm(f => ({ ...f, delivery_at: todayAtMidnight() })); }}
                onChange={(e) => setEditForm(f => ({ ...f, delivery_at: e.target.value }))}
                className="text-sm"
              />
              {editForm.delivery_at && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setEditForm(f => ({ ...f, delivery_at: '' }))}
                    className="text-xs text-surface-500 hover:text-surface-300 px-2 py-0.5 rounded transition-colors"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-surface-500 uppercase tracking-wider">Assign To</label>
              {editAssigneeIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-1">
                  {editAssigneeIds.map(id => {
                    const u = usersList.find((u: any) => u.id === id);
                    return u ? (
                      <span key={id} className="inline-flex items-center gap-1.5 text-surface-200 text-xs pl-1 pr-2 py-1 rounded-full border border-surface-700/50 shadow-sm transition-colors hover:border-brand-500/30">
                        <UserAvatar user={u} size="xs" />
                        {(u as any).name}
                        <button type="button" onClick={() => setEditAssigneeIds(prev => prev.filter(x => x !== id))} className="text-surface-500 hover:text-red-400 transition-colors ml-0.5">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ) : null;
                  })}
                </div>
              )}
              <select
                value=""
                onChange={(e) => {
                  const id = Number(e.target.value);
                  if (id && !editAssigneeIds.includes(id)) setEditAssigneeIds(prev => [...prev, id]);
                }}
                className="text-sm"
              >
                <option value="">+ Add assignee…</option>
                {usersList.filter((u: any) => !editAssigneeIds.includes(u.id)).map((u: any) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
            {editError && <p className="text-xs text-red-400">{editError}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => setEditing(false)} className="btn-ghost px-4 py-2 text-sm flex-1" disabled={editMutation.isPending}>
                Cancel
              </button>
              <button type="submit" className="btn-primary px-4 py-2 text-sm flex-1" disabled={editMutation.isPending}>
                {editMutation.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        ) : (
          <>
            <DetailRow label="Product ID" value={product.product_id} />
            <DetailRow label="Customer Name" value={product.customer_name} />
            <DetailRow label="Customer Phone" value={product.customer_phone || '—'} />
            <DetailRow label="Description" value={product.description || '—'} />
            <DetailRow label="Delivery Date & Time" value={product.delivery_at ? formatDateTime(product.delivery_at) : '—'} />
            <DetailRow
              label="Assigned To"
              value={(product.assignees && product.assignees.length > 0) ? (
                <div className="flex flex-wrap gap-2 mt-1">
                  {product.assignees.map(u => (
                    <div key={u.id} className="flex items-center gap-2 px-2 py-1.5 rounded-xl border border-surface-700/30 hover:border-brand-500/30 transition-colors">
                      <UserAvatar user={u} size="xs" />
                      <span className="text-sm font-medium">{u.name}</span>
                    </div>
                  ))}
                </div>
              ) : '—'}
            />
          </>
        )}
        <DetailRow label="Created By" value={product.creator?.name || '—'} />
        <DetailRow label="Created At" value={formatDateTime(product.created_at)} />
      </div>
      <CustomerLinkSection productId={productId} />
      <div className="border-t border-surface-700/50 pt-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Paperclip className="w-4 h-4 text-surface-400" />
            <span className="text-xs font-medium text-surface-500 uppercase tracking-wider">Attachments ({attachments.filter((a) => !a.source || a.source === 'direct').length})</span>
          </div>
          <div className="flex items-center gap-2">
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleUpload} />
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 transition-colors bg-brand-500/10 hover:bg-brand-500/20 px-2.5 py-1.5 rounded-lg">
              <Plus className="w-3.5 h-3.5" /> Add Files
            </button>
            {attachments.filter((a) => !a.source || a.source === 'direct').length > 0 && <button onClick={onViewTimeline} className="text-xs text-surface-400 hover:text-surface-200 transition-colors">View in Timeline →</button>}
          </div>
        </div>
        {attachments.filter((a) => !a.source || a.source === 'direct').length === 0 ? (
          <div className="flex flex-col items-center gap-2 text-surface-500 text-sm py-6 border-2 border-dashed border-surface-700/50 rounded-xl cursor-pointer hover:border-brand-500/30 hover:text-surface-400 transition-colors" onClick={() => fileInputRef.current?.click()}>
            <Upload className="w-5 h-5 opacity-40" /><span>Click to add attachments</span>
          </div>
        ) : (
          <>
            {attachments.filter((a) => (!a.source || a.source === 'direct') && isImageType(a.file_type)).length > 0 && (
              <div className="grid grid-cols-3 gap-2 mb-3">
                {attachments.filter((a) => (!a.source || a.source === 'direct') && isImageType(a.file_type)).map((att) => (
                  <div key={att.id} className="group relative aspect-square rounded-lg overflow-hidden bg-surface-800 border border-surface-700/50 hover:border-brand-500/50 transition-all cursor-pointer" onClick={() => onCommentAttachment(att)}>
                    <img src={getAttachmentUrl(att)} alt={att.file_name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center"><MessageSquare className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" /></div>
                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent p-1.5"><p className="text-[10px] text-white truncate">{att.file_name}</p></div>
                  </div>
                ))}
              </div>
            )}
            {attachments.filter((a) => (!a.source || a.source === 'direct') && !isImageType(a.file_type)).map((att) => {
              const Icon = getFileIcon(att.file_type);
              return (
                <div key={att.id} className="flex items-center gap-3 p-2.5 bg-surface-800/50 rounded-lg hover:bg-surface-800 transition-colors mb-1.5 cursor-pointer" onClick={() => onCommentAttachment(att)}>
                  <div className="w-8 h-8 rounded bg-surface-700 flex items-center justify-center flex-shrink-0"><Icon className="w-4 h-4 text-surface-400" /></div>
                  <div className="flex-1 min-w-0"><p className="text-sm truncate">{att.file_name}</p><p className="text-xs text-surface-500">{formatSize(att.file_size)}</p></div>
                  <button onClick={(e) => { e.stopPropagation(); downloadViaFetch(attachmentsApi.download(att.id), att.file_name, true); }} className="btn-ghost p-1.5 rounded-lg"><Download className="w-3.5 h-3.5" /></button>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-surface-500 uppercase tracking-wider">{label}</span>
      <span className="text-sm text-surface-200">{value}</span>
    </div>
  );
}

// ── Attachments Tab ──
function AttachmentsTab({ productId, attachments, onCommentAttachment }: { productId: number; attachments: Attachment[]; onCommentAttachment: (att: Attachment) => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { uploading, uploadFiles_state, uploadFiles, cancelUpload } = useMultiUpload(productId);
  const [lightbox, setLightbox] = useState<{ src: string; attId: number; filename: string } | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const deleteMutation = useMutation({ 
    mutationFn: (id: number) => attachmentsApi.delete(id), 
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attachments', productId] });
      setDeleteConfirmId(null);
      setDeleteError(null);
    },
    onError: (error: any) => {
      if (error.response?.status === 403) {
        setDeleteError("You don't have permission to delete this attachment.");
      } else {
        setDeleteError("Failed to delete attachment. Please try again.");
      }
    }
  });

  const handleDelete = (id: number) => {
    setDeleteConfirmId(id);
    setDeleteError(null);
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files) uploadFiles(e.target.files); if (fileInputRef.current) fileInputRef.current.value = ''; };

  const directAttachments = attachments.filter((a) => !a.source || a.source === 'direct');
  const images = directAttachments.filter((a) => isImageType(a.file_type));
  const files = directAttachments.filter((a) => !isImageType(a.file_type));

  return (
    <>
    {uploading && <UploadProgressModal files={uploadFiles_state} onCancel={cancelUpload} />}
    <div className="space-y-4">
      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleUpload} />
      <div className="flex gap-2">
        <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="btn-secondary flex items-center gap-2 flex-1 justify-center">
          <Upload className="w-4 h-4" /> Upload Files
        </button>
        {directAttachments.length > 0 && (
          <button
            onClick={async () => {
              for (const att of directAttachments) {
                try {
                  await downloadViaFetch(attachmentsApi.download(att.id), att.file_name, true);
                  await new Promise(resolve => setTimeout(resolve, 300));
                } catch (err) { console.error(`Failed to download ${att.file_name}:`, err); }
              }
            }}
            className="btn-ghost border border-surface-700/50 hover:bg-surface-700/50 flex items-center gap-2 px-4 justify-center"
            title="Download All Attachments"
          >
            <Download className="w-4 h-4" /> Download All
          </button>
        )}
      </div>

      {directAttachments.length === 0 ? (
        <div className="flex flex-col items-center gap-2 text-surface-500 text-sm py-12 border-2 border-dashed border-surface-700/50 rounded-xl cursor-pointer hover:border-brand-500/30 hover:text-surface-400 transition-colors" onClick={() => fileInputRef.current?.click()}>
          <Upload className="w-6 h-6 opacity-40" />
          <span>No attachments — click to upload</span>
        </div>
      ) : (
        <>
          {/* Image gallery */}
          {images.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {images.map((att) => (
                <div key={att.id} className="group relative aspect-[4/3] rounded-xl overflow-hidden bg-surface-800 border border-surface-700/50 hover:border-brand-500/50 transition-all">
                  <img src={getAttachmentUrl(att)} alt={att.file_name} className="w-full h-full object-cover cursor-pointer group-hover:scale-105 transition-transform duration-300" onClick={() => setLightbox({ src: getAttachmentUrl(att), attId: att.id, filename: att.file_name })} />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-end p-3 pointer-events-none">
                    <p className="text-xs text-white font-medium truncate mb-2">{att.file_name}</p>
                    <div className="flex items-center gap-1.5 pointer-events-auto hover-icon-white">
                      <button onClick={(e) => { e.stopPropagation(); downloadViaFetch(attachmentsApi.download(att.id), att.file_name, true); }} className="flex items-center gap-1 bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white hover:text-white text-[10px] px-2 py-1 rounded-md transition-colors"><Download className="w-3 h-3" /> Download</button>
                      <button onClick={(e) => { e.stopPropagation(); onCommentAttachment(att); }} className="flex items-center gap-1 bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white hover:text-white text-[10px] px-2 py-1 rounded-md transition-colors"><MessageSquare className="w-3 h-3" /> Comment</button>
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(att.id); }} className="flex items-center gap-1 bg-red-500/40 hover:bg-red-500/60 backdrop-blur-sm text-white hover:text-white text-[10px] px-2 py-1 rounded-md transition-colors ml-auto"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Non-image files */}
          {files.length > 0 && (
            <div className="space-y-1.5">
              {images.length > 0 && <p className="text-xs font-medium text-surface-500 uppercase tracking-wider mt-2">Other Files</p>}
              {files.map((att) => {
                const Icon = getFileIcon(att.file_type);
                return (
                  <div key={att.id} className="group flex items-center gap-3 p-3 bg-surface-800/50 rounded-lg hover:bg-surface-800 transition-colors">
                    <div className="w-10 h-10 rounded-lg bg-surface-700 flex items-center justify-center flex-shrink-0"><Icon className="w-5 h-5 text-surface-400" /></div>
                    <div className="flex-1 min-w-0"><p className="text-sm truncate">{att.file_name}</p><p className="text-xs text-surface-500">{formatSize(att.file_size)} · {att.uploader?.name} · {formatDate(att.uploaded_at)}</p></div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => onCommentAttachment(att)} className="btn-ghost p-1.5 rounded-lg" title="Comment"><MessageSquare className="w-3.5 h-3.5" /></button>
                      <button onClick={() => downloadViaFetch(attachmentsApi.download(att.id), att.file_name, true)} className="btn-ghost p-1.5 rounded-lg"><Download className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleDelete(att.id)} className="btn-ghost p-1.5 rounded-lg text-red-400 hover:text-red-300" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in" onMouseDown={(e) => { if (e.target === e.currentTarget) setDeleteConfirmId(null); }}>
          <div className="w-full max-w-sm glass rounded-2xl p-6 text-center animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="w-12 h-12 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold mb-2">Delete Attachment?</h3>
            
            {deleteError ? (
              <div className="mb-6 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                {deleteError}
              </div>
            ) : (
              <p className="text-surface-400 text-sm mb-6">
                Are you sure you want to delete this attachment? This action cannot be undone.
              </p>
            )}

            <div className="flex gap-3 justify-center">
              <button 
                onClick={() => {
                  setDeleteConfirmId(null);
                  setDeleteError(null);
                }} 
                className="btn-ghost px-5 py-2.5"
                disabled={deleteMutation.isPending}
              >
                Cancel
              </button>
              {!deleteError && (
                <button 
                  onClick={() => deleteMutation.mutate(deleteConfirmId)} 
                  className="btn-danger px-5 py-2.5 flex items-center gap-2"
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {lightbox && <ImageLightbox src={lightbox.src} alt={lightbox.filename} attId={lightbox.attId} onClose={() => setLightbox(null)} />}
    </div>
    </>
  );
}

// ── Parse comment content ──
interface ParsedComment {
  text: string;
  attachmentId?: number;   // new format: stores attachment ID
  attachmentUrl?: string;  // legacy format: stores URL directly
  attachmentName?: string;
  replyToId?: number;
  replyPreview?: string;
}

function parseCommentMessage(raw: string): ParsedComment {
  const result: ParsedComment = { text: '' };
  const lines = raw.split('\n');
  const textLines: string[] = [];

  for (const line of lines) {
    // Parse attachment reference: [attachment:URL:filename]
    // Greedy (.+) is used for the URL so it doesn't break on 'https://'
    const attMatch = line.match(/^\[attachment:(.+):(.+?)\]$/);
    if (attMatch) {
      const idOrUrl = attMatch[1];
      const numId = parseInt(idOrUrl, 10);
      if (!isNaN(numId) && String(numId) === idOrUrl) {
        result.attachmentId = numId;
      } else {
        result.attachmentUrl = idOrUrl;
      }
      result.attachmentName = attMatch[2];
      continue;
    }
    // Parse reply reference: [reply:123:preview text] or [reply:123]
    const replyMatch = line.match(/^\[reply:(\d+)(?::(.+?))?\]$/);
    if (replyMatch) {
      result.replyToId = parseInt(replyMatch[1]);
      if (replyMatch[2]) result.replyPreview = replyMatch[2];
      continue;
    }
    // Skip old-style 💬 [Re:...] lines
    if (/^💬 \[Re:/.test(line)) continue;
    // Skip old-style standalone 📎 /uploads/... lines
    if (/^📎 \/uploads\//.test(line)) continue;

    textLines.push(line);
  }

  result.text = textLines.join('\n').trim();
  return result;
}

// ── Comments Tab ──
function CommentsTab({ productId, comments, attachments }: { productId: number; comments: Comment[]; attachments: Attachment[] }) {
  const [message, setMessage] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editMessage, setEditMessage] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
  const [lightbox, setLightbox] = useState<{ src: string; attId?: number; filename: string } | null>(null);
  const [highlightedId, setHighlightedId] = useState<number | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commentRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<MentionInputHandle>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const highlightComment = (id: number) => {
    const el = commentRefs.current[id];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    setHighlightedId(id);
    highlightTimer.current = setTimeout(() => setHighlightedId(null), 5000);
  };
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const { uploading, uploadFiles_state, uploadFiles, cancelUpload } = useMultiUpload(productId, 'comment');

  // Scroll to bottom on initial mount (tab open)
  useEffect(() => {
    endRef.current?.scrollIntoView();
  }, []);

  // Scroll to bottom when a new comment arrives
  const lastCommentId = comments[comments.length - 1]?.id;
  useEffect(() => {
    if (!lastCommentId) return;
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lastCommentId]);

  const createMutation = useMutation({
    mutationFn: (msg: string) => commentsApi.create(productId, msg),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', productId] });
      setMessage('');
      setReplyTo(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, msg }: { id: number; msg: string }) => commentsApi.update(id, msg),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', productId] });
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => commentsApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['comments', productId] }),
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    uploadFiles(files, (att) => {
      createMutation.mutate(`📎 Uploaded: ${att.file_name}\n[attachment:${att.id}:${att.file_name}]`);
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!message.trim()) return;
    let msg = message.trim();
    if (replyTo) {
      const preview = parseCommentMessage(replyTo.message).text.slice(0, 60);
      msg = `[reply:${replyTo.id}:${preview}]\n${msg}`;
    }
    createMutation.mutate(msg);
  };

  const handleReply = (comment: Comment) => {
    setReplyTo(comment);
    setMenuOpenId(null);
    inputRef.current?.focus();
  };

  return (
    <>
    {uploading && <UploadProgressModal files={uploadFiles_state} onCancel={cancelUpload} />}
    <div className="flex flex-col h-full">
      <div className="flex-1 space-y-3 mb-4">
        {comments.length === 0 ? (
          <p className="text-center text-surface-500 text-sm py-8">No comments yet</p>
        ) : (
          comments.map((c) => {
            const parsed = parseCommentMessage(c.message);
            const isOwn = c.user_id === user?.id;
            const resolvedAtt = parsed.attachmentId ? attachments.find(a => a.id === parsed.attachmentId) : null;

            // Resolve quoted comment's attachment thumbnail
            const quotedComment = parsed.replyToId ? comments.find(m => m.id === parsed.replyToId) : null;
            const quotedParsed = quotedComment ? parseCommentMessage(quotedComment.message) : null;
            const quotedThumbAtt = quotedParsed?.attachmentId ? attachments.find(a => a.id === quotedParsed.attachmentId) : null;
            const quotedThumbUrl = quotedThumbAtt && isImageType(quotedThumbAtt.file_type) ? getAttachmentUrl(quotedThumbAtt) : null;
            const attachmentDisplayUrl = resolvedAtt ? getAttachmentUrl(resolvedAtt) : parsed.attachmentUrl;
            const attachmentIsImage = resolvedAtt ? isImageType(resolvedAtt.file_type) : (parsed.attachmentUrl ? isImageUrl(parsed.attachmentUrl) : false);
            const handleAttachmentDownload = (e: React.MouseEvent) => {
              e.stopPropagation();
              if (parsed.attachmentId) {
                downloadViaFetch(attachmentsApi.download(parsed.attachmentId), parsed.attachmentName || 'attachment', true);
              } else if (parsed.attachmentUrl) {
                downloadViaFetch(parsed.attachmentUrl, parsed.attachmentName || 'attachment');
              }
            };

            const isHighlighted = highlightedId === c.id;

            return (
              <div
                key={c.id}
                ref={(el) => { commentRefs.current[c.id] = el; }}
                className={`group flex gap-2 w-full rounded-lg transition-colors duration-500 ${isOwn ? 'justify-end' : 'justify-start'}`}
                style={{ background: isHighlighted ? 'rgba(99,102,241,0.15)' : 'transparent', padding: '2px 0' }}
              >
                {/* Avatar (only for others) */}
                {!isOwn && (
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-400 to-purple-500 flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 mt-auto mb-1 shadow-sm">
                    {c.user?.name?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                )}

                {/* Left side actions (for own messages) */}
                {isOwn && editingId !== c.id && (
                  <div className="flex flex-col justify-center opacity-0 group-hover:opacity-100 transition-opacity px-1">
                    <div className="relative">
                      <button
                        onClick={() => setMenuOpenId(menuOpenId === c.id ? null : c.id)}
                        className="btn-ghost p-1 rounded-full bg-surface-800/80 shadow-sm border border-surface-700/50 hover:bg-surface-700"
                      >
                        <MoreVertical className="w-3.5 h-3.5 text-surface-400" />
                      </button>

                      {menuOpenId === c.id && (
                        <div className="absolute right-0 top-8 z-10 glass rounded-lg py-1 min-w-[120px] shadow-xl animate-scale-in">
                          <button
                            onClick={() => { handleReply(c); }}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-surface-300 hover:bg-surface-700/50 transition-colors"
                          >
                            <Reply className="w-3 h-3" /> Reply
                          </button>
                          <button
                            onClick={() => { setEditingId(c.id); setEditMessage(parsed.text); setMenuOpenId(null); }}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-surface-300 hover:bg-surface-700/50 transition-colors"
                          >
                            <Edit2 className="w-3 h-3" /> Edit
                          </button>
                          <button
                            onClick={() => { deleteMutation.mutate(c.id); setMenuOpenId(null); }}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-surface-700/50 transition-colors"
                          >
                            <Trash2 className="w-3 h-3" /> Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Bubble Container */}
                <div className={`flex flex-col max-w-[85%] ${isOwn ? 'items-end' : 'items-start'}`}>
                  {/* Name + Time (header), shown outside the bubble */}
                  <div className={`flex items-baseline gap-2 mb-1 px-1 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                    {!isOwn && <span className="text-[11px] font-medium text-surface-400">{c.user?.name}</span>}
                    <span className="text-[10px] text-surface-500">
                      {formatTime(c.created_at)}
                    </span>
                  </div>

                  {/* Bubble */}
                  <div className={`relative px-3.5 py-2 shadow-sm ${
                    isOwn 
                      ? 'bg-brand-600 text-white rounded-2xl rounded-tr-sm' 
                      : 'text-surface-200 rounded-2xl rounded-tl-sm border border-surface-700/50 shadow-sm'
                  }`}>
                    {/* Reply reference */}
                    {parsed.replyToId && (parsed.replyPreview || quotedThumbUrl) && (
                      <div
                        className={`mb-1.5 flex items-stretch gap-0 rounded-lg overflow-hidden border-l-2 cursor-pointer hover:brightness-95 ${
                          isOwn
                            ? 'bg-black/10 border-white/40 text-white/90'
                            : 'bg-surface-900/60 border-brand-500/50 text-surface-300'
                        }`}
                        onClick={() => highlightComment(parsed.replyToId!)}
                      >
                        <div className="flex flex-1 min-w-0 items-center gap-1.5 px-2.5 py-1.5 text-xs">
                          <Reply className="w-3 h-3 flex-shrink-0 rotate-180" />
                          {parsed.replyPreview && <span className="truncate">{parsed.replyPreview}</span>}
                        </div>
                        {quotedThumbUrl && (
                          <div className="w-10 h-10 flex-shrink-0 overflow-hidden">
                            <img src={quotedThumbUrl} alt="preview" className="w-full h-full object-cover" />
                          </div>
                        )}
                      </div>
                    )}

                    {/* Edit mode */}
                    {editingId === c.id ? (
                      <div className="flex gap-2">
                        <input value={editMessage} onChange={(e) => setEditMessage(e.target.value)} className={`text-sm rounded px-2 py-1 min-w-[200px] ${
                          isOwn ? 'bg-black/20 border border-white/20 text-white placeholder-white/50' : 'bg-surface-900 border border-surface-700 text-surface-200'
                        }`} autoFocus />
                        <div className="flex flex-col gap-1">
                          <button onClick={() => updateMutation.mutate({ id: c.id, msg: editMessage })} className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                            isOwn ? 'bg-white text-brand-600' : 'bg-brand-500 text-white'
                          }`}>Save</button>
                          <button onClick={() => setEditingId(null)} className={`text-[10px] px-2 py-0.5 rounded ${
                            isOwn ? 'bg-black/30 text-white' : 'bg-surface-700 text-surface-300'
                          }`}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* Comment text */}
                        {parsed.text && (
                          <p className={`text-sm whitespace-pre-wrap ${isOwn ? 'text-white/95' : 'text-surface-200'}`}>
                            {renderWithMentions(parsed.text, user?.name, undefined, isOwn)}
                          </p>
                        )}

                        {/* Attached image in comment */}
                        {attachmentDisplayUrl && attachmentIsImage && (
                          <div className={`mt-2 group/img relative aspect-square w-[120px] rounded-xl overflow-hidden border-none ${
                            isOwn ? 'bg-black/10' : 'bg-surface-900'
                          }`}>
                            <img
                              src={attachmentDisplayUrl}
                              alt={parsed.attachmentName || 'attachment'}
                              className="w-full h-full object-cover cursor-pointer group-hover/img:scale-105 transition-transform duration-300"
                              onClick={() => setLightbox({ src: attachmentDisplayUrl, attId: parsed.attachmentId, filename: parsed.attachmentName || "attachment" })}
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover/img:opacity-100 transition-opacity duration-200 flex flex-col justify-end p-2 pointer-events-none">
                              <p className="text-[10px] text-white font-medium truncate mb-1.5">{parsed.attachmentName}</p>
                              <div className="flex items-center gap-1.5 pointer-events-auto hover-icon-white">
                                <button
                                  onClick={handleAttachmentDownload}
                                  className="flex items-center gap-1 bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white hover:text-white text-[10px] px-2 py-1 rounded-md transition-colors"
                                >
                                  <Download className="w-3 h-3" /> Download
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Non-image attachment */}
                        {attachmentDisplayUrl && !attachmentIsImage && (
                          <button onClick={handleAttachmentDownload} className={`mt-2 flex items-center gap-2.5 p-2 rounded-xl transition-colors w-[220px] text-left ${
                            isOwn ? 'bg-black/10 hover:bg-black/20' : 'bg-surface-900 hover:bg-surface-800 border border-surface-700/50'
                          }`}>
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isOwn ? 'bg-black/10' : 'bg-surface-800'}`}>
                              <FileText className={`w-4 h-4 ${isOwn ? 'text-white/80' : 'text-surface-400'}`} />
                            </div>
                            <span className={`text-xs truncate flex-1 ${isOwn ? 'text-white/90' : 'text-surface-300'}`}>{parsed.attachmentName || 'File'}</span>
                            <Download className={`w-3.5 h-3.5 flex-shrink-0 ${isOwn ? 'text-white/60' : 'text-surface-500'}`} />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Right side actions (for others' messages) */}
                {!isOwn && editingId !== c.id && (
                  <div className="flex flex-col justify-center opacity-0 group-hover:opacity-100 transition-opacity px-1">
                    <div className="relative">
                      <button
                        onClick={() => setMenuOpenId(menuOpenId === c.id ? null : c.id)}
                        className="btn-ghost p-1 rounded-full bg-surface-800/80 shadow-sm border border-surface-700/50 hover:bg-surface-700"
                      >
                        <MoreVertical className="w-3.5 h-3.5 text-surface-400" />
                      </button>

                      {menuOpenId === c.id && (
                        <div className="absolute left-0 top-8 z-10 glass rounded-lg py-1 min-w-[120px] shadow-xl animate-scale-in">
                          <button
                            onClick={() => { handleReply(c); }}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-surface-300 hover:bg-surface-700/50 transition-colors"
                          >
                            <Reply className="w-3 h-3" /> Reply
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      {/* Reply bar */}
      {replyTo && (
        <div className="flex items-center gap-2 mb-2 bg-brand-500/5 border-l-2 border-brand-500 pl-3 pr-2 py-2 rounded-r-lg">
          <Reply className="w-3.5 h-3.5 text-brand-400 flex-shrink-0 rotate-180" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-brand-400 font-medium">{replyTo.user?.name}</p>
            {(() => { const p = parseCommentMessage(replyTo.message); const preview = p.text.slice(0, 60) || (p.attachmentName ? `📎 ${p.attachmentName}` : ''); return <p className="text-xs text-surface-400 truncate">{preview}</p>; })()}
          </div>
          <button onClick={() => setReplyTo(null)} className="btn-ghost p-1 rounded"><X className="w-3 h-3" /></button>
        </div>
      )}

      {/* Input */}
      <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.doc,.docx,.txt,.xlsx,.csv" className="hidden" onChange={handleFileUpload} />
      <form onSubmit={handleSubmit} className="flex gap-2">
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="btn-ghost p-2.5 rounded-xl flex-shrink-0" title="Upload files">
          <ImagePlus className="w-4 h-4" />
        </button>
        <MentionInput
          ref={inputRef}
          value={message}
          onChange={setMessage}
          onSubmit={handleSubmit}
          placeholder={replyTo ? `Reply to ${replyTo.user?.name}... (@name to mention)` : 'Add a comment... (@name to mention)'}
        />
        <button type="submit" disabled={!message.trim()} className="btn-primary px-3"><Send className="w-4 h-4" /></button>
      </form>

      {/* Image lightbox */}
      {lightbox && <ImageLightbox src={lightbox.src} alt={lightbox.filename} attId={lightbox.attId} onClose={() => setLightbox(null)} />}
    </div>
    </>
  );
}

// ── Customer Link Section (inside DetailsTab view mode) ──
function CustomerLinkSection({ productId }: { productId: number }) {
  const queryClient = useQueryClient();
  const { canCreateProduct } = useAuthStore();
  const [copied, setCopied] = useState(false);

  const { data: linkData, isLoading } = useQuery({
    queryKey: ['customer-link', productId],
    queryFn: () => customerLinkApi.get(productId).then(r => r.data.link as CustomerLink | null),
  });
  const customerLink: CustomerLink | null = linkData ?? null;

  const createMutation = useMutation({
    mutationFn: () => customerLinkApi.create(productId).then(r => r.data.link),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customer-link', productId] }),
  });

  const revokeMutation = useMutation({
    mutationFn: (linkId: number) => customerLinkApi.deactivate(productId, linkId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customer-link', productId] }),
  });

  if (!canCreateProduct()) return null;

  const isExpired = customerLink ? new Date(customerLink.expires_at).getTime() < Date.now() : false;
  const portalUrl = customerLink
    ? `${window.location.origin}/portal/${customerLink.token}`
    : '';

  const handleCopy = () => {
    navigator.clipboard.writeText(portalUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border-t border-surface-700/50 pt-4">
      <div className="flex items-center gap-2 mb-3">
        <Link2 className="w-4 h-4 text-surface-400" />
        <span className="text-xs font-medium text-surface-500 uppercase tracking-wider">Customer Portal Link</span>
      </div>

      {isLoading ? (
        <div className="h-9 bg-surface-800/50 rounded-lg animate-pulse" />
      ) : customerLink ? (
        <div className="space-y-2">
          {isExpired && (
            <div className="flex items-center gap-2 p-2 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs mb-2">
              <span className="font-medium">Link Expired</span>
              <span>This link has passed its 7-day expiration. Please generate a new one.</span>
            </div>
          )}
          <div className={`flex items-center gap-2 bg-surface-800/50 rounded-lg px-3 py-2 border border-surface-700/50 ${isExpired ? 'opacity-50' : ''}`}>
            <span className={`text-xs flex-1 truncate font-mono ${isExpired ? 'text-surface-500 line-through' : 'text-surface-300'}`}>{portalUrl}</span>
            <button
              onClick={handleCopy}
              disabled={isExpired}
              className={`flex items-center gap-1 text-xs transition-colors flex-shrink-0 ${isExpired ? 'text-surface-600 cursor-not-allowed' : 'text-brand-400 hover:text-brand-300'}`}
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[10px] text-surface-500 uppercase tracking-wider">
              {isExpired ? (
                <>Expired on {new Date(customerLink.expires_at).toLocaleString()}</>
              ) : (
                <>Expires on {new Date(customerLink.expires_at).toLocaleString()}</>
              )}
            </span>
            <button
              onClick={() => revokeMutation.mutate(customerLink.id)}
              disabled={revokeMutation.isPending}
              className="text-xs text-red-400 hover:text-red-300 transition-colors"
            >
              {revokeMutation.isPending ? 'Revoking...' : isExpired ? 'Remove Link' : 'Revoke Link'}
            </button>
          </div>
          {isExpired && (
            <button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
              className="w-full mt-2 flex items-center justify-center gap-2 text-xs text-brand-400 hover:text-brand-300 bg-brand-500/10 hover:bg-brand-500/20 px-3 py-2.5 rounded-lg transition-colors border border-brand-500/20 hover:border-brand-500/30"
            >
              <Link2 className="w-3.5 h-3.5" />
              {createMutation.isPending ? 'Generating...' : 'Generate New Link'}
            </button>
          )}
        </div>
      ) : (
        <button
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending}
          className="w-full flex items-center justify-center gap-2 text-xs text-brand-400 hover:text-brand-300 bg-brand-500/10 hover:bg-brand-500/20 px-3 py-2.5 rounded-lg transition-colors border border-brand-500/20 hover:border-brand-500/30"
        >
          <Link2 className="w-3.5 h-3.5" />
          {createMutation.isPending ? 'Generating...' : 'Generate Customer Link'}
        </button>
      )}
    </div>
  );
}

// ── Customer Attachments Tab (read-only view of customer-submitted files) ──
function CustomerAttachmentsTab({ productId, attachments }: { productId: number; attachments: Attachment[] }) {
  const [lightbox, setLightbox] = useState<{ src: string; filename: string; attId: number } | null>(null);
  const images = attachments.filter(a => isImageType(a.file_type));
  const files = attachments.filter(a => !isImageType(a.file_type));

  if (attachments.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 text-surface-500 text-sm py-12 border-2 border-dashed border-surface-700/50 rounded-xl">
        <User className="w-6 h-6 opacity-40" />
        <span>No customer files yet</span>
        <span className="text-xs text-surface-600">Files uploaded via the customer portal will appear here</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={async () => {
            for (const att of attachments) {
              try {
                await downloadViaFetch(attachmentsApi.download(att.id), att.file_name, true);
                await new Promise(resolve => setTimeout(resolve, 300));
              } catch (err) { console.error(`Failed to download ${att.file_name}:`, err); }
            }
          }}
          className="btn-ghost border border-surface-700/50 hover:bg-surface-700/50 flex items-center gap-2 px-4 py-2 text-sm justify-center"
          title="Download All"
        >
          <Download className="w-4 h-4" /> Download All ({attachments.length})
        </button>
      </div>
      {images.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {images.map((att) => (
            <div key={att.id} className="group relative aspect-[4/3] rounded-xl overflow-hidden bg-surface-800 border border-surface-700/50 hover:border-teal-500/50 transition-all">
              <img
                src={getAttachmentUrl(att)}
                alt={att.file_name}
                className="w-full h-full object-cover cursor-pointer group-hover:scale-105 transition-transform duration-300"
                onClick={() => setLightbox({ src: getAttachmentUrl(att), filename: att.file_name, attId: att.id })}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-end p-3 pointer-events-none">
                <p className="text-xs text-white font-medium truncate mb-1">{att.file_name}</p>
                <p className="text-[10px] text-white/60">{att.portal_sender || 'Customer'}</p>
              </div>
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                <button
                  onClick={(e) => { e.stopPropagation(); downloadViaFetch(attachmentsApi.download(att.id), att.file_name, true); }}
                  className="bg-surface-900/80 p-1.5 rounded-lg hover:bg-surface-800"
                  title="Download"
                >
                  <Download className="w-3.5 h-3.5 text-white" />
                </button>
                <a
                  href={getAttachmentUrl(att)} target="_blank" rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="bg-surface-900/80 p-1.5 rounded-lg hover:bg-surface-800 flex items-center"
                  title="Open in new tab"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-white" />
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <div className="space-y-1.5">
          {images.length > 0 && <p className="text-xs font-medium text-surface-500 uppercase tracking-wider mt-2">Other Files</p>}
          {files.map((att) => {
            const Icon = getFileIcon(att.file_type);
            return (
              <div key={att.id} className="flex items-center gap-3 p-3 bg-surface-800/50 rounded-lg hover:bg-surface-800 transition-colors">
                <div className="w-10 h-10 rounded-lg bg-surface-700 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-5 h-5 text-surface-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{att.file_name}</p>
                  <p className="text-xs text-surface-500">{formatSize(att.file_size)} · {att.portal_sender || 'Customer'} · {formatDate(att.uploaded_at)}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => downloadViaFetch(attachmentsApi.download(att.id), att.file_name, true)}
                    className="btn-ghost p-1.5 rounded-lg"
                    title="Download"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                  <a
                    href={getAttachmentUrl(att)} target="_blank" rel="noreferrer"
                    className="btn-ghost p-1.5 rounded-lg flex items-center"
                    title="Open in new tab"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {lightbox && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) setLightbox(null); }}>
          <div className="relative max-w-4xl max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <img src={lightbox.src} alt={lightbox.filename} className="max-w-full max-h-[85vh] object-contain rounded-xl" />
            <div className="absolute top-3 right-3 flex gap-2">
              <button onClick={() => downloadViaFetch(attachmentsApi.download(lightbox.attId), lightbox.filename, true)} className="bg-white/90 backdrop-blur-sm p-2 rounded-lg hover:bg-white transition-colors shadow-lg" title="Download">
                <Download className="w-5 h-5 text-gray-800" />
              </button>
              <a href={lightbox.src} target="_blank" rel="noreferrer" className="bg-white/90 backdrop-blur-sm p-2 rounded-lg hover:bg-white transition-colors shadow-lg" title="Open in new tab">
                <ExternalLink className="w-5 h-5 text-gray-800" />
              </a>
              <button onClick={() => setLightbox(null)} className="bg-white/90 backdrop-blur-sm p-2 rounded-lg hover:bg-white transition-colors shadow-lg" title="Close">
                <X className="w-5 h-5 text-gray-800" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Customer Comments Tab (read-only view of customer-submitted messages) ──
function CustomerCommentsTab({ comments, attachments }: { comments: Comment[]; attachments: Attachment[] }) {
  const [lightbox, setLightbox] = useState<{ src: string; filename: string; attId?: number } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [highlightedId, setHighlightedId] = useState<number | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const msgRefs = useRef<Record<number, HTMLDivElement | null>>({});

  useEffect(() => { endRef.current?.scrollIntoView(); }, []);

  const highlightMessage = (id: number) => {
    const el = msgRefs.current[id];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    setHighlightedId(id);
    highlightTimer.current = setTimeout(() => setHighlightedId(null), 5000);
  };

  if (comments.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 text-surface-500 text-sm py-12 border-2 border-dashed border-surface-700/50 rounded-xl">
        <User className="w-6 h-6 opacity-40" />
        <span>No customer messages yet</span>
        <span className="text-xs text-surface-600">Messages sent via the customer portal will appear here</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 space-y-3">
        {comments.map((c) => {
          const parsed = parseCommentMessage(c.message);
          const resolvedAtt = parsed.attachmentId ? attachments.find(a => a.id === parsed.attachmentId) : null;
          const attachmentDisplayUrl = resolvedAtt ? getAttachmentUrl(resolvedAtt) : parsed.attachmentUrl;
          const attachmentIsImage = resolvedAtt ? isImageType(resolvedAtt.file_type) : (parsed.attachmentUrl ? isImageUrl(parsed.attachmentUrl) : false);
          const senderName = c.portal_sender || 'Customer';

          const quotedComment = parsed.replyToId ? comments.find(m => m.id === parsed.replyToId) : null;
          const quotedPreview = quotedComment
            ? (() => { const qp = parseCommentMessage(quotedComment.message); return qp.text?.slice(0, 80) || (qp.attachmentName ? `📎 ${qp.attachmentName}` : quotedComment.message.slice(0, 80)); })()
            : parsed.replyPreview || null;
          const quotedSender = quotedComment?.portal_sender || null;
          const quotedThumbAtt = quotedComment ? (() => { const qp = parseCommentMessage(quotedComment.message); return qp.attachmentId ? attachments.find(a => a.id === qp.attachmentId) : null; })() : null;
          const quotedThumbUrl = quotedThumbAtt && isImageType(quotedThumbAtt.file_type) ? getAttachmentUrl(quotedThumbAtt) : null;

          const isHighlighted = highlightedId === c.id;

          // Skip empty bubbles: no text and attachment is deleted/missing
          const hasVisibleContent = parsed.text || attachmentDisplayUrl;
          if (!hasVisibleContent) return null;

          return (
            <div
              key={c.id}
              ref={(el) => { msgRefs.current[c.id] = el; }}
              className="flex gap-3 justify-start rounded-lg transition-colors duration-500"
              style={{ background: isHighlighted ? 'rgba(37,211,102,0.15)' : 'transparent', padding: '4px 0' }}
            >
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-400 to-cyan-500 flex items-center justify-center text-sm font-bold text-white flex-shrink-0 mt-auto mb-1 shadow-sm">
                {senderName.charAt(0).toUpperCase()}
              </div>
              <div className="flex flex-col max-w-[92%] items-start">
                <div className="flex items-baseline gap-2 mb-1 px-1">
                  <span className="text-xs font-medium text-teal-400">{senderName}</span>
                  <span className="text-[11px] text-surface-500">{formatTime(c.created_at)}</span>
                </div>
                <div className="relative px-5 py-3 bg-teal-900/30 border border-teal-700/30 text-surface-200 rounded-2xl rounded-tl-sm shadow-sm">
                  {(quotedPreview || quotedThumbUrl) && (
                    <div
                      className={`mb-2 flex items-stretch gap-0 rounded-lg overflow-hidden border-l-4 border-teal-500 ${quotedComment ? 'cursor-pointer hover:brightness-95' : ''}`}
                      style={{ background: 'rgba(0,0,0,0.15)' }}
                      onClick={quotedComment ? () => highlightMessage(quotedComment.id) : undefined}
                    >
                      <div className="flex-1 min-w-0 px-2.5 py-1.5">
                        {quotedSender && <p className="text-[10px] font-semibold text-teal-400 truncate">{quotedSender}</p>}
                        {quotedPreview && <p className="text-xs text-surface-400 truncate">{quotedPreview}</p>}
                      </div>
                      {quotedThumbUrl && (
                        <div className="w-12 h-12 flex-shrink-0 overflow-hidden">
                          <img src={quotedThumbUrl} alt="preview" className="w-full h-full object-cover" />
                        </div>
                      )}
                    </div>
                  )}
                  {parsed.text && (
                    <p className="text-base whitespace-pre-wrap text-surface-200">{parsed.text}</p>
                  )}
                  {attachmentDisplayUrl && attachmentIsImage && (
                    <div className="mt-2 group relative aspect-square w-[200px] rounded-xl overflow-hidden">
                      <img
                        src={attachmentDisplayUrl}
                        alt={parsed.attachmentName || 'attachment'}
                        className="w-full h-full object-cover cursor-pointer"
                        onClick={() => setLightbox({ src: attachmentDisplayUrl, filename: parsed.attachmentName || 'attachment', attId: resolvedAtt?.id })}
                      />
                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); resolvedAtt ? downloadViaFetch(attachmentsApi.download(resolvedAtt.id), resolvedAtt.file_name, true) : downloadViaFetch(attachmentDisplayUrl, parsed.attachmentName || 'image'); }}
                          className="bg-surface-900/80 p-1.5 rounded-lg hover:bg-surface-800"
                          title="Download"
                        >
                          <Download className="w-3.5 h-3.5 text-white" />
                        </button>
                        <a
                          href={attachmentDisplayUrl} target="_blank" rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="bg-surface-900/80 p-1.5 rounded-lg hover:bg-surface-800 flex items-center"
                          title="Open in new tab"
                        >
                          <ExternalLink className="w-3.5 h-3.5 text-white" />
                        </a>
                      </div>
                    </div>
                  )}
                  {attachmentDisplayUrl && !attachmentIsImage && (
                    <div className="mt-2 flex items-center gap-2 p-3 bg-teal-900/20 rounded-lg border border-teal-700/20 w-[260px]">
                      <FileText className="w-5 h-5 text-teal-400 flex-shrink-0" />
                      <span className="text-sm truncate text-surface-300 flex-1">{parsed.attachmentName || 'File'}</span>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => resolvedAtt ? downloadViaFetch(attachmentsApi.download(resolvedAtt.id), resolvedAtt.file_name, true) : downloadViaFetch(attachmentDisplayUrl, parsed.attachmentName || 'file')}
                          className="btn-ghost p-1 rounded-lg"
                          title="Download"
                        >
                          <Download className="w-3.5 h-3.5 text-teal-400" />
                        </button>
                        <a
                          href={attachmentDisplayUrl} target="_blank" rel="noreferrer"
                          className="btn-ghost p-1 rounded-lg flex items-center"
                          title="Open in new tab"
                        >
                          <ExternalLink className="w-3.5 h-3.5 text-teal-400" />
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {lightbox && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) setLightbox(null); }}>
          <div className="relative max-w-4xl max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <img src={lightbox.src} alt={lightbox.filename} className="max-w-full max-h-[85vh] object-contain rounded-xl" />
            <div className="absolute top-3 right-3 flex gap-2">
              <button onClick={() => lightbox.attId ? downloadViaFetch(attachmentsApi.download(lightbox.attId), lightbox.filename, true) : downloadViaFetch(lightbox.src, lightbox.filename)} className="bg-white/90 backdrop-blur-sm p-2 rounded-lg hover:bg-white transition-colors shadow-lg" title="Download">
                <Download className="w-5 h-5 text-gray-800" />
              </button>
              <a href={lightbox.src} target="_blank" rel="noreferrer" className="bg-white/90 backdrop-blur-sm p-2 rounded-lg hover:bg-white transition-colors shadow-lg" title="Open in new tab">
                <ExternalLink className="w-5 h-5 text-gray-800" />
              </a>
              <button onClick={() => setLightbox(null)} className="bg-white/90 backdrop-blur-sm p-2 rounded-lg hover:bg-white transition-colors shadow-lg" title="Close">
                <X className="w-5 h-5 text-gray-800" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
