import { useState, useRef, forwardRef, useImperativeHandle } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usersApi } from '../api/client';
import { User } from '../types';

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
 * Renders an <input> that shows a user-mention dropdown when the user types @.
 * Selected users are inserted as @[Name] in the value string.
 */
const MentionInput = forwardRef<MentionInputHandle, MentionInputProps>(
  ({ value, onChange, onSubmit, placeholder, className }, ref) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [mentionQuery, setMentionQuery] = useState<string | null>(null);
    const [mentionStart, setMentionStart] = useState(0);
    const [highlightIdx, setHighlightIdx] = useState(0);

    useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus(),
    }));

    const { data } = useQuery({
      queryKey: ['users-list'],
      queryFn: () => usersApi.getList(),
      staleTime: 5 * 60 * 1000,
    });
    const allUsers: User[] = (data as any)?.data || [];

    const filtered =
      mentionQuery !== null
        ? allUsers
            .filter((u) => u.name.toLowerCase().includes(mentionQuery.toLowerCase()))
            .slice(0, 6)
        : [];

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      onChange(val);

      const cursor = e.target.selectionStart ?? val.length;
      const before = val.slice(0, cursor);
      const atIdx = before.lastIndexOf('@');

      if (atIdx !== -1) {
        const query = before.slice(atIdx + 1);
        // Only trigger if the text between @ and cursor has no completed mention brackets
        if (!query.includes('[') && !query.includes(']') && query.length <= 30) {
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
      const newVal = `${before}@[${user.name}] ${after}`;
      onChange(newVal);
      setMentionQuery(null);

      // Restore focus and position cursor right after the inserted mention
      setTimeout(() => {
        if (inputRef.current) {
          const pos = before.length + user.name.length + 4; // @[ name ]<space>
          inputRef.current.setSelectionRange(pos, pos);
          inputRef.current.focus();
        }
      }, 0);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (mentionQuery !== null && filtered.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setHighlightIdx((i) => Math.min(i + 1, filtered.length - 1));
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setHighlightIdx((i) => Math.max(i - 1, 0));
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          selectUser(filtered[highlightIdx]);
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

    return (
      <div className="relative flex-1 min-w-0">
        <input
          ref={inputRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={() => setTimeout(() => setMentionQuery(null), 120)}
          placeholder={placeholder}
          className={`w-full ${className ?? ''}`}
        />

        {mentionQuery !== null && filtered.length > 0 && (
          <div className="absolute bottom-full mb-1.5 left-0 w-56 glass rounded-xl border border-surface-700/50 shadow-2xl z-50 overflow-hidden animate-scale-in">
            <div className="px-2.5 py-1.5 border-b border-surface-700/40">
              <span className="text-[10px] text-surface-500 font-medium uppercase tracking-wider">Mention</span>
            </div>
            {filtered.map((user, idx) => (
              <button
                key={user.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault(); // keep input focused
                  selectUser(user);
                }}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 text-left transition-colors ${
                  idx === highlightIdx
                    ? 'bg-brand-600 text-white'
                    : 'hover:bg-surface-700/50 text-surface-200'
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold ${
                    idx === highlightIdx ? 'bg-white/20 text-white' : 'bg-brand-600/80 text-white'
                  }`}
                >
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm font-medium truncate">{user.name}</span>
                <span className={`text-[10px] ml-auto flex-shrink-0 ${idx === highlightIdx ? 'text-white/60' : 'text-surface-500'}`}>
                  {user.role?.name}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }
);

MentionInput.displayName = 'MentionInput';
export default MentionInput;

/** Parse @[Name] tokens in a message and return styled React nodes.
 *  Mentions of currentUserName are highlighted in yellow; others in brand blue. */
export function renderWithMentions(text: string, currentUserName?: string): React.ReactNode {
  const parts = text.split(/(@\[[^\]]+\])/g);
  return parts.map((part, i) => {
    const m = part.match(/^@\[([^\]]+)\]$/);
    if (m) {
      const name = m[1];
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
    return part;
  });
}
