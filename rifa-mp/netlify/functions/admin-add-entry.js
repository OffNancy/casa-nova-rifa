const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_B64, 'base64').toString('utf8'))
    )
  });
}
const db = admin.firestore();

const PRICE = 10;
const TOTAL_NUMBERS = 300;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const { adminKey, name, phone, numbers } = JSON.parse(event.body || '{}');

    if (adminKey !== process.env.ADMIN_KEY) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Senha de admin incorreta' }) };
    }

    if (!name || !phone || !Array.isArray(numbers) || numbers.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Dados inválidos' }) };
    }

    const cleanNumbers = [...new Set(numbers.map(Number))].filter(
      (n) => Number.isInteger(n) && n >= 0 && n < TOTAL_NUMBERS
    );
    if (cleanNumbers.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Nenhum número válido' }) };
    }

    const stateRef = db.collection('estado').doc('rifa');
    const entryRef = db.collection('entradas').doc();

    await db.runTransaction(async (tx) => {
      const stateSnap = await tx.get(stateRef);
      const already = stateSnap.exists ? stateSnap.data().vendidos || [] : [];
      const conflict = cleanNumbers.filter((n) => already.includes(n));
      if (conflict.length > 0) {
        throw new Error('CONFLICT:' + conflict.join(','));
      }
      tx.set(stateRef, { vendidos: [...already, ...cleanNumbers] }, { merge: true });
      tx.set(entryRef, {
        name,
        phone,
        numbers: cleanNumbers,
        value: cleanNumbers.length * PRICE,
        status: 'pago',
        paymentId: 'manual-pix',
        timestamp: Date.now()
      });
    });

    return { statusCode: 200, body: JSON.stringify({ ok: true, entryId: entryRef.id, numbers: cleanNumbers }) };
  } catch (e) {
    if (String(e.message).startsWith('CONFLICT:')) {
      return {
        statusCode: 409,
        body: JSON.stringify({ error: 'conflict', numbers: e.message.replace('CONFLICT:', '').split(',') })
      };
    }
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
