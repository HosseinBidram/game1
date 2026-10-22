# NEXUS SQUAD — GitHub Pages Starter (فارسی)

این یک بازی نمونه‌ی آنلاین ۲ تا ۴ نفره است. برای گیت‌هاب، همه‌ی فایل‌های ZIP را در **ریشه‌ی مخزن** قرار بده:

- `index.html`
- `nexus-multiplayer.js` — ارتباط با Worker
- `nexus-squad.js` — منطق بازی نمونه
- `nexus-squad.css` — طراحی واکنش‌گرا
- `qrcode.js` — تولید QR محلی

## ۱) اول Worker سازگار را منتشر کن

از پوشه‌ی پروژه‌ی کامل Game Arena Nexus نسخه 1.1 یا جدیدتر:

```bash
npx wrangler deploy
```

Worker فعلی تو به‌طور پیش‌فرض `https://game-arena-nexus.gamearena-onlin.workers.dev` است. این آدرس در `index.html` داخل meta با نام `nexus-api-base` مشخص شده است. اگر Worker دیگری داری، مقدار آن را به URL واقعی Worker خودت تغییر بده.

## ۲) انتشار با GitHub Pages

1. در GitHub یک مخزن عمومی بساز، برای مثال `nexus-squad`.
2. این فایل‌ها را در ریشه‌ی مخزن Commit کن.
3. در **Settings → Pages**، انتشار از Branch را روی `main` و پوشه‌ی `/(root)` تنظیم کن.
4. پس از آماده‌شدن Pages، لینک شبیه این می‌شود:

   `https://USERNAME.github.io/nexus-squad/`

## ۳) اضافه‌کردن به Game Arena

وارد پنل مدیریت شو:

`https://game-arena-nexus.gamearena-onlin.workers.dev/control-room`

در فرم بازی جدید مقدارهای زیر را بگذار:

- نام: `NEXUS SQUAD`
- ایموجی: `✦`
- دسته‌بندی: اکشن
- حالت بازی: **چندنفره آنلاین از راه دور**
- ظرفیت اتاق: **۴ نفر**
- URL: لینک HTTPS واقعی GitHub Pages

بعد از افزودن، بازی در کاتالوگ نمایش داده می‌شود. برای اتاق جدید دکمه‌ی «ساخت اتاق» و برای دوستان «ورود با کد» استفاده می‌شود. QR هم لینک را همراه کد اتاق می‌سازد.

## قوانین بازی نمونه

- میزبان صندلی ۱ است و شبیه‌سازی مسابقه را اجرا می‌کند.
- مهمان‌ها ورودی حرکت و داش را به میزبان می‌فرستند؛ میزبان snapshot وضعیت بازی را به بقیه می‌فرستد.
- ۲ تا ۴ بازیکن هم‌زمان پشتیبانی می‌شود. هدف جمع‌کردن ۱۰ کریستال و دوری از موانع قرمز است.
- اگر میزبان خارج شود، مسابقه‌ی فعلی متوقف می‌شود؛ برای نمونه‌ی ساده، میزبان خودکار جایگزین نمی‌شود.

## ساخت بازی تازه با SDK

این فایل‌ها را کنار `index.html` نگه دار و در بازی جدید لود کن:

```html
<meta name="nexus-api-base" content="https://game-arena-nexus.gamearena-onlin.workers.dev">
<script src="./nexus-multiplayer.js"></script>
<script>
const mp = new NexusMultiplayer.Client({ gameId: 'new-game-id', maxPlayers: 4, playerName: 'Player' });
mp.on('welcome', info => console.log(info.seat, info.host));
mp.on('players', players => console.log(players));
mp.on('message', packet => {
  if (packet.event === 'input') { /* ورودی مهمان را پردازش کن */ }
  if (packet.event === 'state') { /* وضعیت میزبان را نمایش بده */ }
});
// میزبان: await mp.createRoom();
// مهمان: await mp.joinRoom({ roomId: new URLSearchParams(location.search).get('room') });
// همه: mp.send('state', { score: 1 });
// مهمان به میزبان: mp.send('input', { left: true }, { toSeat: 1 });
</script>
```

`gameId` هر بازی باید شناسه‌ای ثابت و یکتا باشد. `maxPlayers` فقط ۲، ۳ یا ۴ است. بعد از تغییر بازی، محتوای سایت را در GitHub Commit کن؛ برای تغییر کد Worker باید دوباره `npx wrangler deploy` انجام شود.

## اتصال و امنیت

- GitHub Pages با HTTPS به‌صورت پیش‌فرض توسط Worker مجاز است.
- اگر بازی را در دامنه‌ی HTTPS دیگری هاست می‌کنی، همان Origin را به `vars.ALLOWED_GAME_ORIGINS` در `wrangler.jsonc` اضافه و Worker را Deploy کن.
- WebSocket فقط از HTTPS/WSS استفاده می‌کند؛ اجرای محلی از `file://` برای اتصال واقعی پشتیبانی نمی‌شود.
- Worker رله‌ی پیام و تخصیص صندلی را کنترل می‌کند. این SDK به‌تنهایی ضدتقلبِ رقابتی یا پردازش سمت سرور برای قوانین خاص بازی را تضمین نمی‌کند.
