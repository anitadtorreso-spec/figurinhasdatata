
-- Roles
CREATE TYPE public.app_role AS ENUM ('admin');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_roles_self_read" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Replace permissive policies with admin checks
DROP POLICY "teams_admin_write" ON public.teams;
CREATE POLICY "teams_admin_write" ON public.teams FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY "stickers_admin_write" ON public.stickers;
CREATE POLICY "stickers_admin_write" ON public.stickers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY "orders_admin_read" ON public.orders;
DROP POLICY "orders_admin_update" ON public.orders;
DROP POLICY "orders_admin_delete" ON public.orders;
CREATE POLICY "orders_admin_read" ON public.orders FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "orders_admin_update" ON public.orders FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "orders_admin_delete" ON public.orders FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY "order_items_admin_read" ON public.order_items;
DROP POLICY "order_items_admin_all" ON public.order_items;
CREATE POLICY "order_items_admin_read" ON public.order_items FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "order_items_admin_all" ON public.order_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Restrict confirm_order to admins only
REVOKE EXECUTE ON FUNCTION public.confirm_order(UUID) FROM authenticated;
CREATE OR REPLACE FUNCTION public.confirm_order(p_order_id UUID) RETURNS UUID AS $$
DECLARE
  v_status public.order_status;
  r RECORD;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;

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
GRANT EXECUTE ON FUNCTION public.confirm_order(UUID) TO authenticated;

-- Auto-promote first signed-up user to admin (so the owner doesn't need DB access)
CREATE OR REPLACE FUNCTION public.bootstrap_first_admin() RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_bootstrap_admin
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.bootstrap_first_admin();
