import type { Env } from "../index";

interface WebhookBody {
  data: {
    id: string;
  };
}

interface PaymentData {
  status: string;
  external_reference: string;
}

export async function handleWebhook(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as WebhookBody;

  const paymentId = body?.data?.id;
  if (!paymentId) {
    return new Response("Missing payment ID", { status: 400 });
  }

  const paymentRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
  });

  if (!paymentRes.ok) {
    return new Response(await paymentRes.text(), { status: paymentRes.status });
  }

  const paymentData = await paymentRes.json() as PaymentData;

  if (paymentData.status !== "approved") {
    return new Response("Payment not approved", { status: 200 });
  }

  const intentionId = paymentData.external_reference;

  await env.DB.prepare(`
    UPDATE intentions
    SET status = 'approved'
    WHERE id = ?
  `).bind(
    intentionId
  ).run();

  return new Response("OK", { status: 200 });
}