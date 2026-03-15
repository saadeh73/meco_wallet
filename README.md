# <img src="https://raw.githubusercontent.com/MonyCoin/meco_wallet/refs/heads/main/assets/icon.png" width="30" height="30" style="vertical-align: middle;"> MECO Wallet

<div align="center">
  
  [![Version](https://img.shields.io/badge/version-1.5.0-blue.svg)](https://github.com/MonyCoin/meco_wallet/releases)
  [![License](https://img.shields.io/badge/license-0BSD-green.svg)](LICENSE)
  [![Platform](https://img.shields.io/badge/platform-Android-brightgreen.svg)](https://monycoin.github.io/meco_wallet-app/)
  [![Network](https://img.shields.io/badge/network-Solana-9945FF.svg)](https://solana.com)
  
</div>

**MECO Wallet** هو التطبيق الرسمي لإدارة واستخدام عملة **MonyCoin (MECO)**.  
وهو جزء أساسي من منظومة MECO اللامركزية المبنية على شبكة **Solana**.

يهدف التطبيق إلى توفير تجربة استخدام بسيطة، آمنة، وسريعة لإدارة الأصول الرقمية، مع دعم مباشر لإرسال واستقبال العملات، التبادل الفوري (Swap)، والربط الآمن مع تطبيقات الـ Web3 اللامركزية.

---

## 🚀 **ما الجديد في الإصدار 1.5.0 (تحديث Web3 الضخم)**

### 🌍 **دعم كامل لـ WalletConnect v2**
- **ربط سلس:** مسح باركود الـ DApps للاتصال الفوري والآمن بأي تطبيق لامركزي على شبكة Solana.
- **إدارة الجلسات:** نافذة مخصصة لعرض التطبيقات المتصلة وإمكانية قطع الاتصال بنقرة واحدة.
- **أيقونة ذكية:** زر تفاعلي في الواجهة الرئيسية يجمع بين الماسح الضوئي وإدارة جلسات الـ Web3.

### 🔄 **التبادل اللامركزي (Swap) المدمج**
- **تكامل مع Jupiter v6:** الحصول على أفضل أسعار الصرف لتبديل العملات (SOL, USDC, USDT, MECO) مباشرة من داخل المحفظة.
- **تجاوز القيود:** نظام اتصال ذكي يتجاوز حظر الشبكات لضمان تنفيذ الصفقات بسرعة وموثوقية في بيئة الإنتاج.

### 📊 **سجل معاملات متقدم (Advanced History)**
- **تحليل دقيق:** قراءة ذكية لبيانات البلوكتشين لتصنيف المعاملات إلى (مرسل ⬆️) و (مستلم ⬇️) بدقة متناهية.
- **فلاتر سريعة:** أزرار لتصفية السجل (الكل، مرسل، مستلم).
- **إحصائيات أفقية:** بطاقات إحصائية أنيقة تعرض حجم التداول والرسوم لكل عملة على حدة.

### 🔐 **ميزات الأمان والتخصيص (من 1.4.0)**
- عرض عبارة الاسترداد مع مصادقة بيومترية (بصمة/وجه).
- إضافة التوكنات المخصصة عبر عنوان العقد الذكي.
- دعم الوضع الليلي/الفاتح، واللغتين العربية والإنجليزية.

---

## 🏛️ **الانتماء المؤسسي**

🔹 **MonyCoin Digital Development Foundation**  
الواجهة العملية الرسمية (Client Application) لنظام MECO البيئي.

---

## 🔗 **المستودعات والروابط الرسمية**

| المكون | الرابط | الوصف |
| :--- | :--- | :--- |
| 🪙 **MECO Token** |[GitHub Repository](https://github.com/monycoin/meco-token) | المستودع الرئيسي للتوكنوميكس والعقود الذكية |
| 📱 **MECO Wallet** | [GitHub Repository](https://github.com/monycoin/meco_wallet) | هذا المستودع - الكود المصدري للتطبيق |
| ⬇️ **تحميل التطبيق** | [Official App Store](https://monycoin.github.io/meco_wallet-app/) | تنزيل أحدث إصدار (APK) |

---

## ✨ **الميزات وحالة التطوير**

| الميزة | الحالة | ملاحظات |
| :--- | :---: | :--- |
| 🔐 إنشاء واستيراد المحافظ | ✅ | بيئة لامركزية بالكامل (Non-custodial) |
| 💸 إرسال واستقبال رموز SPL | ✅ | دعم MECO ورموز Solana |
| 🔄 التبادل الداخلي (Swap) | ✅ | مدعوم عبر Jupiter API |
| 🌐 WalletConnect (Web3) | ✅ | **(مكتمل 1.5.0)** اتصال آمن بـ DApps |
| 📱 سجل معاملات ذكي | ✅ | **(مكتمل 1.5.0)** تحليل دقيق للصادر والوارد |
| 📊 شاشة السوق (Market) | ✅ | أسعار حقيقية عبر CoinGecko & Jupiter |
| 📸 ماسح QR ذكي | ✅ | يميز بين عناوين الإرسال وطلبات Web3 |
| 🪙 إضافة الرموز المخصصة | ✅ | جلب التوكنات يدوياً عبر العقد |
| 🌗 تخصيص الواجهة | ✅ | وضع ليلي/نهاري + دعم عربي/إنجليزي |
| ⚡ التخزين المؤقت (Staking) | 🔜 | مخطط في التحديثات القادمة |

---

## 🧱 **التقنيات المستخدمة (Tech Stack)**

- **React Native & Expo** (SDK 54)
- **Solana Web3.js** & **SPL-Token** (للتكامل مع البلوكتشين)
- **WalletConnect v2 Core** (لربط التطبيقات اللامركزية)
- **SecureStore & AsyncStorage** (للتخزين المحلي الآمن)
- **i18next** (للترجمة وتعدد اللغات)
- **Helius & Ankr RPCs** (لاتصالات الشبكة السريعة)

---

## 📡 **معلومات الشبكة (Network Info)**

- **Blockchain:** Solana
- **Network:** Mainnet-Beta
- **Token Mint (MECO):** `7hBNyFfwYTv65z3ZudMAyKBw3BLMKxyKXsr5xM51Za4i`
- **مستكشف Solscan:** [عرض عقد العملة](https://solscan.io/token/7hBNyFfwYTv65z3ZudMAyKBw3BLMKxyKXsr5xM51Za4i)

---

## 🔐 **الأمان والخصوصية (Security)**

- **المفاتيح الخاصة (Private Keys):** مشفرة ومخزنة محلياً باستخدام `expo-secure-store` ولا تغادر جهاز المستخدم أبداً.
- **المصادقة (Authentication):** دعم كامل للمصادقة البيومترية (بصمة الإصبع / Face ID) لحماية التطبيق وعبارة الاسترداد.
- **اللامركزية:** لا توجد خوادم وسيطة تمتلك صلاحية الوصول لأموالك.
- **الشفافية:** كود مفتوح المصدر (Open Source) لضمان أعلى معايير الثقة المجتمعية.

---

## 📥 **تحميل التطبيق**

<div align="center">

[![Download APK](https://img.shields.io/badge/📲_تحميل_تطبيق_ميكو-6C63FF?style=for-the-badge&logo=android&logoColor=white)](https://monycoin.github.io/meco_wallet-app/)

**الإصدار الحالي:** `v1.5.0`  
**تاريخ التحديث:** مارس 2026  

</div>

---

## 📬 **المجتمع والتواصل الرسمي**

<div align="center">
  
| المنصة | الرابط |
|:------:|:------:|
| ![X](https://img.shields.io/badge/X_Twitter-1DA1F2?style=flat-square&logo=x&logoColor=white) | [@MoniCoinMECO](https://x.com/MoniCoinMECO) |
| ![Telegram](https://img.shields.io/badge/Telegram-26A5E4?style=flat-square&logo=telegram&logoColor=white) | [@monycoin1](https://t.me/monycoin1) |
| ![Web](https://img.shields.io/badge/Website-6C63FF?style=flat-square&logo=google-chrome&logoColor=white) | [MonyCoin Blog](https://monycoin1.blogspot.com/) |
| ![Facebook](https://img.shields.io/badge/Facebook-1877F2?style=flat-square&logo=facebook&logoColor=white) |[MonyCoin Community](https://www.facebook.com/share/1ZUbCbssCU/) |

</div>

---

## 🤝 **المساهمة (Contributing)**

نرحب بمساهمات المطورين من كافة أنحاء العالم! يرجى قراءة [CONTRIBUTING.md](https://github.com/MonyCoin/meco-token/blob/main/CONTRIBUTING.md) للمزيد من التفاصيل حول كيفية المساعدة في تطوير المحفظة.

---

<div align="center">
  
**© 2026 — MECO Wallet**  
An Official Application of **MonyCoin Digital Development Foundation**  
Founder: **Mohamed Saadeh**

[![Stars](https://img.shields.io/github/stars/MonyCoin/meco_wallet?style=social)](https://github.com/MonyCoin/meco_wallet/stargazers)
[![Forks](https://img.shields.io/github/forks/MonyCoin/meco_wallet?style=social)](https://github.com/MonyCoin/meco_wallet/network/members)

</div>
