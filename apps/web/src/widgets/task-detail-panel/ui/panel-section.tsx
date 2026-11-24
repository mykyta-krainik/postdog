import { useId, type ReactNode } from 'react';

/** One titled block of the panel, under a hairline. meta sits at the right of the title. */
export function PanelSection({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2.5 border-t border-border pt-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id={id} className="text-[13px] font-medium text-foreground">
          {title}
        </h3>
        {meta}
      </div>
      {children}
    </section>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="text-[13px] leading-relaxed text-muted-foreground">{children}</p>;
}
