import { useEffect, useRef, type ReactNode } from "react";

/** One screen: its heading takes focus on arrival so keyboard users start at the top. */
export function Page({ title, children }: { title: string; children: ReactNode }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  return (
    <main className="page">
      <h1 ref={heading} tabIndex={-1}>
        {title}
      </h1>
      {children}
    </main>
  );
}
