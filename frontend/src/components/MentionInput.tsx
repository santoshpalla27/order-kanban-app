import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usersApi, productsApi } from '../api/client';
import { User } from '../types';
import { Package } from 'lucide-react';

interface MentionInputProps {
  value: string;
  onChange: (val: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  className?: string;
}

export interface MentionInputHandle {
  focus: () => void;
}

/**
 * Renders an <input> that shows a unified mention dropdown when the user types @.
 * - Users are inserted as @[Name]
 * - Orders are inserted as @{id:PROD-ID}
 */
const MentionInput = forwardRef<MentionInputHandle, MentionInputProps>(
  ({ value, onChange, onSubmit, placeholder, className }, ref) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [mentionQuery, setMentionQuery] = useState<string | null>(null);
    const [mentionStart, setMentionStart] = useState(0);
    const [highlightIdx, setHighlightIdx] = useState(0);

    // Order search state
    const [orderResults, setOrderResults] = useState<any[]>([]);
    const [orderLoading, setOrderLoading] = useState(false);
    const orderTimer = useRef<ReturnType<typeof setTimeout>>();

    useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus(),
    }));

    const { data } = useQuery({
      queryKey: ['users-list'],
      queryFn: () => usersApi.getList(),
      staleTime: 5 * 60 * 1000,
    });
    const allUsers: User[] = (data as any)?.data || [];

    const filteredUsers =
      mentionQuery !== null
        ? allUsers
            .filter((u) => u.name.toLowerCase().includes(mentionQuery.toLowerCase()))
            .slice(0, 5)
        : [];

    // Debounced order search whenever mentionQuery changes
    useEffect(() => {
      if (mentionQuery === null) { setOrderResults([]); return; }
      clearTimeout(orderTimer.current);
      orderTimer.current = setTimeout(async () => {
        setOrderLoading(true);
        try {
          const res = await productsApi.getPaged(
            mentionQuery ? { search: mentionQuery } : undefined,
            6,
          );
          setOrderResults((res as any)?.data?.data ?? []);
        } catch { setOrderResults([]); }
        setOrderLoading(false);
      }, 250);
    }, [mentionQuery]);

    // Unified list: users first, then orders
    type Entry = { kind: 'user'; user: User } | { kind: 'order'; product: any };
    const entries: Entry[] = [
      ...filteredUsers.map((u): Entry => ({ kind: 'user', user: u })),
      ...orderResults.map((p): Entry => ({ kind: 'order', product: p })),
    ];

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      onChange(val);

      const cursor = e.target.selectionStart ?? val.length;
      const before = val.slice(0, cursor);
      const atIdx = before.lastIndexOf('@');

      if (atIdx !== -1) {
        const query = before.slice(atIdx + 1);
        // Don't re-trigger inside already-inserted mention tokens
        if (
          !query.includes('[') && !query.includes(']') &&
          !query.includes('{') && !query.includes('}') &&
          query.length <= 30
        ) {
          setMentionStart(atIdx);
          setMentionQuery(query);
          setHighlightIdx(0);
          return;
        }
      }
      setMentionQuery(null);
    };

    const selectUser = (user: User) => {
      const before = value.slice(0, mentionStart);
      const mentionEnd = mentionStart + 1 + (mentionQuery?.length ?? 0);
      const after = value.slice(mentionEnd);
      onChange(`${before}@[${user.name}] ${after}`);
      setMentionQuery(null);
      setTimeout(() => {
        if (inputRef.current) {
          const pos = before.length + user.name.length + 4;
          inputRef.current.setSelectionRange(pos, pos);
          inputRef.current.focus();
        }
      }, 0);
    };

    const selectOrder = (product: any) => {
      const before = value.slice(0, mentionStart);
      const mentionEnd = mentionStart + 1 + (mentionQuery?.length ?? 0);
      const after = value.slice(mentionEnd);
      const token = `@{${product.id}:${product.product_id}}`;
      onChange(`${before}${token} ${after}`);
      setMentionQuery(null);
      setTimeout(() => {
        if (inputRef.current) {
          const pos = before.length + token.length + 1;
          inputRef.current.setSelectionRange(pos, pos);
          inputRef.current.focus();
        }
      }, 0);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (mentionQuery !== null && entries.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setHighlightIdx((i) => Math.min(i + 1, entries.length - 1));
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setHighlightIdx((i) => Math.max(i - 1, 0));
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          const entry = entries[highlightIdx];
          if (entry?.kind === 'user') selectUser(entry.user);
          else if (entry?.kind === 'order') selectOrder(entry.product);
          return;
        }
        if (e.key === 'Escape') {
          setMentionQuery(null);
          return;
        }
      }
      if (e.key === 'Enter' && !e.shiftKey && onSubmit) {
        e.preventDefault();
        onSubmit();
      }
    };

    const showDropdown = mentionQuery !== null && (entries.length > 0 || orderLoading);

    return (
      <div className="relative flex-1 min-w-0">
        <input
          ref={inputRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={() => setTimeout(() => setMentionQuery(null), 150)}
          placeholder={placeholder}
          className={`w-full ${className ?? ''}`}
        />

        {showDropdown && (
          <div className="absolute bottom-full mb-1.5 left-0 w-64 glass rounded-xl border border-surface-700/50 shadow-2xl z-50 overflow-hidden animate-scale-in">
            <div className="px-2.5 py-1.5 border-b border-surface-700/40">
              <span className="text-[10px] text-surface-500 font-medium uppercase tracking-wider">Mention</span>
            </div>

            {/* People section */}
            {filteredUsers.length > 0 && (
              <>
                <div className="px-2.5 pt-1.5 pb-0.5">
                  <span className="text-[9px] text-surface-600 font-semibold uppercase tracking-widest">People</span>
                </div>
                {filteredUsers.map((user, idx) => (
                  <button
                    key={`u-${user.id}`}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); selectUser(user); }}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 text-left transition-colors ${
                      idx === highlightIdx
                        ? 'bg-brand-600 text-white'
                        : 'hover:bg-surface-700/50 text-surface-200'
                    }`}
                  >
                    <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold ${
                      idx === highlightIdx ? 'bg-white/20 text-white' : 'bg-brand-600/80 text-white'
                    }`}>
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm font-medium truncate">{user.name}</span>
                    <span className={`text-[10px] ml-auto flex-shrink-0 ${idx === highlightIdx ? 'text-white/60' : 'text-surface-500'}`}>
                      {user.role?.name}
                    </span>
                  </button>
                ))}
              </>
            )}

            {/* Orders section */}
            {(orderResults.length > 0 || orderLoading) && (
              <>
                <div className={`px-2.5 pt-1.5 pb-0.5 ${filteredUsers.length > 0 ? 'border-t border-surface-700/30 mt-0.5' : ''}`}>
                  <span className="text-[9px] text-surface-600 font-semibold uppercase tracking-widest">Orders</span>
                </div>
                {orderLoading && orderResults.length === 0 ? (
                  <div className="flex justify-center py-2">
                    <div className="w-3.5 h-3.5 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
                  </div>
                ) : (
                  orderResults.map((product, i) => {
                    const idx = filteredUsers.length + i;
                    return (
                      <button
                        key={`o-${product.id}`}
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); selectOrder(product); }}
                        className={`w-full flex items-center gap-2.5 px-2.5 py-2 text-left transition-colors ${
                          idx === highlightIdx
                            ? 'bg-amber-600 text-white'
                            : 'hover:bg-surface-700/50 text-surface-200'
                        }`}
                      >
                        <div className={`w-6 h-6 rounded-lg flex-shrink-0 flex items-center justify-center ${
                          idx === highlightIdx ? 'bg-white/20' : 'bg-amber-500/20'
                        }`}>
                          <Package className={`w-3.5 h-3.5 ${idx === highlightIdx ? 'text-white' : 'text-amber-400'}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-mono font-bold truncate ${idx === highlightIdx ? 'text-white' : 'text-amber-400'}`}>
                            {product.product_id}
                          </p>
                          <p className={`text-[11px] truncate ${idx === highlightIdx ? 'text-white/70' : 'text-surface-500'}`}>
                            {product.customer_name}
                          </p>
                        </div>
                      </button>
                    );
                  })
                )}
              </>
            )}
          </div>
        )}
      </div>
    );
  }
);

