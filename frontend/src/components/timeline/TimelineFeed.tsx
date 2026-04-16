import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { timelineApi, commentsApi, attachmentsApi } from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { formatDate } from '../../utils/date';
import { Send, ImagePlus } from 'lucide-react';
import MentionInput, { MentionInputHandle } from '../MentionInput';
import TimelineItemComponent, { TimelineItemData } from './TimelineItem';

interface FileUploadState { name: string; progress: number; status: 'uploading' | 'done' | 'error'; }

interface Props {
  productId: number;
  canPost?: boolean;
}

function dateSeparator(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return formatDate(dateStr);
}

export default function TimelineFeed({ productId, canPost = true }: Props) {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [message, setMessage] = useState('');
  const [replyTo, setReplyTo] = useState<TimelineItemData | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [uploadingFiles, setUploadingFiles] = useState<FileUploadState[]>([]);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<MentionInputHandle>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['timeline', productId],
    queryFn: () => timelineApi.getByProduct(productId),
    staleTime: 10000,
  });

  const items: TimelineItemData[] = data?.data?.items || [];

  // Scroll to bottom on open
  useEffect(() => { endRef.current?.scrollIntoView(); }, []);

  // Scroll to bottom when new item arrives
  const lastId = items[items.length - 1]?.id;
  useEffect(() => {
    if (!lastId) return;
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lastId]);

  const createMutation = useMutation({
    mutationFn: (msg: string) => commentsApi.create(productId, msg),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timeline', productId] });
      setMessage('');
      setReplyTo(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, msg }: { id: number; msg: string }) => commentsApi.update(id, msg),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timeline', productId] });
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => commentsApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['timeline', productId] }),
  });

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!message.trim()) return;
    let msg = message.trim();
    if (replyTo && replyTo.comment_id) {
      const preview = replyTo.content.replace(/\[.*?\]\n?/g, '').trim().slice(0, 60);
      msg = `[reply:${replyTo.comment_id}:${preview}]\n${msg}`;
    }
    createMutation.mutate(msg);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    if (fileInputRef.current) fileInputRef.current.value = '';
    for (const file of Array.from(files)) {
      const state: FileUploadState = { name: file.name, progress: 0, status: 'uploading' };
      setUploadingFiles(prev => [...prev, state]);
      try {
        const res = await attachmentsApi.uploadWithProgress(
          productId, file,
          (pct) => setUploadingFiles(prev => prev.map(f => f.name === file.name ? { ...f, progress: pct } : f)),
          undefined, 'comment',
        );
        setUploadingFiles(prev => prev.map(f => f.name === file.name ? { ...f, status: 'done' } : f));
        await commentsApi.create(productId, `📎 Uploaded: ${file.name}\n[attachment:${res.data.id}:${file.name}]`);
        queryClient.invalidateQueries({ queryKey: ['timeline', productId] });
      } catch {
        setUploadingFiles(prev => prev.map(f => f.name === file.name ? { ...f, status: 'error' } : f));
      } finally {
        setTimeout(() => setUploadingFiles(prev => prev.filter(f => f.name !== file.name)), 1500);
      }
    }
  };

  const highlightItem = (id: string) => {
    const el = itemRefs.current[id];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    setHighlightedId(id);
    highlightTimer.current = setTimeout(() => setHighlightedId(null), 4000);
  };

  // Group items by date for separators
  let lastDate = '';

  return (
    <div className="flex flex-col flex-1 h-full min-h-0">
      {/* Feed */}
      <div className="flex-1 min-h-0 space-y-1 mb-3 overflow-y-auto pr-1">
        {isLoading ? (
          <div className="flex flex-col gap-3 py-8">
            {[1,2,3].map(i => <div key={i} className="h-10 bg-surface-800/50 rounded-xl animate-pulse" />)}
          </div>
        ) : items.length === 0 ? (
          <p className="text-center text-surface-500 text-sm py-12">No activity yet</p>
        ) : (
          items.map((item) => {
            const itemDate = dateSeparator(item.created_at);
            const showSep = itemDate !== lastDate;
            lastDate = itemDate;
            return (
              <div key={item.id}>
                {showSep && (
                  <div className="flex justify-center my-3">
                    <span className="text-[11px] text-surface-500 bg-surface-800/60 rounded-full px-3 py-0.5 border border-surface-700/40">
                      {itemDate}
                    </span>
                  </div>
                )}
                <TimelineItemComponent
                  item={item}
                  allItems={items}
                  onReply={(i) => { setReplyTo(i); inputRef.current?.focus(); }}
                  onEdit={(i) => {
                    if (!i.comment_id) return;
                    const parsed = i.content.replace(/\[.*?\]\n?/g, '').trim();
                    setEditingId(i.id);
                    setEditValue(parsed);
                  }}
                  onDelete={(i) => { if (i.comment_id) deleteMutation.mutate(i.comment_id); }}
                  editingId={editingId}
                  editValue={editValue}
                  onEditChange={setEditValue}
                  onEditSave={() => { if (editingId) { const item = items.find(i => i.id === editingId); if (item?.comment_id) updateMutation.mutate({ id: item.comment_id, msg: editValue }); } }}
                  onEditCancel={() => setEditingId(null)}
                  highlightedId={highlightedId}
                  itemRef={(el) => { itemRefs.current[item.id] = el; }}
                />
              </div>
            );
          })
        )}

        {/* Uploading indicators */}
        {uploadingFiles.map(f => (
          <div key={f.name} className="flex items-center gap-2 px-3 py-2 bg-surface-800/60 rounded-xl text-xs text-surface-400">
            <div className="w-3 h-3 rounded-full border-2 border-brand-400 border-t-transparent animate-spin flex-shrink-0" />
            <span className="truncate flex-1">{f.name}</span>
            <span>{f.progress}%</span>
          </div>
        ))}

        <div ref={endRef} />
      </div>

      {/* Reply bar */}
      {replyTo && (
        <div className="flex items-center gap-2 mb-2 bg-brand-500/5 border-l-2 border-brand-500 pl-3 pr-2 py-2 rounded-r-lg">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-brand-400 font-medium">{replyTo.actor.name}</p>
            <p className="text-xs text-surface-400 truncate">{replyTo.content.replace(/\[.*?\]\n?/g, '').trim().slice(0, 60)}</p>
          </div>
          <button onClick={() => setReplyTo(null)} className="btn-ghost p-1 rounded text-surface-500 hover:text-surface-300">×</button>
        </div>
      )}

      {/* Input */}
      {canPost && (
        <>
          <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.doc,.docx,.txt,.xlsx,.csv" className="hidden" onChange={handleFileUpload} />
          <form onSubmit={handleSubmit} className="flex gap-2">
            <button type="button" onClick={() => fileInputRef.current?.click()} className="btn-ghost p-2.5 rounded-xl flex-shrink-0" title="Upload file">
              <ImagePlus className="w-4 h-4" />
            </button>
            <MentionInput
              ref={inputRef}
              value={message}
              onChange={setMessage}
              onSubmit={handleSubmit}
              placeholder={replyTo ? `Reply to ${replyTo.actor.name}…` : 'Write a comment… (@name to mention)'}
            />
            <button type="submit" disabled={!message.trim() || createMutation.isPending} className="btn-primary px-3">
              <Send className="w-4 h-4" />
            </button>
          </form>
        </>
      )}
    </div>
  );
}
