import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { productsApi, attachmentsApi, commentsApi } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { Product, Attachment, Comment, STATUS_LABELS, STATUS_ORDER } from '../types';
import {
  X, Paperclip, MessageSquare, Package, Upload, Download, Trash2,
  Send, Edit2, Image, FileText, File,
} from 'lucide-react';

interface Props {
  productId: number;
  onClose: () => void;
}

export default function ProductDetailModal({ productId, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<'details' | 'attachments' | 'comments'>('details');
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const canCreateProduct = useAuthStore((s) => s.canCreateProduct);

  const { data: productData } = useQuery({
    queryKey: ['products', productId],
    queryFn: () => productsApi.getById(productId),
  });
  const product: Product | null = productData?.data || null;

  const { data: attachmentsData } = useQuery({
    queryKey: ['attachments', productId],
    queryFn: () => attachmentsApi.getByProduct(productId),
  });
  const attachments: Attachment[] = attachmentsData?.data || [];

  const { data: commentsData } = useQuery({
    queryKey: ['comments', productId],
    queryFn: () => commentsApi.getByProduct(productId),
  });
  const comments: Comment[] = commentsData?.data || [];

  const tabs = [
    { id: 'details' as const, label: 'Details', icon: Package },
    { id: 'attachments' as const, label: `Attachments (${attachments.length})`, icon: Paperclip },
    { id: 'comments' as const, label: `Comments (${comments.length})`, icon: MessageSquare },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[85vh] glass rounded-2xl flex flex-col animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-surface-700/50">
          <div>
            <h2 className="text-lg font-semibold">{product?.product_id || 'Loading...'}</h2>
            {product && (
              <span className={`inline-block mt-1 text-xs px-2.5 py-0.5 rounded-full status-${product.status}`}>
                {STATUS_LABELS[product.status]}
              </span>
            )}
          </div>
          <button onClick={onClose} className="btn-ghost p-2 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-surface-700/50">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-all duration-200 border-b-2 ${
                activeTab === tab.id
                  ? 'border-brand-500 text-brand-400'
                  : 'border-transparent text-surface-400 hover:text-surface-200'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === 'details' && product && <DetailsTab product={product} />}
          {activeTab === 'attachments' && <AttachmentsTab productId={productId} attachments={attachments} />}
          {activeTab === 'comments' && <CommentsTab productId={productId} comments={comments} />}
        </div>
      </div>
    </div>
  );
}

function DetailsTab({ product }: { product: Product }) {
  return (
    <div className="space-y-4">
      <DetailRow label="Product ID" value={product.product_id} />
      <DetailRow label="Customer Name" value={product.customer_name} />
      <DetailRow label="Customer Phone" value={product.customer_phone || '—'} />
      <DetailRow label="Description" value={product.description || '—'} />
      <DetailRow label="Created By" value={product.creator?.name || '—'} />
      <DetailRow label="Created At" value={new Date(product.created_at).toLocaleString()} />
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

function AttachmentsTab({ productId, attachments }: { productId: number; attachments: Attachment[] }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);

  const uploadMutation = useMutation({
    mutationFn: (file: File) => attachmentsApi.upload(productId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attachments', productId] });
      setUploading(false);
    },
    onError: () => setUploading(false),
  });

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploading(true);
      uploadMutation.mutate(file);
    }
  };

  const getFileIcon = (type: string) => {
    if (['.jpg', '.jpeg', '.png', '.gif'].includes(type)) return Image;
    if (['.pdf', '.docx', '.doc', '.txt'].includes(type)) return FileText;
    return File;
  };

  const isImage = (type: string) => ['.jpg', '.jpeg', '.png', '.gif'].includes(type);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-4">
      <input ref={fileInputRef} type="file" className="hidden" onChange={handleUpload} />
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="btn-secondary flex items-center gap-2 w-full justify-center"
      >
        <Upload className="w-4 h-4" />
        {uploading ? 'Uploading...' : 'Upload File'}
      </button>

      {attachments.length === 0 ? (
        <p className="text-center text-surface-500 text-sm py-8">No attachments yet</p>
      ) : (
        <div className="space-y-2">
          {attachments.map((att) => {
            const Icon = getFileIcon(att.file_type);
            return (
              <div key={att.id} className="flex items-center gap-3 p-3 bg-surface-800/50 rounded-lg hover:bg-surface-800 transition-colors">
                {isImage(att.file_type) ? (
                  <img
                    src={`/uploads/${att.product_id}/${att.file_path.split('/').pop()}`}
                    alt={att.file_name}
                    className="w-10 h-10 rounded object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded bg-surface-700 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-surface-400" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{att.file_name}</p>
                  <p className="text-xs text-surface-500">
                    {formatSize(att.file_size)} · {att.uploader?.name} · {new Date(att.uploaded_at).toLocaleDateString()}
                  </p>
                </div>
                <a
                  href={attachmentsApi.download(att.id)}
                  className="btn-ghost p-2 rounded-lg"
                  target="_blank"
                  rel="noreferrer"
                >
                  <Download className="w-4 h-4" />
                </a>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CommentsTab({ productId, comments }: { productId: number; comments: Comment[] }) {
  const [message, setMessage] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editMessage, setEditMessage] = useState('');
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const createMutation = useMutation({
    mutationFn: (msg: string) => commentsApi.create(productId, msg),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', productId] });
      setMessage('');
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', productId] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim()) createMutation.mutate(message.trim());
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 space-y-4 mb-4">
        {comments.length === 0 ? (
          <p className="text-center text-surface-500 text-sm py-8">No comments yet</p>
        ) : (
          comments.map((c) => (
            <div key={c.id} className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-400 to-purple-500 flex items-center justify-center text-xs font-bold text-white flex-shrink-0 mt-0.5">
                {c.user?.name?.charAt(0)?.toUpperCase() || '?'}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{c.user?.name}</span>
                  <span className="text-xs text-surface-500">{new Date(c.created_at).toLocaleString()}</span>
                </div>
                {editingId === c.id ? (
                  <div className="mt-1 flex gap-2">
                    <input
                      value={editMessage}
                      onChange={(e) => setEditMessage(e.target.value)}
                      className="flex-1 text-sm"
                      autoFocus
                    />
                    <button onClick={() => updateMutation.mutate({ id: c.id, msg: editMessage })} className="btn-primary text-xs py-1 px-3">Save</button>
                    <button onClick={() => setEditingId(null)} className="btn-ghost text-xs py-1 px-3">Cancel</button>
                  </div>
                ) : (
                  <p className="text-sm text-surface-300 mt-0.5">{c.message}</p>
                )}
                {c.user_id === user?.id && editingId !== c.id && (
                  <div className="flex gap-2 mt-1">
                    <button
                      onClick={() => { setEditingId(c.id); setEditMessage(c.message); }}
                      className="text-xs text-surface-500 hover:text-surface-300 flex items-center gap-1"
                    >
                      <Edit2 className="w-3 h-3" /> Edit
                    </button>
                    <button
                      onClick={() => deleteMutation.mutate(c.id)}
                      className="text-xs text-surface-500 hover:text-red-400 flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" /> Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Add a comment..."
          className="flex-1"
        />
        <button type="submit" disabled={!message.trim()} className="btn-primary px-3">
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
