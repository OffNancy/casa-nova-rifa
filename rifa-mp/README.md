# Rifa Chá de Casa Nova — integração Mercado Pago

## Variáveis de ambiente (configurar no Netlify, em Site settings > Environment variables)

- MP_ACCESS_TOKEN — Access Token de produção do Mercado Pago
- FIREBASE_SERVICE_ACCOUNT_B64 — o JSON da conta de serviço do Firebase, convertido para base64 (uma linha só)
- SITE_URL — a URL final do site, ex: https://rifa-meu-cha-casa-nova.netlify.app (sem barra no final)

## Estrutura
- public/index.html — a página da rifa
- public/preview.png — imagem de prévia pro link
- netlify/functions/create-preference.js — reserva os números e cria a cobrança no Mercado Pago
- netlify/functions/mp-webhook.js — recebe a confirmação de pagamento do Mercado Pago
- netlify/functions/release-stale.js — libera números de pagamentos que nunca foram concluídos (roda de hora em hora)

## Webhook no Mercado Pago
No painel do Mercado Pago, em Webhooks, cadastre a URL:
https://SEU-SITE.netlify.app/.netlify/functions/mp-webhook
Marque o evento "Pagamentos".
