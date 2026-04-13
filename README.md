# <img src="https://raw.githubusercontent.com/MonyCoin/meco_wallet/refs/heads/main/assets/icon.png" width="30" height="30" style="vertical-align: middle;"> MECO Wallet

<div align="center">
  
  [![Version](https://img.shields.io/badge/version-1.11.0-blue.svg)](https://github.com/MonyCoin/meco_wallet/releases)
  [![License](https://img.shields.io/badge/license-0BSD-green.svg)](LICENSE)
  [![Platform](https://img.shields.io/badge/platform-Android-brightgreen.svg)](https://monycoin.github.io/meco_wallet-app/)
  [![Network](https://img.shields.io/badge/network-Solana-9945FF.svg)](https://solana.com)
  
</div>

**MECO Wallet** هو التطبيق الرسمي لإدارة واستخدام عملة **MonyCoin (MECO)**.  
وهو جزء أساسي من منظومة MECO اللامركزية المبنية على شبكة **Solana**.

يهدف التطبيق إلى توفير تجربة استخدام بسيطة، آمنة، وسريعة لإدارة الأصول الرقمية، مع دعم مباشر لإرسال واستقبال العملات، التبادل الفوري (Swap)، والربط الآمن مع تطبيقات الـ Web3 اللامركزية.

---

## 🚀 **ما الجديد في الإصدار 1.11.0 (إطلاق ميزة التبادل الكامل)**

### 🔄 **التبادل اللامركزي (Swap) – جاهز للإنتاج**
- **تكامل رسمي مع Jupiter API v6:** استخدام مفتاح API رسمي لضمان أعلى استقرار وموثوقية.
- **دعم 16 عملة رقمية:** تبادل SOL, USDC, USDT, MECO وجميع العملات المدعومة.
- **رسوم خدمة متكاملة:** تحصيل `0.0005 SOL` كرسم خدمة لصالح خزينة المشروع، تضاف تلقائياً إلى معاملة التبادل (شفافية كاملة).
- **آلية إعادة محاولة ذكية:** تجاوز مشاكل انتهاء صلاحية الكتلة (`block height exceeded`) وتجديد تلقائي لضمان نجاح المعاملة.

### 🌍 **WalletConnect v2 – تحديثات الاستقرار**
- تحسين معالجة الروابط العميقة `meco-wallet://wc`.
- إدارة جلسات محسّنة للتطبيقات المتصلة.

### 📊 **سجل معاملات متقدم (Advanced History)**
- تحليل دقيق للمعاملات الواردة والصادرة.
- فلاتر سريعة وإحصائيات أفقية للرسوم وحجم التداول.

### 🔐 **الأمان والتخصيص**
- مصادقة بيومترية (بصمة/وجه) لحماية المحفظة وعبارة الاسترداد.
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
| 🔄 التبادل الداخلي (Swap) | ✅ | **(مكتمل 1.11.0)** مدعوم عبر Jupiter API مع مفتاح رسمي |
| 🌐 WalletConnect (Web3) | ✅ | اتصال آمن بـ DApps |
| 📱 سجل معاملات ذكي | ✅ | تحليل دقيق للصادر والوارد |
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

**WalletConnect Verification:** 
This repository and the `MonyCoin` organization are officially owned by Mohamed Saadeh.
- **Founder Email:** saadeh7380@gmail.com
- **Official Submission Email:** mecowallet@gmail.com
- **WalletConnect Project ID:** [21dc279d9fb09e92a14421d4a189efec]

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

**الإصدار الحالي:** `v1.11.0`  
**تاريخ التحديث:** أبريل 2026  

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
