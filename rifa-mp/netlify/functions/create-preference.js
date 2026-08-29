const admin = require('firebase-admin');
const { MercadoPagoConfig, Preference } = require('mercadopago');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_B64, 'base64').toString('utf8'))
    )
  });
}
const db = admin.firestore();

const PRICE = 10;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const { name, phone, numbers } = JSON.parse(event.body || '{}');

    if (!name || !phone || !Array.isArray(numbers) || numbers.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Dados inválidos' }) };
    }

    const stateRef = db.collection('estado').doc('rifa');
    const entryRef = db.collection('entradas').doc();

    // Reserve the numbers atomically before creating the payment
    await db.runTransaction(async (tx) => {
      const stateSnap = await tx.get(stateRef);
      const already = stateSnap.exists ? (stateSnap.data().vendidos || []) : [];
      const conflict = numbers.filter((n) => already.includes(n));
      if (conflict.length > 0) {
        throw new Error('CONFLICT:' + conflict.join(','));
      }
      tx.set(stateRef, { vendidos: [...already, ...numbers] }, { merge: true });
      tx.set(entryRef, {
        name,
        phone,
        numbers,
        value: numbers.length * PRICE,
        status: 'pendente',
        timestamp: Date.now()
      });
    });

    const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
    const preference = new Preference(client);
    const siteUrl = process.env.SITE_URL;

    const result = await preference.create({
      body: {
        items: [
          {
            title: 'Rifa Chá de Casa Nova - número(s) ' + numbers.join(', '),
            quantity: 1,
            unit_price: numbers.length * PRICE,
            currency_id: 'BRL'
          }
        ],
        payer: { name },
        external_reference: entryRef.id,
        back_urls: {
          success: siteUrl + '/?pago=1',
          failure: siteUrl + '/?falhou=1',
          pending: siteUrl + '/?pendente=1'
        },
        auto_return: 'approved',
        notification_url: siteUrl + '/.netlify/functions/mp-webhook'
      }
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ init_point: result.init_point, entryId: entryRef.id })
    };
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
