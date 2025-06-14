export async function logTransaction(data) {
  try {
    console.log('📝 Transaction Log:', JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('❌ Logging failed:', err);
  }
}
