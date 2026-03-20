// ✅ استخدام واجهة REST API الخفيفة لفايربيس (بدون أي مكتبات ثقيلة تسبب أخطاء في Termux)

export async function saveUserPushToken(walletAddress, pushToken) {
  if (!walletAddress || !pushToken) return;

  // مُعرف مشروعك في فايربيس
  const PROJECT_ID = "meco-wallet-f48e5";
  
  // الرابط المباشر لقاعدة بيانات Firestore الخاصة بك
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${walletAddress}`;

  // البيانات التي سنرسلها
  const payload = {
    fields: {
      pushToken: { stringValue: pushToken },
      platform: { stringValue: 'expo' },
      lastUpdated: { timestampValue: new Date().toISOString() }
    }
  };

  try {
    const response = await fetch(url, {
      method: 'PATCH', // نستخدم PATCH لإنشاء المستند أو تحديثه إذا كان موجوداً
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      console.log('☁️ ✅ تم حفظ Push Token بنجاح عبر REST API للمحفظة:', walletAddress.slice(0, 8) + '...');
    } else {
      const errorText = await response.text();
      console.error('❌ خطأ من سيرفر Firebase:', errorText);
    }
  } catch (error) {
    console.error('❌ فشل الاتصال بقاعدة البيانات:', error.message);
  }
}
