import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatBRL, formatDate } from "@/lib/format";
import { SiteHeader } from "@/components/SiteHeader";
import { Check, X, Package, ShoppingBag, LogOut, Plus, Minus } from "lucide-react";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin · Figurinhas da Copa" }, { name: "robots", content: "noindex" }] }),
  component: AdminPage,
});

type Team = { id: string; code: string; name: string; flag: string; sort_order: number; group_label: string | null };
type Sticker = { id: string; team_id: string; number: number; price_cents: number; stock: number };
type Order = { id: string; customer_name: string; customer_contact: string; note: string | null; status: "pending" | "confirmed" | "cancelled"; total_cents: number; created_at: string };
type OrderItem = { id: string; order_id: string; sticker_id: string; quantity: number; unit_price_cents: number };

function AdminPage() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [isAdmin, setIsAdmin] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) { setIsAdmin(session === null ? false : undefined); return; }
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", session.user.id)
      .eq("role", "admin")
      .maybeSingle()
      .then(({ data }) => setIsAdmin(!!data));
  }, [session]);

  if (session === undefined) return <Loading />;
  if (!session) return <AuthForm />;
  if (isAdmin === undefined) return <Loading />;
  if (!isAdmin) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <main className="mx-auto max-w-md p-6">
          <Card>
            <CardHeader><CardTitle>Sem permissão</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>Sua conta não é administradora. O primeiro usuário cadastrado vira admin automaticamente.</p>
              <Button variant="outline" onClick={() => supabase.auth.signOut()}>Sair</Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }
  return <Dashboard />;
}

function Loading() {
  return <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">Carregando...</div>;
}

