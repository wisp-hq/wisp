interface Props {
  title: string;
  children: React.ReactNode;
}

export function ReviewSection({ title, children }: Props) {
  return (
    <section className="flex flex-col gap-3 rounded-md border border-input/60 p-3">
      <h3 className="text-sm font-medium">{title}</h3>
      {children}
    </section>
  );
}
