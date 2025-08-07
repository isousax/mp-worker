import type { Env } from "../index";
import { moveAndUpdateImages } from "../service/imageManager";
import { validateSignature } from "../utils/validateSignature";

interface WebhookBody {
  resource?: string;
  topic?: string;
  data?: { id: string };
  type?: string;
}

interface PaymentData {
  status: string;
  external_reference: string;
}

export async function handleWebhook(
  request: Request,
  env: Env
): Promise<Response> {
  const jsonHeader = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  const mpSecret = env.mpSecret;
  let body: WebhookBody;
  try {
    body = await request.json();
  } catch {
    console.error("[Webhook] Payload inválido:", await request.text());
    return new Response(JSON.stringify({ message: "JSON inválido" }), {
      status: 400,
      headers: jsonHeader,
    });
  }
  const operationType = new URL(request.url).searchParams.get("operation");

  // --- Validação da assinatura Mercado Pago ---
  if (!(await validateSignature(request, body, mpSecret))) {
    console.error("[Webhook] Assinatura Mercado Pago inválida!");
    return new Response(JSON.stringify({ message: "Token inválido" }), {
      status: 401,
      headers: jsonHeader,
    });
  }

  if (body.type !== "payment" || !body.data?.id) {
    console.info(
      `[Webhook] Ignorado. type=${body.type} topic=${body.topic} id=${body.data?.id}`
    );
    return new Response(JSON.stringify({ message: "OK" }), {
      status: 200,
      headers: jsonHeader,
    });
  }

  const paymentId = body.data.id;
  console.info(`[Webhook][${paymentId}] Início - operação=${operationType}`);

  let paymentData: PaymentData;
  try {
    const resp = await fetch(
      `https://api.mercadopago.com/v1/payments/${paymentId}`,
      {
        headers: { Authorization: `Bearer ${env.MP_ACCESS_TOKEN}` },
      }
    );
    if (!resp.ok) throw new Error(`MP status ${resp.status}`);
    paymentData = await resp.json();
    console.info(
      `[Webhook][${paymentId}] Pago MP status=${paymentData.status} ref=${paymentData.external_reference}`
    );
  } catch (err: any) {
    console.error(`[Webhook][${paymentId}] Erro fetch MP:`, err.message || err);
    return new Response(
      JSON.stringify({ message: "Erro ao buscar pagamento MP" }),
      { status: 502, headers: jsonHeader }
    );
  }

  const intentionId = paymentData.external_reference;
  if (!intentionId) {
    console.error(`[Webhook][${paymentId}] Falha: external_reference ausente`);
    return new Response(
      JSON.stringify({ message: "Referência externa ausente." }),
      { status: 400, headers: jsonHeader }
    );
  }

  const record = await env.DB.prepare(
    `SELECT payment_id, expires_in FROM intentions WHERE intention_id = ?`
  )
    .bind(intentionId)
    .first();

  if (!record) {
    console.error(`[Webhook][${intentionId}] Intenção não encontrada`);
    return new Response(
      JSON.stringify({ message: "Intenção não encontrada." }),
      { status: 404, headers: jsonHeader }
    );
  }

  // --- Adiciona payment_id à lista ---
  let paymentIdList = String(record.payment_id || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (!paymentIdList.includes(paymentId)) {
    paymentIdList.push(paymentId);
    const newPaymentIdStr = paymentIdList.join(",");
    await env.DB.prepare(
      `UPDATE intentions SET payment_id = ?, updated_at = datetime('now') WHERE intention_id = ?`
    )
      .bind(newPaymentIdStr, intentionId)
      .run();
    console.info(
      `[Webhook][${intentionId}] payment_id atualizado: ${newPaymentIdStr}`
    );
  }

  if (paymentData.status !== "approved") {
    console.info(
      `[Webhook][${intentionId}] Pagamento status=${paymentData.status} (não aprovado)`
    );
    return new Response(
      JSON.stringify({ message: "Pagamento não aprovado." }),
      { status: 200, headers: jsonHeader }
    );
  }

  // --- Fluxo de renovação ---
  if (operationType === "renewal") {
    try {
      console.info(`[Webhook][${intentionId}] Processando renewal`);
      if (!record.expires_in) {
        throw new Error("expires_in ausente");
      }

      const cur = new Date(record.expires_in as string);
      if (cur < new Date()) cur.setTime(Date.now());

      const next = new Date(cur);
      next.setFullYear(cur.getFullYear() + 1);

      await env.DB.prepare(
        `UPDATE intentions SET expires_in = ?, updated_at = datetime('now') WHERE intention_id = ?`
      )
        .bind(next.toISOString(), intentionId)
        .run();

      console.info(
        `[Webhook][${intentionId}] Renewal OK - nova expira=${next.toISOString()}`
      );
      return new Response(
        JSON.stringify({ message: "Renovação processada com sucesso." }),
        { status: 200, headers: jsonHeader }
      );
    } catch (err: any) {
      console.error(
        `[Webhook][${intentionId}] Erro no renewal:`,
        err.message || err
      );
      return new Response(
        JSON.stringify({ message: "Falha ao processar renewal." }),
        { status: 500, headers: jsonHeader }
      );
    }
  }

  // --- Fluxo de novo pagamento (approved) ---
  try {
    console.info(`[Webhook][${intentionId}] Processando novo payment`);

    const newExpiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    await env.DB.prepare(
      `UPDATE intentions
         SET status = 'approved',
             expires_in = ?,
             updated_at = datetime('now')
       WHERE intention_id = ?`
    )
      .bind(newExpiry.toISOString(), intentionId)
      .run();

    console.info(
      `[Webhook][${intentionId}] expires_in definido para ${newExpiry.toISOString()}`
    );

    const report = await moveAndUpdateImages(env, intentionId);
    console.info(`[Webhook][${intentionId}] moveImages OK:`, report);

    return new Response(
      JSON.stringify({ message: "Pagamento processado com sucesso." }),
      { status: 200, headers: jsonHeader }
    );
  } catch (err: any) {
    console.error(
      `[Webhook][${intentionId}] Erro no fluxo de pagamento:`,
      err.message || err
    );
    return new Response(
      JSON.stringify({ message: "Erro no processamento do pagamento." }),
      { status: 500, headers: jsonHeader }
    );
  }
}
