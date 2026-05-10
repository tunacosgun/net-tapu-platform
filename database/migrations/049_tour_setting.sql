-- ============================================================
-- TOUR / SİSTEM TANITICISI default settings
-- ============================================================
-- The frontend reads `tour_enabled` from public site-settings.
-- Admin can flip this from Admin → Ayarlar.

INSERT INTO admin.system_settings (key, value, description)
VALUES
  ('tour_enabled', 'true',
   'Sistem Tanıtıcısı: tüm site genelinde interaktif tour gösterilsin mi?'),
  ('tour_auto_start', 'true',
   'Yeni ziyaretçiler için tour otomatik başlasın mı? (kullanıcı bazlı localStorage flag ile dismiss edilebilir)')
ON CONFLICT (key) DO NOTHING;
