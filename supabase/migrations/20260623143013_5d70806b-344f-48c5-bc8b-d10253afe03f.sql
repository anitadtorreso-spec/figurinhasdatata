
-- Teams
CREATE TABLE public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  flag TEXT NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.teams TO anon, authenticated;
GRANT ALL ON public.teams TO authenticated, service_role;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "teams_read_all" ON public.teams FOR SELECT USING (true);
CREATE POLICY "teams_admin_write" ON public.teams FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Stickers
CREATE TABLE public.stickers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  number INT NOT NULL,
  price_cents INT NOT NULL DEFAULT 200,
  stock INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (team_id, number)
);
GRANT SELECT ON public.stickers TO anon, authenticated;
GRANT ALL ON public.stickers TO authenticated, service_role;
ALTER TABLE public.stickers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stickers_read_all" ON public.stickers FOR SELECT USING (true);
CREATE POLICY "stickers_admin_write" ON public.stickers FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Orders
CREATE TYPE public.order_status AS ENUM ('pending', 'confirmed', 'cancelled');

CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name TEXT NOT NULL,
  customer_contact TEXT NOT NULL,
  note TEXT,
  status public.order_status NOT NULL DEFAULT 'pending',
  total_cents INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT INSERT ON public.orders TO anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orders_anon_insert" ON public.orders FOR INSERT TO anon, authenticated WITH CHECK (status = 'pending');
CREATE POLICY "orders_admin_read" ON public.orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "orders_admin_update" ON public.orders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "orders_admin_delete" ON public.orders FOR DELETE TO authenticated USING (true);

-- Order items
CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  sticker_id UUID NOT NULL REFERENCES public.stickers(id),
  quantity INT NOT NULL CHECK (quantity > 0),
  unit_price_cents INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT INSERT ON public.order_items TO anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON public.order_items TO authenticated;
GRANT ALL ON public.order_items TO service_role;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order_items_anon_insert" ON public.order_items FOR INSERT TO anon, authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.status = 'pending'));
CREATE POLICY "order_items_admin_read" ON public.order_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "order_items_admin_all" ON public.order_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_stickers_updated BEFORE UPDATE ON public.stickers FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Confirm order: decrement stock atomically. Returns the order id, or raises.
CREATE OR REPLACE FUNCTION public.confirm_order(p_order_id UUID) RETURNS UUID AS $$
DECLARE
  v_status public.order_status;
  r RECORD;
BEGIN
  SELECT status INTO v_status FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;
  IF v_status <> 'pending' THEN RAISE EXCEPTION 'Pedido não está pendente'; END IF;

  FOR r IN SELECT sticker_id, quantity FROM public.order_items WHERE order_id = p_order_id LOOP
    UPDATE public.stickers SET stock = stock - r.quantity WHERE id = r.sticker_id;
    IF (SELECT stock FROM public.stickers WHERE id = r.sticker_id) < 0 THEN
      RAISE EXCEPTION 'Estoque insuficiente para a figurinha %', r.sticker_id;
    END IF;
  END LOOP;

  UPDATE public.orders SET status = 'confirmed' WHERE id = p_order_id;
  RETURN p_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.confirm_order(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_order(UUID) TO authenticated, service_role;

-- Seed teams (FIFA World Cup 2026 — 48 selecionados; lista parcial preenchida com confirmados/principais)
INSERT INTO public.teams (code, name, flag, sort_order) VALUES
('CAN','Canadá','🇨🇦',1),('MEX','México','🇲🇽',2),('USA','Estados Unidos','🇺🇸',3),
('ARG','Argentina','🇦🇷',4),('BRA','Brasil','🇧🇷',5),('URU','Uruguai','🇺🇾',6),
('COL','Colômbia','🇨🇴',7),('EQU','Equador','🇪🇨',8),('PAR','Paraguai','🇵🇾',9),
('FRA','França','🇫🇷',10),('ESP','Espanha','🇪🇸',11),('ING','Inglaterra','🏴󠁧󠁢󠁥󠁮󠁧󠁿',12),
('ALE','Alemanha','🇩🇪',13),('POR','Portugal','🇵🇹',14),('ITA','Itália','🇮🇹',15),
('HOL','Holanda','🇳🇱',16),('BEL','Bélgica','🇧🇪',17),('CRO','Croácia','🇭🇷',18),
('SUI','Suíça','🇨🇭',19),('AUT','Áustria','🇦🇹',20),('DIN','Dinamarca','🇩🇰',21),
('NOR','Noruega','🇳🇴',22),('TUR','Turquia','🇹🇷',23),('ESV','Eslováquia','🇸🇰',24),
('JAP','Japão','🇯🇵',25),('COR','Coreia do Sul','🇰🇷',26),('IRA','Irã','🇮🇷',27),
('AUS','Austrália','🇦🇺',28),('UZB','Uzbequistão','🇺🇿',29),('JOR','Jordânia','🇯🇴',30),
('CAT','Catar','🇶🇦',31),('ARS','Arábia Saudita','🇸🇦',32),
('MAR','Marrocos','🇲🇦',33),('TUN','Tunísia','🇹🇳',34),('EGI','Egito','🇪🇬',35),
('ARG2','Argélia','🇩🇿',36),('SEN','Senegal','🇸🇳',37),('CIV','Costa do Marfim','🇨🇮',38),
('GAN','Gana','🇬🇭',39),('NIG','Nigéria','🇳🇬',40),('CAM','Camarões','🇨🇲',41),
('NZL','Nova Zelândia','🇳🇿',42),
('REP1','Repescagem 1','🏳️',43),('REP2','Repescagem 2','🏳️',44),
('REP3','Repescagem 3','🏳️',45),('REP4','Repescagem 4','🏳️',46),
('REP5','Repescagem 5','🏳️',47),('REP6','Repescagem 6','🏳️',48);

-- Seed 20 stickers per team
INSERT INTO public.stickers (team_id, number, price_cents, stock)
SELECT t.id, n, 200, 0
FROM public.teams t
CROSS JOIN generate_series(1, 20) AS n;
