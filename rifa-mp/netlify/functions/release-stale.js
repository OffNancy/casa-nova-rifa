const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_B64, 'base64').toString('utf8'))
    )
  });
}
const db = admin.firestore();

const ONE_HOUR = 60 * 60 * 1000;

const handler = async () => {
  const cutoff = Date.now() - ONE_HOUR;
  const snap = await db.collection('entradas').where('status', '==', 'pendente').get();
  const stateRef = db.collection('estado').doc('rifa');

  for (const docSnap of snap.docs) {
    const entry = docSnap.data();
    if (entry.timestamp > cutoff) continue;

    await db.runTransaction(async (tx) => {
      const entrySnap = await tx.get(docSnap.ref);
      if (!entrySnap.exists || entrySnap.data().status !== 'pendente') return;
      const stateSnap = await tx.get(stateRef);
      const already = stateSnap.exists ? (stateSnap.data().vendidos || []) : [];
      const freed = already.filter((n) => !entry.numbers.includes(n));
      tx.set(stateRef, { vendidos: freed }, { merge: true });
      tx.update(docSnap.ref, { status: 'expirado' });
    });
  }

  return { statusCode: 200, body: 'done' };
};

module.exports = { handler, config: { schedule: '@hourly' } };
