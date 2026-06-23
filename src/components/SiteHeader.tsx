import { Link } from "@tanstack/react-router";

export function SiteHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link to="/" className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm">
            <span className="text-xl">⚽</span>
          </div>
          <div className="leading-tight">
            <div style={{ fontFamily: "var(--font-display)" }} className="text-xl tracking-wide">FIGURINHAS DA COPA</div>
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Catálogo & Pedidos</div>
          </div>
        </Link>
        <div className="flex items-center gap-2">{children}</div>
      </div>
    </header>
  );
}