MentionInput.displayName = 'MentionInput';
export default MentionInput;

/**
 * Parse @[Name] and @{id:PROD-ID} tokens in a message and return styled React nodes.
 * - User mentions: highlighted in brand blue (yellow if it's the current user)
 * - Order mentions: amber chip, clickable if onOrderClick is provided
 */
export function renderWithMentions(
  text: string,
  currentUserName?: string,
  onOrderClick?: (id: number) => void,
): React.ReactNode {
  const parts = text.split(/(@\[[^\]]+\]|@\{\d+:[^}]+\})/g);
  return parts.map((part, i) => {
    // User mention: @[Name]
    const userMatch = part.match(/^@\[([^\]]+)\]$/);
    if (userMatch) {
      const name = userMatch[1];
      const isSelf = currentUserName && name.toLowerCase() === currentUserName.toLowerCase();
      return (
        <span
          key={i}
          className={`font-semibold rounded px-0.5 ${
            isSelf ? 'text-yellow-300 bg-yellow-400/10' : 'text-brand-400'
          }`}
        >
          @{name}
        </span>
      );
    }
    // Order mention: @{id:PROD-ID}
    const orderMatch = part.match(/^@\{(\d+):([^}]+)\}$/);
    if (orderMatch) {
      const id = Number(orderMatch[1]);
      const productId = orderMatch[2];
      return (
        <span
          key={i}
          onClick={() => onOrderClick?.(id)}
          className={`font-semibold rounded px-1 py-0.5 text-amber-400 bg-amber-400/10 ${
            onOrderClick ? 'cursor-pointer hover:bg-amber-400/20' : ''
          }`}
        >
          @{productId}
        </span>
      );
    }
    return part;
  });
}
