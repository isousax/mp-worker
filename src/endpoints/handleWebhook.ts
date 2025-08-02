import type { Env } from "../index";
import { moveAndUpdateImages } from "../service/imageManager";

interface WebhookBody {
  resource?: string;
  topic?: string;
  data?: {
    id: string;
  };
  type?: string;
}

interface PaymentData {
  status: string;
  external_reference: string;
}

export async function handleWebhook(request: Request, env: Env): Promise<Response> {
  const jsonHeader = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST",
    "Access-Control-Allow-Headers": "Content-Type"
  };

  let body: WebhookBody;
  try {
    body = await request.json();
  }
  catch {
    return new Response(JSON.stringify({ message: "JSON inválido" }), { status: 400, headers: jsonHeader });
  }

  if (body.type === "payment" && body.data?.id) {
    const paymentId = body.data.id;
    console.info("ID do pagamento recebido:", paymentId);

    const paymentRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`,
      },
    });

    if (!paymentRes.ok) {
      const errorText = await paymentRes.text();
      console.error("Erro ao buscar pagamento:", errorText);
      return new Response(JSON.stringify({ message: "Erro ao buscar pagamento", error: errorText }), {
        status: paymentRes.status,
        headers: jsonHeader,
      });
    }

    let paymentData: PaymentData;
    try {
      paymentData = await paymentRes.json() as PaymentData;
      console.info("Status do pagamento:", JSON.stringify(paymentData.status, null, 2));
    }
    catch (error) {
      return new Response(JSON.stringify({ message: "Resposta inválida do Mercado Pago" }), {
        status: 500,
        headers: jsonHeader,
      });
    }

    const { status, external_reference: intentionId } = paymentData;

    if (!intentionId) {
      return new Response(JSON.stringify({ message: "Referência externa ausente." }), { status: 400, headers: jsonHeader });
    }

    const intentionRecord = await env.DB.prepare(`
      SELECT payment_id
      FROM intentions
      WHERE intention_id = ?
    `).bind(intentionId).first();

    if (!intentionRecord) {
      return new Response(JSON.stringify({ message: "Intenção não encontrada." }), { status: 404, headers: jsonHeader });
    }

    if (!intentionRecord.payment_id) {
      await env.DB.prepare(`
        UPDATE intentions
        SET payment_id = ?
        WHERE intention_id = ?
      `).bind(paymentId, intentionId).run();

      console.info(`Payment ID atualizado para intenção ${intentionId}`);
    }

    if (status !== "approved") {
      return new Response(JSON.stringify({ message: "Pagamento não aprovado." }), {
        status: 200,
        headers: jsonHeader,
      });
    }

    await env.DB.prepare(`
      UPDATE intentions
      SET status = 'approved', updated_at = datetime('now')
      WHERE intention_id = ?
    `).bind(intentionId).run();

    try {
      const report = await moveAndUpdateImages(env, intentionId);
      console.info(`Relatório de movimentação de imagens para intenção ${intentionId}:`, JSON.stringify(report, null, 2));
    } catch (err) {
      console.error("Erro ao movimentar imagens ou atualização do banco:", err);
      return new Response(JSON.stringify({ message: "Erro interno no processamento pós-pagamento." }), {
        status: 500,
        headers: jsonHeader,
      });
    }

    console.info(`Pagamento aprovado e imagens movidas para intenção ${intentionId}`);

    return new Response(JSON.stringify({ message: "Pagamento aprovado e processado com sucesso." }), {
      status: 200,
      headers: jsonHeader,
    });
  } else {
    console.warn(`Webhook ignorado. type="${body.type}", topic="${body.topic}", id=${body.data?.id}`);
    return new Response(JSON.stringify({ message: "OK" }), { status: 200, headers: jsonHeader });
  }
}
