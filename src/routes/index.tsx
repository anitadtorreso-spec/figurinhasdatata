import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ShoppingCart, Minus, Plus, Check, Search, ArrowLeft, ChevronRight, List } from "lucide-react";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format";
import { SiteHeader } from "@/components/SiteHeader";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Figurinhas da Tatá — Catálogo da Copa 2026" },
      { name: "description", content: "Veja as figurinhas disponíveis na Tatá, selecione as que faltam no seu álbum da Copa 2026 e envie o pedido." },
    ],
  }),
  component: CatalogPage,
});

type Team = { id: string; code: string; name: string; flag: string; sort_order: number; group_label: string | null };
type Sticker = { id: string; team_id: string; number: number; price_cents: number; stock: number };

function CatalogPage() {
  const { data: teams = [] } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const { data, error } = await supabase.from("teams").select("*").order("sort_order");
      if (error) throw error;
      return data as Team[];
    },
  });

  const { data: stickers = [] } = useQuery({
    queryKey: ["stickers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stickers").select("*");
      if (error) throw error;
      return data as Sticker[];
    },
  });

  const [cart, setCart] = useState<Record<string, number>>({});
  const [query, setQuery] = useState("");
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [open, setOpen] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [listInput, setListInput] = useState("");

  const stickersByTeam = useMemo(() => {
    const m = new Map<string, Sticker[]>();
    for (const s of stickers) {
      if (!m.has(s.team_id)) m.set(s.team_id, []);
      m.get(s.team_id)!.push(s);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.number - b.number);
    return m;
  }, [stickers]);

  const teamStats = useMemo(() => {
    const m = new Map<string, { available: number; units: number; total: number }>();
    for (const t of teams) {
      const list = stickersByTeam.get(t.id) ?? [];
      const available = list.filter((s) => s.stock > 0).length;
      const units = list.reduce((sum, s) => sum + Math.max(0, s.stock), 0);
      m.set(t.id, { available, units, total: list.length });
    }
    return m;
  }, [teams, stickersByTeam]);

  const filteredTeams = useMemo(() => {
    const q = query.trim().toLowerCase();
    return teams.filter((t) => {
      if (q && !(t.name.toLowerCase().includes(q) || t.code.toLowerCase().includes(q))) return false;
      if (onlyAvailable && (teamStats.get(t.id)?.available ?? 0) === 0) return false;
      return true;
    });
  }, [teams, query, onlyAvailable, teamStats]);

  const cartItems = useMemo(() => {
    return Object.entries(cart)
      .filter(([, q]) => q > 0)
      .map(([id, q]) => {
        const s = stickers.find((x) => x.id === id)!;
        const t = teams.find((x) => x.id === s?.team_id);
        return { sticker: s, team: t, quantity: q };
      })
      .filter((x) => x.sticker);
  }, [cart, stickers, teams]);

  const totalCents = cartItems.reduce((sum, i) => sum + i.sticker.price_cents * i.quantity, 0);
  const totalQty = cartItems.reduce((sum, i) => sum + i.quantity, 0);

  function changeQty(stickerId: string, delta: number, stock: number) {
    setCart((c) => {
      const cur = c[stickerId] ?? 0;
      const next = Math.max(0, Math.min(stock, cur + delta));
      return { ...c, [stickerId]: next };
    });
  }

  function addFromList() {
    if (!selectedTeamId) return;
    const nums = listInput
      .split(/\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .map((l) => parseInt(l, 10))
      .filter((n) => !isNaN(n) && n > 0);

    if (nums.length === 0) {
      toast.error("Cole uma lista de números válidos.");
      return;
    }

    const teamStickers = stickersByTeam.get(selectedTeamId) ?? [];
    let added = 0;
    let skipped = 0;

    setCart((prev) => {
      const next = { ...prev };
      for (const n of nums) {
        const s = teamStickers.find((x) => x.number === n);
        if (!s) { skipped++; continue; }
        if (s.stock <= 0) { skipped++; continue; }
        const cur = next[s.id] ?? 0;
        if (cur >= s.stock) { skipped++; continue; }
        next[s.id] = cur + 1;
        added++;
      }
      return next;
    });

    setListInput("");
    if (added > 0) {
      toast.success(`${added} figurinha(s) adicionada(s) ao pedido.`, { description: skipped > 0 ? `${skipped} não encontrada(s) ou sem estoque.` : undefined });
    } else {
      toast.error("Nenhuma figurinha foi adicionada.", { description: "Verifique os números e o estoque disponível." });
    }
  }

  const selectedTeam = selectedTeamId ? teams.find((t) => t.id === selectedTeamId) : null;
  const selectedStickers = selectedTeamId ? stickersByTeam.get(selectedTeamId) ?? [] : [];
  const selectedCartQty = selectedStickers.reduce((sum, s) => sum + (cart[s.id] ?? 0), 0);

  return (
    <div className="min-h-screen">
      <SiteHeader>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button className="relative">
              <ShoppingCart className="h-4 w-4" />
              <span className="hidden sm:inline">Meu pedido</span>
              {totalQty > 0 && (
                <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-accent text-[11px] font-bold text-accent-foreground">
                  {totalQty}
                </span>
              )}
            </Button>
          </SheetTrigger>
          <CartSheet items={cartItems} totalCents={totalCents} onChange={changeQty} onClear={() => setCart({})} onDone={() => setOpen(false)} />
        </Sheet>
      </SiteHeader>

      <main className="mx-auto max-w-6xl px-4 pb-32 pt-6">
        {!selectedTeam ? (
          <>
            <section className="rounded-2xl border bg-card p-6 shadow-card">
              <h1 style={{ fontFamily: "var(--font-display)" }} className="text-4xl tracking-wide sm:text-5xl">
                Complete seu álbum 🏆
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Toque em uma seleção para ver as figurinhas disponíveis em estoque. Marque as que faltam no seu álbum e envie o pedido em <strong>Meu pedido</strong>.
              </p>
            </section>

            <div className="sticky top-[64px] z-20 mt-6 flex flex-wrap items-center gap-3 rounded-xl border bg-background/90 p-3 shadow-sm backdrop-blur">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Buscar seleção (ex: Brasil, BRA)" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={onlyAvailable} onChange={(e) => setOnlyAvailable(e.target.checked)} className="h-4 w-4 accent-[var(--color-primary)]" />
                Só com estoque
              </label>
            </div>

            {filteredTeams.length === 0 ? (
              <div className="mt-6 rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
                Nenhuma seleção encontrada.
              </div>
            ) : (
              (() => {
                const groups: { label: string; teams: Team[] }[] = [];
                for (const t of filteredTeams) {
                  const label = t.group_label ?? "OUTRAS";
                  let g = groups.find((x) => x.label === label);
                  if (!g) { g = { label, teams: [] }; groups.push(g); }
                  g.teams.push(t);
                }
                return (
                  <div className="mt-6 space-y-8">
                    {groups.map((g) => (
                      <section key={g.label}>
                        <h3 style={{ fontFamily: "var(--font-display)" }} className="mb-3 text-sm uppercase tracking-[0.25em] text-muted-foreground">
                          {g.label}
                        </h3>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                          {g.teams.map((team) => {
                            const stats = teamStats.get(team.id) ?? { available: 0, units: 0, total: 0 };
                            const teamCartQty = (stickersByTeam.get(team.id) ?? []).reduce((sum, s) => sum + (cart[s.id] ?? 0), 0);
                            const out = stats.available === 0;
                            return (
                              <button
                                key={team.id}
                                type="button"
                                onClick={() => setSelectedTeamId(team.id)}
                                className={
                                  "group relative flex items-center gap-3 rounded-xl border bg-card p-4 text-left transition hover:border-primary/60 hover:shadow-card " +
                                  (out ? "opacity-70" : "")
                                }
                              >
                                <span className="text-3xl">{team.flag}</span>
                                <div className="min-w-0 flex-1">
                                  <div style={{ fontFamily: "var(--font-display)" }} className="truncate text-lg leading-tight tracking-wide">
                                    {team.name}
                                  </div>
                                  <div className="mt-0.5 text-[11px] uppercase tracking-widest text-muted-foreground">{team.code}</div>
                                  <div className="mt-1 text-xs text-muted-foreground">
                                    {out ? "sem estoque" : `${stats.available}/${stats.total} disponíveis`}
                                  </div>
                                </div>
                                {teamCartQty > 0 && (
                                  <span className="grid h-6 min-w-6 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
                                    {teamCartQty}
                                  </span>
                                )}
                                <ChevronRight className="h-4 w-4 text-muted-foreground transition group-hover:text-primary" />
                              </button>
                            );
                          })}
                        </div>
                      </section>
                    ))}
                  </div>
                );
              })()
            )}
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setSelectedTeamId(null)}
              className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> Voltar para as seleções
            </button>
            <section className="rounded-2xl border bg-card p-5 shadow-card">
              <div className="flex items-center gap-4">
                <span className="text-5xl">{selectedTeam.flag}</span>
                <div className="min-w-0">
                  <h2 style={{ fontFamily: "var(--font-display)" }} className="text-3xl tracking-wide">
                    {selectedTeam.name}
                  </h2>
                  <div className="text-xs uppercase tracking-widest text-muted-foreground">{selectedTeam.code}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {(teamStats.get(selectedTeam.id)?.available ?? 0)}/{(teamStats.get(selectedTeam.id)?.total ?? 0)} disponíveis
                    {selectedCartQty > 0 && <> · {selectedCartQty} no pedido</>}
                  </div>
                </div>
              </div>
            </section>

            <p className="mt-4 text-xs text-muted-foreground">Toque em uma figurinha para adicionar ao pedido.</p>

            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-8 lg:grid-cols-10">
              {selectedStickers.map((s) => {
                const qty = cart[s.id] ?? 0;
                const out = s.stock <= 0;
                return (
                  <div
                    key={s.id}
                    role="button"
                    tabIndex={out ? -1 : 0}
                    aria-disabled={out}
                    onClick={() => !out && changeQty(s.id, 1, s.stock)}
                    onKeyDown={(e) => { if (!out && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); changeQty(s.id, 1, s.stock); } }}
                    className={
                      "group relative aspect-[3/4] overflow-hidden rounded-lg border text-left transition select-none " +
                      (out
                        ? "cursor-not-allowed border-dashed bg-muted text-muted-foreground"
                        : qty > 0
                        ? "cursor-pointer border-primary bg-primary text-primary-foreground shadow-card"
                        : "cursor-pointer border-border bg-card hover:border-primary/60 hover:shadow-card")
                    }
                  >
                    <div className="flex h-full flex-col justify-between p-2">
                      <div className="flex items-start justify-between">
                        <span className="text-[10px] font-semibold uppercase tracking-widest opacity-70">{selectedTeam.code}</span>
                        {qty > 0 && <Check className="h-3.5 w-3.5" />}
                      </div>
                      <div style={{ fontFamily: "var(--font-display)" }} className="text-3xl leading-none">{String(s.number).padStart(2, "0")}</div>
                      <div className="flex items-end justify-between text-[10px]">
                        <span className="opacity-70">{formatBRL(s.price_cents)}</span>
                        <span className="opacity-70">{out ? "esgotada" : `${s.stock} un`}</span>
                      </div>
                    </div>
                    {qty > 0 && (
                      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-background/95 px-1 py-0.5 text-foreground" onClick={(e) => e.stopPropagation()}>
                        <button type="button" onClick={(e) => { e.stopPropagation(); changeQty(s.id, -1, s.stock); }} className="grid h-6 w-6 place-items-center rounded hover:bg-muted">
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="text-xs font-bold">{qty}</span>
                        <button type="button" onClick={(e) => { e.stopPropagation(); changeQty(s.id, 1, s.stock); }} className="grid h-6 w-6 place-items-center rounded hover:bg-muted">
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>

      {totalQty > 0 && (
        <div className="fixed bottom-4 left-1/2 z-30 -translate-x-1/2">
          <Button size="lg" onClick={() => setOpen(true)} className="shadow-pop">
            <ShoppingCart className="h-4 w-4" />
            Revisar pedido ({totalQty}) — {formatBRL(totalCents)}
          </Button>
        </div>
      )}
    </div>
  );
}

const WHATSAPP_NUMBER = "5531975173431";

function buildWhatsAppMessage(
  items: { sticker: Sticker; team?: Team; quantity: number }[],
  totalCents: number,
) {
  const lines: string[] = [];
  lines.push("Olá Tatá! Quero estas figurinhas da Copa 2026:");
  lines.push("");
  const byTeam = new Map<string, { team?: Team; items: { sticker: Sticker; quantity: number }[] }>();
  for (const i of items) {
    const key = i.team?.id ?? i.sticker.team_id;
    if (!byTeam.has(key)) byTeam.set(key, { team: i.team, items: [] });
    byTeam.get(key)!.items.push({ sticker: i.sticker, quantity: i.quantity });
  }
  for (const { team, items: list } of byTeam.values()) {
    list.sort((a, b) => a.sticker.number - b.sticker.number);
    const header = `${team?.flag ?? ""} ${team?.name ?? ""} (${team?.code ?? ""})`.trim();
    lines.push(`*${header}*`);
    for (const { sticker, quantity } of list) {
      const num = String(sticker.number).padStart(2, "0");
      lines.push(`• #${num} — ${quantity}x (${formatBRL(sticker.price_cents)})`);
    }
    lines.push("");
  }
  const totalQty = items.reduce((s, i) => s + i.quantity, 0);
  lines.push(`*Total:* ${totalQty} figurinha(s) — ${formatBRL(totalCents)}`);
  return lines.join("\n");
}

function CartSheet({
  items,
  totalCents,
  onChange,
  onClear,
  onDone,
}: {
  items: { sticker: Sticker; team?: Team; quantity: number }[];
  totalCents: number;
  onChange: (stickerId: string, delta: number, stock: number) => void;
  onClear: () => void;
  onDone: () => void;
}) {
  function sendToWhatsApp() {
    if (items.length === 0) {
      toast.error("Selecione ao menos uma figurinha.");
      return;
    }
    const msg = buildWhatsAppMessage(items, totalCents);
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    toast.success("Abrindo o WhatsApp...");
    onClear();
    onDone();
  }

  return (
    <SheetContent className="flex w-full flex-col sm:max-w-md">
      <SheetHeader>
        <SheetTitle>Meu pedido</SheetTitle>
      </SheetHeader>

      <div className="-mx-6 flex-1 overflow-y-auto px-6">
        {items.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma figurinha selecionada ainda.</p>
        ) : (
          <ul className="divide-y">
            {items.map((i) => (
              <li key={i.sticker.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">
                    {i.team?.flag} {i.team?.code} #{i.sticker.number}
                  </div>
                  <div className="text-xs text-muted-foreground">{formatBRL(i.sticker.price_cents)} · estoque {i.sticker.stock}</div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => onChange(i.sticker.id, -1, i.sticker.stock)} className="grid h-7 w-7 place-items-center rounded border hover:bg-muted">
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="w-6 text-center text-sm font-bold">{i.quantity}</span>
                  <button onClick={() => onChange(i.sticker.id, 1, i.sticker.stock)} className="grid h-7 w-7 place-items-center rounded border hover:bg-muted">
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {items.length > 0 && (
        <div className="space-y-3 border-t pt-4">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total ({items.reduce((s, i) => s + i.quantity, 0)} figurinhas)</span>
            <span className="text-lg font-bold">{formatBRL(totalCents)}</span>
          </div>
          <Button onClick={sendToWhatsApp} className="w-full" size="lg">
            Enviar pedido pelo WhatsApp
          </Button>
          <p className="text-center text-xs text-muted-foreground">Você será levado ao WhatsApp da Tatá com a lista pronta para enviar.</p>
        </div>
      )}
    </SheetContent>
  );
}
