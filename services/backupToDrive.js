import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';

// دالة لرفع نسخة المفتاح إلى Google Drive
export async function uploadBackupToDrive(accessToken) {
  try {
    const encryptedKey = await AsyncStorage.getItem('wallet_private_key');

    if (!encryptedKey) {
      console.log('لا يوجد مفتاح لتخزينه');
      return;
    }

    // إنشاء ملف مؤقت في الجهاز
    const fileUri = FileSystem.documentDirectory + 'meco_backup.txt';
    await FileSystem.writeAsStringAsync(fileUri, encryptedKey, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    const fileInfo = await FileSystem.getInfoAsync(fileUri);
    const fileBase64 = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // رفع الملف إلى Google Drive
    const uploadResult = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'multipart/related; boundary=foo_bar_baz',
      },
      body: `--foo_bar_baz
Content-Type: application/json; charset=UTF-8

{
  "name": "meco_backup.txt"
}

--foo_bar_baz
Content-Type: text/plain

${atob(fileBase64)}
--foo_bar_baz--`,
    });

    const responseJson = await uploadResult.json();

    if (uploadResult.ok) {
      console.log('✅ تم رفع النسخة الاحتياطية بنجاح إلى Google Drive');
    } else {
      console.log('❌ فشل في الرفع:', responseJson);
    }
  } catch (error) {
    console.log('خطأ أثناء النسخ الاحتياطي:', error);
  }
}
export async function downloadBackupFromDrive(accessToken) {
  try {
    const metadataRes = await fetch(
      'https://www.googleapis.com/drive/v3/files?q=name="meco_backup.txt"&spaces=drive',
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    const metadata = await metadataRes.json();

    if (!metadata.files || metadata.files.length === 0) {
      console.log('❌ لا يوجد ملف meco_backup.txt في Google Drive');
      return null;
    }

    const fileId = metadata.files[0].id;

    const fileRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    const encryptedKey = await fileRes.text();
    return encryptedKey;
  } catch (error) {
    console.log('❌ خطأ أثناء تحميل النسخة الاحتياطية:', error);
    return null;
  }
}
