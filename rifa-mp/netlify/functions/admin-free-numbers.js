const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_B64, 'base64').toString('utf8'))
    )
  });
}
const db = admin.firestore();

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const { adminKey, numbers } = JSON.parse(event.body || '{}');

    if (adminKey !== process.env.ADMIN_KEY) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Senha de admin incorreta' }) };
    }

    if (!Array.isArray(numbers) || numbers.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Dados inválidos' }) };
    }

    const toRemove = new Set(numbers.map(Number).filter((n) => Number.isInteger(n)));
    const stateRef = db.collection('estado').doc('rifa');

    let removedCount = 0;
    await db.runTransaction(async (tx) => {
      const stateSnap = await tx.get(stateRef);
      const already = stateSnap.exists ? stateSnap.data().vendidos || [] : [];
      const remaining = already.filter((n) => !toRemove.has(n));
      removedCount = already.length - remaining.length;
      tx.set(stateRef, { vendidos: remaining }, { merge: true });
    });

    return { statusCode: 200, body: JSON.stringify({ ok: true, removedCount }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
