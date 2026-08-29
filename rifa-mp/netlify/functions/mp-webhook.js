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
  try {
    const params = event.queryStringParameters || {};
    let paymentId = params['data.id'] || params.id;
    let topic = params.type || params.topic;

    if (event.body) {
      try {
        const body = JSON.parse(event.body);
        if (body.data && body.data.id) paymentId = body.data.id;
        if (body.type) topic = body.type;
      } catch (e) {
        // ignore malformed body, query params may already have what we need
      }
    }

    if (topic !== 'payment' || !paymentId) {
      return { statusCode: 200, body: 'ignored' };
    }

    const resp = await fetch('https://api.mercadopago.com/v1/payments/' + paymentId, {
      headers: { Authorization: 'Bearer ' + process.env.MP_ACCESS_TOKEN }
    });
    const payment = await resp.json();
    const entryId = payment.external_reference;
    const status = payment.status; // approved, rejected, cancelled, refunded, pending, in_process

    if (!entryId) return { statusCode: 200, body: 'no reference' };

    const entryRef = db.collection('entradas').doc(entryId);
    const stateRef = db.collection('estado').doc('rifa');

    if (status === 'approved') {
      await entryRef.update({ status: 'pago', paymentId: String(paymentId) });
    } else if (['rejected', 'cancelled', 'refunded'].includes(status)) {
      await db.runTransaction(async (tx) => {
        const entrySnap = await tx.get(entryRef);
        if (!entrySnap.exists) return;
        const entry = entrySnap.data();
        if (entry.status === 'pago') return; // never undo a completed payment
        const stateSnap = await tx.get(stateRef);
        const already = stateSnap.exists ? (stateSnap.data().vendidos || []) : [];
        const freed = already.filter((n) => !entry.numbers.includes(n));
        tx.set(stateRef, { vendidos: freed }, { merge: true });
        tx.update(entryRef, { status: 'cancelado', paymentId: String(paymentId) });
      });
    } else {
      await entryRef.update({ status: 'pendente', paymentId: String(paymentId) });
    }

    return { statusCode: 200, body: 'ok' };
  } catch (e) {
    return { statusCode: 500, body: e.message };
  }
};
