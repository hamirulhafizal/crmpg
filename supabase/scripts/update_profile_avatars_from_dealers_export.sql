-- Run AFTER migration 025_profiles_pgcode_phone_username_pbo.sql
-- Matches dealer export email → auth.users → public.profiles.

WITH dealers (email, avatar_url, pgcode, phone, username_pbo) AS (
  VALUES
    ('hamirul.dev@gmail.com', 'https://publicgoldofficial.com/storage/dealer/hamirulhafizal_1679581026.png', 'PG00104897', '60184644305', 'Hamirul Hafizal'),
    ('qifays_eel@yahoo.com', 'https://publicgoldofficial.com/storage/dealer/SyafiqRusli_1647339020.png', 'PG00099479', '601111494245', 'Kapt Syafiq'),
    ('hakimihussin22@gmail.com', 'https://publicgoldofficial.com/storage/dealer/HakimiHussin_1748405615.png', 'PG00690336', '60133107096', 'Hakimi Hussin'),
    ('mosazzadimahfoz92@gmail.com', 'https://publicgoldofficial.com/storage/dealer/mosazzadi_1711945792.png', 'PG00192201', '60106542856', 'Mos Azzadi'),
    ('syafiq_1395@yahoo.com', 'https://publicgoldofficial.com/storage/dealer/PG00135717_1690476109.png', 'PG00135717', '601116373948', 'Kapt Syafiq'),
    ('abdulaziznorzali@gmail.com', 'https://publicgoldofficial.com/storage/dealer/abdulaziznorzaliPG_1708264133.png', 'PG00126339', '60135857011', 'Kapt Aziz'),
    ('muazmahadzir23@gmail.com', 'https://publicgoldofficial.com/storage/dealer/drmuazmahadzir_1658207392.png', 'PG053005', '60135237532', 'Dr Muaz'),
    ('kkam210983@gmail.com', 'https://publicgoldofficial.com/storage/dealer/kam_1736045734.png', 'PG00227867', '60199558720', 'Kamilah'),
    ('amin.daling95@gmail.com', 'https://publicgoldofficial.com/storage/dealer/AminDaling_1652505516.png', 'PG00095451', '60182321262', 'Dr Amin'),
    ('izzatzaidin95@gmail.com', 'https://publicgoldofficial.com/storage/dealer/izzatzainuddin_1648005677.png', 'PG00106863', '60176576687', 'Tn Izzat'),
    ('noramirah3292@gmail.com', 'https://publicgoldofficial.com/storage/dealer/ariffamira_1730020441.png', 'PG01307494', '60177668942', 'Ariff Amira'),
    ('hajarmdsaid@gmail.com', 'https://publicgoldofficial.com/storage/dealer/hajar_1677405287.png', 'PG00182784', '60197722749', 'Hajar')
)
UPDATE public.profiles AS p
SET
  avatar_url = d.avatar_url,
  pgcode = d.pgcode,
  phone = d.phone,
  username_pbo = d.username_pbo,
  updated_at = NOW()
FROM dealers AS d
INNER JOIN auth.users AS u
  ON LOWER(TRIM(u.email::TEXT)) = LOWER(TRIM(d.email))
WHERE p.id = u.id;