function AuthForm() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin + "/admin" } });
        if (error) throw error;
        toast.success("Conta criada. Você já pode entrar.");
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-md p-6">
        <Card>
          <CardHeader>
            <CardTitle>Acesso do administrador</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={mode} onValueChange={(v) => setMode(v as "login" | "signup")}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Entrar</TabsTrigger>
                <TabsTrigger value="signup">Criar conta</TabsTrigger>
              </TabsList>
              <form onSubmit={submit} className="mt-4 space-y-3">
                <div>
                  <Label htmlFor="email">E-mail</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div>
                  <Label htmlFor="password">Senha</Label>
                  <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required />
                </div>
                <Button type="submit" disabled={busy} className="w-full">
                  {busy ? "Aguarde..." : mode === "login" ? "Entrar" : "Criar conta de admin"}
                </Button>
                {mode === "signup" && (
                  <p className="text-xs text-muted-foreground">
                    A primeira conta criada é automaticamente promovida a administrador.
                  </p>
                )}
              </form>
            </Tabs>
            <div className="mt-4 text-center text-xs">
              <Link to="/" className="text-muted-foreground hover:underline">← Voltar ao catálogo</Link>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function Dashboard() {
  return (
    <div className="min-h-screen">
      <SiteHeader>
        <Button variant="outline" size="sm" onClick={() => supabase.auth.signOut()}>
          <LogOut className="h-4 w-4" /> Sair
        </Button>
      </SiteHeader>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Tabs defaultValue="orders">
          <TabsList>
            <TabsTrigger value="orders"><ShoppingBag className="mr-1 h-4 w-4" /> Pedidos</TabsTrigger>
            <TabsTrigger value="stock"><Package className="mr-1 h-4 w-4" /> Estoque</TabsTrigger>
          </TabsList>
          <TabsContent value="orders" className="mt-4"><OrdersPanel /></TabsContent>
          <TabsContent value="stock" className="mt-4"><StockPanel /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function OrdersPanel() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"pending" | "confirmed" | "cancelled">("pending");

  const { data: orders = [] } = useQuery({
    queryKey: ["orders"],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Order[];
    },
  });

  const { data: items = [] } = useQuery({
    queryKey: ["order_items"],
    queryFn: async () => {
      const { data, error } = await supabase.from("order_items").select("*");
      if (error) throw error;
      return data as OrderItem[];
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

  const { data: teams = [] } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const { data, error } = await supabase.from("teams").select("*");
      if (error) throw error;
      return data as Team[];
    },
  });

  const stickerMap = useMemo(() => new Map(stickers.map((s) => [s.id, s])), [stickers]);
  const teamMap = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const itemsByOrder = useMemo(() => {
    const m = new Map<string, OrderItem[]>();
    for (const i of items) {
      if (!m.has(i.order_id)) m.set(i.order_id, []);
      m.get(i.order_id)!.push(i);
    }
    return m;
  }, [items]);

  const confirm = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("confirm_order", { p_order_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pedido confirmado e estoque baixado.");
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["stickers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("orders").update({ status: "cancelled" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pedido cancelado.");
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = orders.filter((o) => o.status === filter);
  const counts = {
    pending: orders.filter((o) => o.status === "pending").length,
    confirmed: orders.filter((o) => o.status === "confirmed").length,
    cancelled: orders.filter((o) => o.status === "cancelled").length,
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(["pending", "confirmed", "cancelled"] as const).map((s) => (
          <Button key={s} variant={filter === s ? "default" : "outline"} size="sm" onClick={() => setFilter(s)}>
            {s === "pending" ? "Pendentes" : s === "confirmed" ? "Confirmados" : "Cancelados"} ({counts[s]})
          </Button>
        ))}
      </div>

      {filtered.length === 0 && (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Nenhum pedido nesta lista.</CardContent></Card>
      )}

      {filtered.map((o) => {
        const oi = itemsByOrder.get(o.id) ?? [];
        return (
          <Card key={o.id}>
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
              <div>
                <CardTitle className="text-base">{o.customer_name}</CardTitle>
                <div className="text-xs text-muted-foreground">{o.customer_contact} · {formatDate(o.created_at)}</div>
                {o.note && <div className="mt-1 text-xs italic text-muted-foreground">"{o.note}"</div>}
              </div>
              <Badge variant={o.status === "pending" ? "secondary" : o.status === "confirmed" ? "default" : "destructive"}>
                {o.status}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {oi.map((i) => {
                  const s = stickerMap.get(i.sticker_id);
                  const t = s ? teamMap.get(s.team_id) : undefined;
                  const lowStock = s && s.stock < i.quantity;
                  return (
                    <span key={i.id} className={"inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs " + (lowStock && o.status === "pending" ? "border-destructive text-destructive" : "")}>
                      <span>{t?.flag}</span>
                      <span className="font-semibold">{t?.code} #{s?.number}</span>
                      <span className="text-muted-foreground">×{i.quantity}</span>
                    </span>
                  );
                })}
              </div>
              <div className="flex items-center justify-between border-t pt-3">
                <div className="text-sm font-bold">{formatBRL(o.total_cents)}</div>
                {o.status === "pending" && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => cancel.mutate(o.id)} disabled={cancel.isPending}>
                      <X className="h-4 w-4" /> Cancelar
                    </Button>
                    <Button size="sm" onClick={() => confirm.mutate(o.id)} disabled={confirm.isPending}>
                      <Check className="h-4 w-4" /> Confirmar e baixar estoque
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function StockPanel() {
  const qc = useQueryClient();
  const [bulkDelta, setBulkDelta] = useState(10);

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

  const adjust = useMutation({
    mutationFn: async ({ id, stock, price_cents }: { id: string; stock?: number; price_cents?: number }) => {
      const patch: { stock?: number; price_cents?: number } = {};
      if (stock !== undefined) patch.stock = Math.max(0, stock);
      if (price_cents !== undefined) patch.price_cents = Math.max(0, price_cents);
      const { error } = await supabase.from("stickers").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["stickers"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkAddTeam = useMutation({
    mutationFn: async ({ teamId, delta }: { teamId: string; delta: number }) => {
      const teamStickers = stickers.filter((s) => s.team_id === teamId);
      const updates = teamStickers.map((s) =>
        supabase.from("stickers").update({ stock: Math.max(0, s.stock + delta) }).eq("id", s.id)
      );
      const results = await Promise.all(updates);
      const err = results.find((r) => r.error)?.error;
      if (err) throw err;
    },
    onSuccess: () => {
      toast.success("Estoque atualizado.");
      qc.invalidateQueries({ queryKey: ["stickers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const stickersByTeam = useMemo(() => {
    const m = new Map<string, Sticker[]>();
    for (const s of stickers) {
      if (!m.has(s.team_id)) m.set(s.team_id, []);
      m.get(s.team_id)!.push(s);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.number - b.number);
    return m;
  }, [stickers]);

  const totalStock = stickers.reduce((sum, s) => sum + s.stock, 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="text-sm">
            <strong>{totalStock}</strong> figurinhas em estoque · <strong>{stickers.length}</strong> tipos
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Label htmlFor="bulk">Ajuste rápido por seleção:</Label>
            <Input id="bulk" type="number" value={bulkDelta} onChange={(e) => setBulkDelta(Number(e.target.value))} className="w-20" />
            <span className="text-muted-foreground">un</span>
          </div>
        </CardContent>
      </Card>

      {teams.map((t) => {
        const list = stickersByTeam.get(t.id) ?? [];
        const teamTotal = list.reduce((s, x) => s + x.stock, 0);
        return (
          <Card key={t.id}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 py-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <span className="text-2xl">{t.flag}</span> {t.name}
                <span className="text-xs font-normal text-muted-foreground">({teamTotal} un)</span>
              </CardTitle>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={() => bulkAddTeam.mutate({ teamId: t.id, delta: -bulkDelta })}>
                  <Minus className="h-3 w-3" /> {bulkDelta}
                </Button>
                <Button size="sm" variant="outline" onClick={() => bulkAddTeam.mutate({ teamId: t.id, delta: bulkDelta })}>
                  <Plus className="h-3 w-3" /> {bulkDelta}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-10">
                {list.map((s) => (
                  <div key={s.id} className="rounded-md border bg-card p-2 text-center">
                    <button
                      type="button"
                      onClick={() => adjust.mutate({ id: s.id, stock: s.stock + 1 })}
                      className="w-full text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground cursor-pointer"
                      title="Clique para adicionar 1 ao estoque"
                    >
                      #{s.number}
                    </button>
                    <div className="mt-1 flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-7 w-7 shrink-0"
                        onClick={() => adjust.mutate({ id: s.id, stock: Math.max(0, s.stock - 1) })}
                        disabled={s.stock <= 0}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <Input
                        type="number"
                        defaultValue={s.stock}
                        key={`stock-${s.id}-${s.stock}`}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (v !== s.stock) adjust.mutate({ id: s.id, stock: v });
                        }}
                        className="h-7 px-1 text-center text-sm"
                      />
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-7 w-7 shrink-0"
                        onClick={() => adjust.mutate({ id: s.id, stock: s.stock + 1 })}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                    <Input
                      type="number"
                      step="0.01"
                      defaultValue={(s.price_cents / 100).toFixed(2)}
                      key={`price-${s.id}-${s.price_cents}`}
                      onBlur={(e) => {
                        const v = Math.round(Number(e.target.value) * 100);
                        if (v !== s.price_cents) adjust.mutate({ id: s.id, price_cents: v });
                      }}
                      className="mt-1 h-7 text-center text-xs text-muted-foreground"
                    />
                  </div>
                ))}

              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
