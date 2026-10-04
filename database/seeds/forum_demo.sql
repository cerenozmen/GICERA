-- GICERA - Tartışma için DEMO içerik (isteğe bağlı, sunum/test için).
-- Bu kullanıcılar gerçek değil. Canlı toplulukta çalıştırma; çalıştırdıysan silmek için:
--   delete from forum_posts where device_id = 'demo-seed';
-- (Yanıtlar ve beğeniler cascade ile birlikte silinir.)

with p as (
  insert into forum_posts (device_id, author_name, title, body, category, created_at) values
    ('demo-seed', 'zeynep.k', 'Karma ciltler için nemlendirici önerisi',
     'T bölgem yağlı, yanaklarım kuru. Günlük kullanım için hafif bir nemlendirici arıyorum. Önerileriniz neler? Mümkünse parfümsüz olsun.',
     'Ürün önerisi', now() - interval '2 hours'),
    ('demo-seed', 'elifd', 'C vitamini sabah mı akşam mı?',
     'C vitamini serumunu rutinin hangi adımında kullanıyorsunuz? Sabah kullanınca güneş koruyucu yeterli olur mu?',
     'İçerikler', now() - interval '5 hours'),
    ('demo-seed', 'melis.s', 'Retinol kullanmaya başlıyorum, nelere dikkat etmeliyim?',
     'İlk kez retinol kullanacağım. Cildim hassas sayılır. Hangi sıklıkla başlamalıyım?',
     'Rutin', now() - interval '26 hours'),
    ('demo-seed', 'aysenur', 'Güneş kremi önerisi',
     'Günlük kullanım için hafif yapılı, beyaz iz bırakmayan güneş kremi arıyorum. Karma ciltliyim, hassas ciltlere uygun olursa sevinirim.',
     'Ürün önerisi', now() - interval '28 hours')
  returning id, title
)
insert into forum_replies (post_id, device_id, author_name, text, created_at)
select p.id, 'demo-seed', r.author_name, r.text, now() - r.age
from p
join (values
  ('Karma ciltler için nemlendirici önerisi', 'dermakizi', 'Ben de karma ciltliyim, CeraVe''nin nemlendiricisini kullanıyorum. Hem hafif hem de gün boyu yeterli nem sağlıyor. Parfümsüz olması da güzel.', interval '1 hour'),
  ('Karma ciltler için nemlendirici önerisi', 'ciltseyahati', 'La Roche-Posay Toleriane serisi karma ciltler için çok uygun. Özellikle Fluid nemlendiricisi tam senin aradığın gibi olabilir.', interval '90 minutes'),
  ('Karma ciltler için nemlendirici önerisi', 'ayse.n', 'Bioderma Sébium Hydra da güzel bir seçenek. Yağlı bölgeleri dengeleyip kuru bölgeleri nemlendiriyor.', interval '100 minutes'),
  ('Karma ciltler için nemlendirici önerisi', 'eceg', 'Ben son dönemde The Ordinary Natural Moisturizing Factors + HA kullanıyorum, çok memnunum. Cildimi yormadı ve hafif.', interval '110 minutes'),
  ('C vitamini sabah mı akşam mı?', 'dermakizi', 'Sabah, temizlikten sonra ve nemlendiriciden önce kullanıyorum. Üstüne mutlaka güneş koruyucu sürüyorum.', interval '4 hours')
) as r(title, author_name, text, age) on r.title = p.title;
