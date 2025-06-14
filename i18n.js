import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  ar: {
    translation: {
      welcome: 'مرحبًا بك في محفظة MECO',
      create_wallet: 'إنشاء محفظة',
      import_wallet: 'استيراد محفظة',
      balance: 'رصيد المحفظة',
      send: 'إرسال',
      receive: 'استلام',
      swap: 'مبادلة',
      settings: 'الإعدادات',
      error: "خطأ",
      success: "نجاح",
      fill_fields: "يرجى ملء جميع الحقول",
      sent: "تم الإرسال",
      to: "إلى",
      recipient_address: "عنوان المستلم",
      amount: "المبلغ",
      confirm_send: "تأكيد الإرسال",
      copied: "تم النسخ",
      wallet_address_copied: "تم نسخ عنوان المحفظة",
      copy_address: "نسخ العنوان",
      backup_phrase: "نسخة احتياطية للمفاتيح",

      // 🔧 إعدادات
      change_language: "تغيير اللغة",
      toggle_theme: "تبديل النمط",
      biometric: "المصادقة الحيوية",
      contact_support: "الاتصال بالدعم",
      logout: "تسجيل الخروج",

      // 🔄 شاشة المبادلة
      from: "من",
      to_currency: "إلى",
      enter_amount: "أدخل المبلغ",
      execute_swap: "تنفيذ المبادلة",
      same_currency_error: "لا يمكن التبديل لنفس العملة",
      swap_success: "تمت المبادلة بنجاح",
    },
  },
  en: {
    translation: {
      welcome: 'Welcome to MECO Wallet',
      create_wallet: 'Create Wallet',
      import_wallet: 'Import Wallet',
      balance: 'Wallet Balance',
      send: 'Send',
      receive: 'Receive',
      swap: 'Swap',
      settings: 'Settings',
      error: "Error",
      success: "Success",
      fill_fields: "Please fill all fields",
      sent: "Sent",
      to: "to",
      recipient_address: "Recipient Address",
      amount: "Amount",
      confirm_send: "Confirm Send",
      copied: "Copied",
      wallet_address_copied: "Wallet address copied",
      copy_address: "Copy Address",
      backup_phrase: "Backup Phrase",

      // ⚙️ Settings
      change_language: "Change Language",
      toggle_theme: "Toggle Theme",
      biometric: "Biometric Authentication",
      contact_support: "Contact Support",
      logout: "Logout",

      // 🔄 Swap Screen
      from: "From",
      to_currency: "To",
      enter_amount: "Enter Amount",
      execute_swap: "Execute Swap",
      same_currency_error: "Cannot swap to the same token",
      swap_success: "Swap completed successfully",
    },
  },
};

i18n.use(initReactI18next).init({
  compatibilityJSON: 'v3',
  resources,
  lng: 'ar',
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
