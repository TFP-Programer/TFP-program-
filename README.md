# TFP PROGRAMI – online sunucu

Retro terminal sohbet. Hesap sadece **Gmail doğrulama koduyla** açılır ve yalnızca bu sitede geçerlidir.

## Bilgisayarında dene
    npm install
    npm start          # http://localhost:3000
Gmail ayarı yoksa doğrulama kodu sunucu konsoluna yazılır (test modu).

## Gerçek Gmail kodu göndermek için
1. Sitenin kod yollayacağı bir Gmail hesabı seç (örn. tfpprogrami@gmail.com).
2. Google Hesabı > Güvenlik > 2 Adımlı Doğrulama'yı aç.
3. Google Hesabı > Güvenlik > "Uygulama şifreleri" ile 16 haneli şifre üret.
4. Ortam değişkenleri:
       GMAIL_USER=tfpprogrami@gmail.com
       GMAIL_APP_PASSWORD=xxxxxxxxxxxxxxxx

## İnternete açmak (örn. Render.com)
1. Klasörü GitHub'a yükle.
2. Render > New > Web Service > depoyu seç. Build: `npm install`, Start: `npm start`.
3. Environment kısmına GMAIL_USER ve GMAIL_APP_PASSWORD ekle.
4. Verilerin silinmemesi için kalıcı disk (Disk) ekle, DATA_DIR=/data yap.
5. Verilen https:// adresini herkese ver. İstersen kendi alan adını bağla.

## Güvenlik özeti
- Şifreler sunucuda scrypt ile özetlenir, kimseye gösterilmez.
- Kod: 6 hane, 10 dk geçerli, 5 hatalı denemede iptal; giriş/kod gönderme hız sınırlı.
- Sunucu: başkası adına mesaj, davet, varlık sinyali yazılmasını engeller.
- Bilinen sınır: oda yönetimi (ban, atma, sahiplik) hâlâ istemci tarafında kontrol edilir.
