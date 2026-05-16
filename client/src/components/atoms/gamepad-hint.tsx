interface Props {
  glyph: string;
  action: string;
}

export function GamepadHint({ glyph, action }: Props) {
  return (
    <span className="flex items-center gap-1.5">
      <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border bg-muted px-1.5 text-[11px] font-semibold text-foreground">{glyph}</kbd>
      <span>{action}</span>
    </span>
  );
}
