import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { productsApi, attachmentsApi, commentsApi } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { Product, Attachment, Comment, STATUS_LABELS } from '../types';
import {
  X, Paperclip, MessageSquare, Package, Upload, Download, Trash2,
  Send, Edit2, Image, FileText, File, ImagePlus, Plus, Reply, MoreVertical,
  ExternalLink,
} from 'lucide-react';

interface Props {
  productId: number;
  onClose: () => void;
}

// ── Helpers ──
const getFileIcon = (type: string) => {
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(type)) return Image;
  if (['.pdf', '.docx', '.doc', '.txt'].includes(type)) return FileText;
  return File;
};
const isImageType = (type: string) => ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(type);
const isImageUrl = (url: string) => /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(url);
const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};
const getAttachmentUrl = (att: Attachment) =>
  `/uploads/${att.product_id}/${att.file_path.split('/').pop()}`;

// ── Shared multi-file upload hook ──
function useMultiUpload(productId: number) {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [uploadCount, setUploadCount] = useState({ done: 0, total: 0 });

  const uploadFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;
    setUploading(true);
    setUploadCount({ done: 0, total: fileArray.length });
    for (let i = 0; i < fileArray.length; i++) {
      try {
        await attachmentsApi.upload(productId, fileArray[i]);
      } catch (err) {
        console.error(`Failed to upload ${fileArray[i].name}:`, err);
      }
      setUploadCount((prev) => ({ ...prev, done: prev.done + 1 }));
    }
    queryClient.invalidateQueries({ queryKey: ['attachments', productId] });
    setUploading(false);
    setUploadCount({ done: 0, total: 0 });
  };

  return { uploading, uploadCount, uploadFiles };
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
    const msg = `${comment.trim()}\n[attachment:${getAttachmentUrl(attachment)}:${attachment.file_name}]`;
    commentMutation.mutate(msg);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={onClose}>
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
function ImageLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div className="relative max-w-4xl max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <img src={src} alt={alt} className="max-w-full max-h-[85vh] object-contain rounded-xl" />
        <div className="absolute top-3 right-3 flex gap-2">
          <a href={src} download className="bg-surface-800/90 p-2 rounded-lg hover:bg-surface-700 transition-colors" target="_blank" rel="noreferrer">
            <Download className="w-5 h-5" />
          </a>
          <a href={src} target="_blank" rel="noreferrer" className="bg-surface-800/90 p-2 rounded-lg hover:bg-surface-700 transition-colors">
            <ExternalLink className="w-5 h-5" />
          </a>
          <button onClick={onClose} className="bg-surface-800/90 p-2 rounded-lg hover:bg-surface-700 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Modal ──
