interface Props {
  onClick: () => void;
  title: string;
  disabled?: boolean;
  children: React.ReactNode;
}

export function IconAction({ onClick, title, disabled, children }: Props) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent" aria-label={title} title={title}>
      {children}
    </button>
  );
}
