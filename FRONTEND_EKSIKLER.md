# Frontend Eksiklikleri (Backend'e Göre)

## ✅ Mevcut Özellikler
- Session yönetimi (oluştur, sil, durum kontrolü)
- Chat listesi görüntüleme
- Contact listesi görüntüleme
- Mesaj listesi görüntüleme
- Text mesaj gönderme
- Profil resmi görüntüleme
- WebSocket ile real-time güncellemeler

## ❌ Eksik Özellikler

### 1. Mesaj İşlemleri
- [ ] Mesaj yanıtla (reply)
- [ ] Mesaj ilet (forward)
- [ ] Mesaj düzenle (edit)
- [ ] Mesaj sil (delete)
- [ ] Mesaj yıldızla/yıldızı kaldır (star)
- [ ] Mesajları okundu olarak işaretle (mark as read)

### 2. Reaksiyonlar
- [ ] Mesaja reaksiyon gönder (emoji)
- [ ] Reaksiyonu kaldır

### 3. Typing & Presence
- [ ] Yazıyor göstergesi (typing indicator)
- [ ] Yazmayı durdur
- [ ] Durum güncelle (available, unavailable, composing, recording)

### 4. Grup Yönetimi
- [ ] Grup oluştur
- [ ] Grup listesi görüntüle
- [ ] Grup detayları görüntüle
- [ ] Grup üyelerini yönet (ekle, çıkar, yönetici yap)
- [ ] Grup ayarlarını güncelle (restrict, announce)
- [ ] Grup davet linki al/sıfırla
- [ ] Grup açıklamasını güncelle
- [ ] Grup adını güncelle
- [ ] Grup fotoğrafını güncelle

### 5. Chat Yönetimi
- [ ] Sohbeti arşivle/kaldır
- [ ] Sohbeti sabitle/kaldır (pin)
- [ ] Sohbeti sessize al/kaldır (mute)

### 6. Mesaj Arama
- [ ] Mesaj ara (search)
- [ ] Tarih aralığına göre filtrele

### 7. Medya & Dosya
- [ ] Fotoğraf gönder
- [ ] Video gönder
- [ ] Ses gönder
- [ ] Dosya gönder
- [ ] Sticker gönder
- [ ] Medya indir

### 8. Özel Mesaj Tipleri
- [ ] Konum gönder
- [ ] Kişi kartı gönder (contact card)
- [ ] Anket oluştur (poll)

### 9. Toplu İşlemler
- [ ] Toplu mesaj gönder (bulk messages)

### 10. Contact Yönetimi
- [ ] Kişiyi engelle/engeli kaldır
- [ ] Engellenen numaraları listele
- [ ] Contact'ları yenile (refresh)

### 11. Diğer
- [ ] Chat senkronizasyonu (sync)
- [ ] Numara kontrolü (check number)
- [ ] Grup metadata görüntüleme

## Öncelik Sırası

### Yüksek Öncelik
1. Mesaj yanıtla (reply) - Temel özellik
2. Mesaj sil (delete) - Temel özellik
3. Mesajları okundu olarak işaretle - Temel özellik
4. Medya gönderme (fotoğraf, video) - Çok kullanılan özellik
5. Chat yönetimi (arşivle, pin, mute) - Temel özellik

### Orta Öncelik
6. Mesaj ilet (forward) - Sık kullanılan
7. Mesaj düzenle (edit) - Sık kullanılan
8. Reaksiyonlar - Popüler özellik
9. Grup yönetimi - Grup kullanıcıları için önemli
10. Mesaj arama - Kullanışlı özellik

### Düşük Öncelik
11. Typing indicator - Nice to have
12. Presence - Nice to have
13. Anket oluştur - Az kullanılan
14. Toplu mesaj - Özel kullanım
15. Contact engelleme - Az kullanılan