export default function ProductDetailModal({ productId, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<'details' | 'attachments' | 'comments'>('details');
  const [commentingAttachment, setCommentingAttachment] = useState<Attachment | null>(null);

  const { data: productData } = useQuery({ queryKey: ['products', productId], queryFn: () => productsApi.getById(productId) });
  const product: Product | null = productData?.data || null;

  const { data: attachmentsData } = useQuery({ queryKey: ['attachments', productId], queryFn: () => attachmentsApi.getByProduct(productId) });
  const attachments: Attachment[] = attachmentsData?.data || [];

  const { data: commentsData } = useQuery({ queryKey: ['comments', productId], queryFn: () => commentsApi.getByProduct(productId) });
  const comments: Comment[] = commentsData?.data || [];

  const tabs = [
    { id: 'details' as const, label: 'Details', icon: Package },
    { id: 'attachments' as const, label: `Attachments (${attachments.length})`, icon: Paperclip },
    { id: 'comments' as const, label: `Comments (${comments.length})`, icon: MessageSquare },
  ];

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose}>
        <div className="w-full max-w-2xl max-h-[85vh] glass rounded-2xl flex flex-col animate-scale-in" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between p-5 border-b border-surface-700/50">
            <div>
              <h2 className="text-lg font-semibold">{product?.product_id || 'Loading...'}</h2>
              {product && <span className={`inline-block mt-1 text-xs px-2.5 py-0.5 rounded-full status-${product.status}`}>{STATUS_LABELS[product.status]}</span>}
            </div>
            <button onClick={onClose} className="btn-ghost p-2 rounded-lg"><X className="w-5 h-5" /></button>
          </div>
          <div className="flex border-b border-surface-700/50">
            {tabs.map((tab) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-all duration-200 border-b-2 ${activeTab === tab.id ? 'border-brand-500 text-brand-400' : 'border-transparent text-surface-400 hover:text-surface-200'}`}>
                <tab.icon className="w-4 h-4" /> {tab.label}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-5">
            {activeTab === 'details' && product && <DetailsTab product={product} productId={productId} attachments={attachments} onViewAll={() => setActiveTab('attachments')} onCommentAttachment={setCommentingAttachment} />}
            {activeTab === 'attachments' && <AttachmentsTab productId={productId} attachments={attachments} onCommentAttachment={setCommentingAttachment} />}
            {activeTab === 'comments' && <CommentsTab productId={productId} comments={comments} />}
          </div>
        </div>
      </div>
      {commentingAttachment && <ImageCommentModal attachment={commentingAttachment} productId={productId} onClose={() => setCommentingAttachment(null)} />}
    </>
  );
}

// ── Details Tab ──
function DetailsTab({ product, productId, attachments, onViewAll, onCommentAttachment }: { product: Product; productId: number; attachments: Attachment[]; onViewAll: () => void; onCommentAttachment: (att: Attachment) => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploading, uploadCount, uploadFiles } = useMultiUpload(productId);
  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files) uploadFiles(e.target.files); if (fileInputRef.current) fileInputRef.current.value = ''; };

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <DetailRow label="Product ID" value={product.product_id} />
        <DetailRow label="Customer Name" value={product.customer_name} />
        <DetailRow label="Customer Phone" value={product.customer_phone || '—'} />
        <DetailRow label="Description" value={product.description || '—'} />
        <DetailRow label="Created By" value={product.creator?.name || '—'} />
        <DetailRow label="Created At" value={new Date(product.created_at).toLocaleString()} />
      </div>
      <div className="border-t border-surface-700/50 pt-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Paperclip className="w-4 h-4 text-surface-400" />
            <span className="text-xs font-medium text-surface-500 uppercase tracking-wider">Attachments ({attachments.length})</span>
          </div>
          <div className="flex items-center gap-2">
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleUpload} />
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 transition-colors bg-brand-500/10 hover:bg-brand-500/20 px-2.5 py-1.5 rounded-lg">
              <Plus className="w-3.5 h-3.5" /> {uploading ? `Uploading ${uploadCount.done}/${uploadCount.total}...` : 'Add Files'}
            </button>
            {attachments.length > 0 && <button onClick={onViewAll} className="text-xs text-surface-400 hover:text-surface-200 transition-colors">Manage →</button>}
          </div>
        </div>
        {attachments.length === 0 ? (
          <div className="flex flex-col items-center gap-2 text-surface-500 text-sm py-6 border-2 border-dashed border-surface-700/50 rounded-xl cursor-pointer hover:border-brand-500/30 hover:text-surface-400 transition-colors" onClick={() => fileInputRef.current?.click()}>
            <Upload className="w-5 h-5 opacity-40" /><span>Click to add attachments</span>
          </div>
        ) : (
          <>
            {attachments.filter((a) => isImageType(a.file_type)).length > 0 && (
              <div className="grid grid-cols-3 gap-2 mb-3">
                {attachments.filter((a) => isImageType(a.file_type)).map((att) => (
                  <div key={att.id} className="group relative aspect-square rounded-lg overflow-hidden bg-surface-800 border border-surface-700/50 hover:border-brand-500/50 transition-all cursor-pointer" onClick={() => onCommentAttachment(att)}>
                    <img src={getAttachmentUrl(att)} alt={att.file_name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center"><MessageSquare className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" /></div>
                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent p-1.5"><p className="text-[10px] text-white truncate">{att.file_name}</p></div>
                  </div>
                ))}
              </div>
            )}
            {attachments.filter((a) => !isImageType(a.file_type)).map((att) => {
              const Icon = getFileIcon(att.file_type);
              return (
                <div key={att.id} className="flex items-center gap-3 p-2.5 bg-surface-800/50 rounded-lg hover:bg-surface-800 transition-colors mb-1.5 cursor-pointer" onClick={() => onCommentAttachment(att)}>
                  <div className="w-8 h-8 rounded bg-surface-700 flex items-center justify-center flex-shrink-0"><Icon className="w-4 h-4 text-surface-400" /></div>
                  <div className="flex-1 min-w-0"><p className="text-sm truncate">{att.file_name}</p><p className="text-xs text-surface-500">{formatSize(att.file_size)}</p></div>
                  <a href={attachmentsApi.download(att.id)} className="btn-ghost p-1.5 rounded-lg" target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}><Download className="w-3.5 h-3.5" /></a>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
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
  const { uploading, uploadCount, uploadFiles } = useMultiUpload(productId);
  const deleteMutation = useMutation({ mutationFn: (id: number) => attachmentsApi.delete(id), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['attachments', productId] }) });
  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files) uploadFiles(e.target.files); if (fileInputRef.current) fileInputRef.current.value = ''; };

  return (
    <div className="space-y-4">
      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleUpload} />
      <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="btn-secondary flex items-center gap-2 w-full justify-center">
        <Upload className="w-4 h-4" /> {uploading ? `Uploading ${uploadCount.done}/${uploadCount.total}...` : 'Upload Files'}
      </button>
      {attachments.length === 0 ? (
        <p className="text-center text-surface-500 text-sm py-8">No attachments yet</p>
      ) : (
        <div className="space-y-2">
          {attachments.map((att) => {
            const Icon = getFileIcon(att.file_type);
            return (
              <div key={att.id} className="flex items-center gap-3 p-3 bg-surface-800/50 rounded-lg hover:bg-surface-800 transition-colors">
                {isImageType(att.file_type) ? (
                  <img src={getAttachmentUrl(att)} alt={att.file_name} className="w-10 h-10 rounded object-cover cursor-pointer hover:ring-2 hover:ring-brand-500" onClick={() => onCommentAttachment(att)} />
                ) : (
                  <div className="w-10 h-10 rounded bg-surface-700 flex items-center justify-center cursor-pointer hover:bg-surface-600" onClick={() => onCommentAttachment(att)}><Icon className="w-5 h-5 text-surface-400" /></div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{att.file_name}</p>
                  <p className="text-xs text-surface-500">{formatSize(att.file_size)} · {att.uploader?.name} · {new Date(att.uploaded_at).toLocaleDateString()}</p>
                </div>
                <button onClick={() => onCommentAttachment(att)} className="btn-ghost p-2 rounded-lg" title="Comment"><MessageSquare className="w-4 h-4" /></button>
                <a href={attachmentsApi.download(att.id)} className="btn-ghost p-2 rounded-lg" target="_blank" rel="noreferrer"><Download className="w-4 h-4" /></a>
                <button onClick={() => deleteMutation.mutate(att.id)} className="btn-ghost p-2 rounded-lg text-red-400 hover:text-red-300" title="Delete"><Trash2 className="w-4 h-4" /></button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Parse comment content ──
interface ParsedComment {
  text: string;
  attachmentUrl?: string;
  attachmentName?: string;
  replyToId?: number;
  replyPreview?: string;
}

function parseCommentMessage(raw: string): ParsedComment {
  const result: ParsedComment = { text: '' };
  const lines = raw.split('\n');
  const textLines: string[] = [];

  for (const line of lines) {
    // Parse attachment reference: [attachment:/path/to/file:filename.png]
    const attMatch = line.match(/^\[attachment:(.+?):(.+?)\]$/);
    if (attMatch) {
      result.attachmentUrl = attMatch[1];
      result.attachmentName = attMatch[2];
      continue;
    }
    // Parse reply reference: [reply:123:preview text]
    const replyMatch = line.match(/^\[reply:(\d+):(.+?)\]$/);
    if (replyMatch) {
      result.replyToId = parseInt(replyMatch[1]);
      result.replyPreview = replyMatch[2];
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
function CommentsTab({ productId, comments }: { productId: number; comments: Comment[] }) {
  const [message, setMessage] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editMessage, setEditMessage] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      try {
        await attachmentsApi.upload(productId, file);
        const url = `/uploads/${productId}/${file.name}`;
        createMutation.mutate(`📎 Uploaded: ${file.name}\n[attachment:${url}:${file.name}]`);
      } catch (err) {
        console.error(`Failed to upload ${file.name}:`, err);
      }
    }
    queryClient.invalidateQueries({ queryKey: ['attachments', productId] });
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
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
    <div className="flex flex-col h-full">
      <div className="flex-1 space-y-3 mb-4">
        {comments.length === 0 ? (
          <p className="text-center text-surface-500 text-sm py-8">No comments yet</p>
        ) : (
          comments.map((c) => {
            const parsed = parseCommentMessage(c.message);
            const isOwn = c.user_id === user?.id;

            return (
              <div key={c.id} className="group flex gap-3 relative">
                {/* Avatar */}
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-400 to-purple-500 flex items-center justify-center text-xs font-bold text-white flex-shrink-0 mt-0.5">
                  {c.user?.name?.charAt(0)?.toUpperCase() || '?'}
                </div>

                <div className="flex-1 min-w-0">
                  {/* Name + Time */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{c.user?.name}</span>
                    <span className="text-xs text-surface-500">{new Date(c.created_at).toLocaleString()}</span>
                  </div>

                  {/* Reply reference */}
                  {parsed.replyToId && parsed.replyPreview && (
                    <div className="mt-1 flex items-start gap-1.5 text-xs text-surface-500 bg-surface-800/60 border-l-2 border-brand-500/50 pl-2.5 pr-3 py-1.5 rounded-r-lg">
                      <Reply className="w-3 h-3 mt-0.5 flex-shrink-0 rotate-180" />
                      <span className="truncate">{parsed.replyPreview}</span>
                    </div>
                  )}

                  {/* Edit mode */}
                  {editingId === c.id ? (
                    <div className="mt-1 flex gap-2">
                      <input value={editMessage} onChange={(e) => setEditMessage(e.target.value)} className="flex-1 text-sm" autoFocus />
                      <button onClick={() => updateMutation.mutate({ id: c.id, msg: editMessage })} className="btn-primary text-xs py-1 px-3">Save</button>
                      <button onClick={() => setEditingId(null)} className="btn-ghost text-xs py-1 px-3">Cancel</button>
                    </div>
                  ) : (
                    <>
                      {/* Comment text */}
                      {parsed.text && <p className="text-sm text-surface-300 mt-0.5">{parsed.text}</p>}

                      {/* Attached image in comment (clickable + downloadable) */}
                      {parsed.attachmentUrl && isImageUrl(parsed.attachmentUrl) && (
                        <div className="mt-2 relative group/img inline-block">
                          <img
                            src={parsed.attachmentUrl}
                            alt={parsed.attachmentName || 'attachment'}
                            className="max-w-[220px] max-h-[160px] rounded-lg border border-surface-700/50 object-cover cursor-pointer hover:opacity-90 transition-opacity"
                            onClick={() => setLightboxSrc(parsed.attachmentUrl!)}
                          />
                          <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover/img:opacity-100 transition-opacity">
                            <a href={parsed.attachmentUrl} download className="bg-surface-800/90 p-1 rounded-md hover:bg-surface-700"><Download className="w-3 h-3" /></a>
                          </div>
                          {parsed.attachmentName && (
                            <p className="text-[10px] text-surface-500 mt-1">{parsed.attachmentName}</p>
                          )}
                        </div>
                      )}

                      {/* Non-image attachment */}
                      {parsed.attachmentUrl && !isImageUrl(parsed.attachmentUrl) && (
                        <a href={parsed.attachmentUrl} target="_blank" rel="noreferrer" className="mt-2 flex items-center gap-2 p-2 bg-surface-800/50 rounded-lg hover:bg-surface-800 transition-colors max-w-[220px]">
                          <FileText className="w-4 h-4 text-surface-400 flex-shrink-0" />
                          <span className="text-xs truncate text-surface-300">{parsed.attachmentName || 'File'}</span>
                          <Download className="w-3 h-3 text-surface-500 ml-auto flex-shrink-0" />
                        </a>
                      )}
                    </>
                  )}
                </div>

                {/* Action menu (⋯ on hover) */}
                {editingId !== c.id && (
                  <div className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="relative">
                      <button
                        onClick={() => setMenuOpenId(menuOpenId === c.id ? null : c.id)}
                        className="btn-ghost p-1 rounded-md"
                      >
                        <MoreVertical className="w-3.5 h-3.5" />
                      </button>

                      {menuOpenId === c.id && (
                        <div className="absolute right-0 top-7 z-10 glass rounded-lg py-1 min-w-[120px] shadow-xl animate-scale-in">
                          <button
                            onClick={() => { handleReply(c); }}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-surface-300 hover:bg-surface-700/50 transition-colors"
                          >
                            <Reply className="w-3 h-3" /> Reply
                          </button>
                          {isOwn && (
                            <>
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
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Reply bar */}
      {replyTo && (
        <div className="flex items-center gap-2 mb-2 bg-surface-800/60 border-l-2 border-brand-500 pl-3 pr-2 py-2 rounded-r-lg">
          <Reply className="w-3.5 h-3.5 text-brand-400 flex-shrink-0 rotate-180" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-brand-400 font-medium">{replyTo.user?.name}</p>
            <p className="text-xs text-surface-400 truncate">{parseCommentMessage(replyTo.message).text.slice(0, 60)}</p>
          </div>
          <button onClick={() => setReplyTo(null)} className="btn-ghost p-1 rounded"><X className="w-3 h-3" /></button>
        </div>
      )}

      {/* Input */}
      <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.doc,.docx,.txt,.xlsx,.csv" className="hidden" onChange={handleFileUpload} />
      <form onSubmit={handleSubmit} className="flex gap-2">
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="btn-ghost p-2.5 rounded-xl flex-shrink-0" title="Upload files">
          {uploading ? <div className="w-4 h-4 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" /> : <ImagePlus className="w-4 h-4" />}
        </button>
        <input ref={inputRef} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={replyTo ? `Reply to ${replyTo.user?.name}...` : 'Add a comment...'} className="flex-1" />
        <button type="submit" disabled={!message.trim()} className="btn-primary px-3"><Send className="w-4 h-4" /></button>
      </form>

      {/* Image lightbox */}
      {lightboxSrc && <ImageLightbox src={lightboxSrc} alt="attachment" onClose={() => setLightboxSrc(null)} />}
    </div>
  );
}
