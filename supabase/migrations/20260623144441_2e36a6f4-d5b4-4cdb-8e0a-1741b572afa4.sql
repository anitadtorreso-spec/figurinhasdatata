
-- Add group label to teams for the album layout
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS group_label text;

-- Wipe existing catalog (no real orders yet) keeping only FWC
DELETE FROM public.order_items;
DELETE FROM public.orders;
DELETE FROM public.stickers WHERE team_id IN (SELECT id FROM public.teams WHERE code <> 'FWC');
DELETE FROM public.teams WHERE code <> 'FWC';

-- FWC stays last in the album
UPDATE public.teams
SET name = 'FIFA World Cup History', group_label = 'FIFA WORLD CUP HISTORY', sort_order = 999, flag = '🏆'
WHERE code = 'FWC';

-- Re-seed selections in the exact PDF order
INSERT INTO public.teams (code, name, flag, group_label, sort_order) VALUES
('MEX','México','🇲🇽','GRUPO A',1),
('RSA','África do Sul','🇿🇦','GRUPO A',2),
('KOR','Coreia do Sul','🇰🇷','GRUPO A',3),
('CZE','República Tcheca','🇨🇿','GRUPO A',4),
('CAN','Canadá','🇨🇦','GRUPO B',5),
('BIH','Bósnia','🇧🇦','GRUPO B',6),
('QAT','Catar','🇶🇦','GRUPO B',7),
('SUI','Suíça','🇨🇭','GRUPO B',8),
('BRA','Brasil','🇧🇷','GRUPO C',9),
('MAR','Marrocos','🇲🇦','GRUPO C',10),
('HAI','Haiti','🇭🇹','GRUPO C',11),
('SCO','Escócia','🏴󠁧󠁢󠁳󠁣󠁴󠁿','GRUPO C',12),
('USA','Estados Unidos','🇺🇸','GRUPO D',13),
('PAR','Paraguai','🇵🇾','GRUPO D',14),
('AUS','Austrália','🇦🇺','GRUPO D',15),
('TUR','Turquia','🇹🇷','GRUPO D',16),
('GER','Alemanha','🇩🇪','GRUPO E',17),
('CUW','Curaçao','🇨🇼','GRUPO E',18),
('CIV','Costa do Marfim','🇨🇮','GRUPO E',19),
('ECU','Equador','🇪🇨','GRUPO E',20),
('NED','Holanda','🇳🇱','GRUPO F',21),
('JPN','Japão','🇯🇵','GRUPO F',22),
('SWE','Suécia','🇸🇪','GRUPO F',23),
('TUN','Tunísia','🇹🇳','GRUPO F',24),
('BEL','Bélgica','🇧🇪','GRUPO G',25),
('EGY','Egito','🇪🇬','GRUPO G',26),
('IRN','Irã','🇮🇷','GRUPO G',27),
('NZL','Nova Zelândia','🇳🇿','GRUPO G',28),
('ESP','Espanha','🇪🇸','GRUPO H',29),
('CPV','Cabo Verde','🇨🇻','GRUPO H',30),
('KSA','Arábia Saudita','🇸🇦','GRUPO H',31),
('URU','Uruguai','🇺🇾','GRUPO H',32),
('FRA','França','🇫🇷','GRUPO I',33),
('SEN','Senegal','🇸🇳','GRUPO I',34),
('IRQ','Iraque','🇮🇶','GRUPO I',35),
('NOR','Noruega','🇳🇴','GRUPO I',36),
('ARG','Argentina','🇦🇷','GRUPO J',37),
('ALG','Argélia','🇩🇿','GRUPO J',38),
('AUT','Áustria','🇦🇹','GRUPO J',39),
('JOR','Jordânia','🇯🇴','GRUPO J',40),
('POR','Portugal','🇵🇹','GRUPO K',41),
('COD','Congo','🇨🇩','GRUPO K',42),
('UZB','Uzbequistão','🇺🇿','GRUPO K',43),
('COL','Colômbia','🇨🇴','GRUPO K',44),
('ENG','Inglaterra','🏴󠁧󠁢󠁥󠁮󠁧󠁿','GRUPO L',45),
('CRO','Croácia','🇭🇷','GRUPO L',46),
('GHA','Gana','🇬🇭','GRUPO L',47),
('PAN','Panamá','🇵🇦','GRUPO L',48);

-- 20 stickers per selection (1..20), zero stock by default
INSERT INTO public.stickers (team_id, number, price_cents, stock)
SELECT t.id, n, CASE WHEN n = 1 THEN 200 ELSE 100 END, 0
FROM public.teams t, generate_series(1, 20) AS n
WHERE t.code <> 'FWC';

-- Ensure FWC keeps R$ 2,00
UPDATE public.stickers s SET price_cents = 200
FROM public.teams t WHERE s.team_id = t.id AND t.code = 'FWC';
