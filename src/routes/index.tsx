import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetFooter } from "@/components/ui/sheet";
import { ShoppingCart, Minus, Plus, Check, Search } from "lucide-react";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format";
import { SiteHeader } from "@/components/SiteHeader";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Catálogo de Figurinhas da Copa" },
      { name: "description", content: "Veja as figurinhas disponíveis, selecione as que faltam no seu álbum e envie o pedido." },
    ],
  }),
  component: CatalogPage,
});

type Team = { id: string; code: string; name: string; flag: string; sort_order: number };
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
  const [onlyAvailable, setOnlyAvailable] = useState(true);
  const [open, setOpen] = useState(false);

  const stickersByTeam = useMemo(() => {
    const m = new Map<string, Sticker[]>();
    for (const s of stickers) {
      if (!m.has(s.team_id)) m.set(s.team_id, []);
      m.get(s.team_id)!.push(s);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.number - b.number);
    return m;
  }, [stickers]);

  const filteredTeams = useMemo(() => {
    const q = query.trim().toLowerCase();
    return teams.filter((t) => {
      if (q && !(t.name.toLowerCase().includes(q) || t.code.toLowerCase().includes(q))) return false;
      if (onlyAvailable) {
        const has = (stickersByTeam.get(t.id) ?? []).some((s) => s.stock > 0);
        if (!has) return false;
      }
      return true;
    });
  }, [teams, query, onlyAvailable, stickersByTeam]);

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
        <section className="rounded-2xl border bg-card p-6 shadow-card">
          <h1 style={{ fontFamily: "var(--font-display)" }} className="text-4xl tracking-wide sm:text-5xl">
            Complete seu álbum 🏆
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Marque os números das figurinhas que faltam. Quando terminar, abra <strong>Meu pedido</strong>, preencha seus dados e envie. A gente confirma a disponibilidade em seguida.
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

        <div className="mt-6 space-y-8">
          {filteredTeams.length === 0 && (
            <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
              Nenhuma seleção encontrada.
            </div>
          )}
          {filteredTeams.map((team) => {
            const list = stickersByTeam.get(team.id) ?? [];
            return (
              <section key={team.id}>
                <div className="mb-3 flex items-center gap-3">
                  <span className="text-3xl">{team.flag}</span>
                  <div>
                    <h2 style={{ fontFamily: "var(--font-display)" }} className="text-2xl tracking-wide">
                      {team.name}
                    </h2>
                    <div className="text-xs uppercase tracking-widest text-muted-foreground">{team.code}</div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-8 lg:grid-cols-10">
                  {list.map((s) => {
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
                            <span className="text-[10px] font-semibold uppercase tracking-widest opacity-70">{team.code}</span>
                            {qty > 0 && <Check className="h-3.5 w-3.5" />}
                          </div>
                          <div style={{ fontFamily: "var(--font-display)" }} className="text-3xl leading-none">{s.number}</div>
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
              </section>
            );
          })}
        </div>
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
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: async () => {
      if (!name.trim() || !contact.trim()) throw new Error("Preencha nome e contato.");
      if (items.length === 0) throw new Error("Selecione ao menos uma figurinha.");
      const { data: order, error: oErr } = await supabase
        .from("orders")
        .insert({ customer_name: name.trim(), customer_contact: contact.trim(), note: note.trim() || null, total_cents: totalCents })
        .select()
        .single();
      if (oErr) throw oErr;
      const payload = items.map((i) => ({
        order_id: order.id,
        sticker_id: i.sticker.id,
        quantity: i.quantity,
        unit_price_cents: i.sticker.price_cents,
      }));
      const { error: iErr } = await supabase.from("order_items").insert(payload);
      if (iErr) throw iErr;
      return order.id as string;
    },
    onSuccess: (id) => {
      toast.success("Pedido enviado!");
      setSubmitted(id);
      onClear();
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (submitted) {
    return (
      <SheetContent className="flex flex-col">
        <SheetHeader>
          <SheetTitle>Pedido enviado ✅</SheetTitle>
        </SheetHeader>
        <div className="mt-6 space-y-3 text-sm">
          <p>Recebemos sua seleção. Em breve entraremos em contato para confirmar.</p>
          <p className="rounded-md bg-muted p-3 font-mono text-xs">Código: {submitted.slice(0, 8)}</p>
        </div>
        <SheetFooter className="mt-auto">
          <Button onClick={() => { setSubmitted(null); onDone(); }}>Voltar ao catálogo</Button>
        </SheetFooter>
      </SheetContent>
    );
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
          <div className="space-y-2">
            <div>
              <Label htmlFor="name">Nome *</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" maxLength={100} />
            </div>
            <div>
              <Label htmlFor="contact">WhatsApp ou e-mail *</Label>
              <Input id="contact" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="(11) 99999-9999" maxLength={120} />
            </div>
            <div>
              <Label htmlFor="note">Observação</Label>
              <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opcional" maxLength={400} />
            </div>
          </div>
          <Button onClick={() => submit.mutate()} disabled={submit.isPending} className="w-full" size="lg">
            {submit.isPending ? "Enviando..." : "Enviar pedido"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">Pagamento combinado depois de confirmar a disponibilidade.</p>
        </div>
      )}
    </SheetContent>
  );
}
