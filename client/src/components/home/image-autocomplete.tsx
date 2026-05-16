import { Loader2, Star } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type ImageMatch, listTags, searchImages, type TagMatch } from '@/clients/registry.client';
import { cn } from '@/lib/utils';
import { Input } from '../ui/input';

interface Props {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
  showFormatHint?: boolean;
}

const IMAGE_REF_RE = /^(?:(?:[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?(?::\d+)?\/)?[a-z0-9]+(?:[._/-][a-z0-9]+)*?)(?::([a-zA-Z0-9][a-zA-Z0-9._-]{0,127}))?$/;

export function isValidImageRef(ref: string): boolean {
  return IMAGE_REF_RE.test(ref.trim());
}

type Suggestion = { kind: 'image'; image: ImageMatch } | { kind: 'tag'; image: string; tag: TagMatch };

const DEBOUNCE_MS = 300;

const SUPPORTED_TAG_HOSTS = ['docker.io', 'ghcr.io'];

function splitOnTag(raw: string): { image: string; tagQuery: string; hasColon: boolean } {
  const slash = raw.lastIndexOf('/');
  const colon = raw.lastIndexOf(':');
  if (colon > slash) {
    return { image: raw.slice(0, colon), tagQuery: raw.slice(colon + 1), hasColon: true };
  }

  return { image: raw, tagQuery: '', hasColon: false };
}

function hostOf(image: string): string {
  const slash = image.indexOf('/');
  if (slash <= 0) {
    return 'docker.io';
  }

  const head = image.slice(0, slash);
  if (head.includes('.') || head.includes(':') || head === 'localhost') {
    return head;
  }

  return 'docker.io';
}

export function ImageAutocomplete({ id, value, onChange, placeholder, className, showFormatHint }: Props) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedValue(value), DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [value]);

  const mode = useMemo<'search' | 'tags' | 'idle'>(() => {
    const trimmed = debouncedValue.trim();
    if (!trimmed) {
      return 'idle';
    }

    const { hasColon, image } = splitOnTag(trimmed);
    if (hasColon && image && SUPPORTED_TAG_HOSTS.includes(hostOf(image))) {
      return 'tags';
    }

    return 'search';
  }, [debouncedValue]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const trimmed = debouncedValue.trim();
    if (!trimmed) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);

    const run = async () => {
      try {
        if (mode === 'tags') {
          const { image, tagQuery } = splitOnTag(trimmed);
          const tags = await listTags(image, tagQuery, controller.signal);
          setSuggestions(tags.map((tag) => ({ kind: 'tag', image, tag })));
        } else {
          const results = await searchImages(trimmed, controller.signal);
          setSuggestions(results.map((image) => ({ kind: 'image', image })));
        }
        setActiveIndex(-1);
      } catch (err) {
        if ((err as { name?: string }).name !== 'AbortError') {
          setSuggestions([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    run();
    return () => controller.abort();
  }, [debouncedValue, mode, open]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  function applySuggestion(s: Suggestion) {
    if (s.kind === 'image') {
      onChange(`${s.image.ref}:`);
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      onChange(`${s.image}:${s.tag.tag}`);
      setOpen(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) {
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      applySuggestion(suggestions[activeIndex]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  const showDropdown = open && (loading || suggestions.length > 0 || debouncedValue.trim().length > 0);
  const trimmed = value.trim();
  const formatInvalid = showFormatHint && trimmed.length > 0 && !isValidImageRef(trimmed);

  return (
    <div ref={wrapperRef} className="relative">
      <Input
        ref={inputRef}
        id={id}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={className}
        aria-invalid={formatInvalid || undefined}
        autoComplete="off"
        spellCheck={false}
      />
      {formatInvalid ? <p className="mt-1 text-xs text-destructive">{t('imageAutocomplete.invalidFormat')}</p> : null}
      {showDropdown ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-y-auto rounded-md border border-input bg-popover text-popover-foreground shadow-md">
          {loading && suggestions.length === 0 ? (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> {t('imageAutocomplete.loading')}
            </div>
          ) : suggestions.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">{mode === 'tags' ? t('imageAutocomplete.noTags') : t('imageAutocomplete.noResults')}</div>
          ) : (
            <ul>
              {suggestions.map((s, i) => (
                <li key={s.kind === 'image' ? `i-${s.image.ref}` : `t-${s.image}-${s.tag.tag}`}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === activeIndex}
                    onMouseEnter={() => setActiveIndex(i)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      applySuggestion(s);
                    }}
                    className={cn('flex w-full items-start justify-between gap-2 px-3 py-2 text-left text-sm transition', i === activeIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50')}
                  >
                    {s.kind === 'image' ? (
                      <>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 font-mono text-xs">
                            <span className="truncate">{s.image.ref}</span>
                            {s.image.official ? <span className="rounded bg-primary/20 px-1 text-[10px] uppercase text-primary">{t('imageAutocomplete.official')}</span> : null}
                          </div>
                          {s.image.description ? <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">{s.image.description}</p> : null}
                        </div>
                        {typeof s.image.stars === 'number' && s.image.stars > 0 ? (
                          <span className="flex shrink-0 items-center gap-0.5 text-[11px] text-muted-foreground">
                            <Star className="h-3 w-3" /> {formatStars(s.image.stars)}
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <>
                        <span className="truncate font-mono text-xs">{s.tag.tag}</span>
                        {s.tag.pushed ? <span className="shrink-0 text-[11px] text-muted-foreground">{formatPushed(s.tag.pushed)}</span> : null}
                      </>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

function formatStars(n: number): string {
  if (n >= 1000) {
    return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  }

  return String(n);
}

function formatPushed(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return '';
  }

  const diffMs = Date.now() - d.getTime();
  const days = Math.floor(diffMs / 86_400_000);
  if (days < 1) {
    return 'today';
  }

  if (days < 30) {
    return `${days}d`;
  }

  const months = Math.floor(days / 30);
  if (months < 12) {
    return `${months}mo`;
  }

  return `${Math.floor(months / 12)}y`;
}
