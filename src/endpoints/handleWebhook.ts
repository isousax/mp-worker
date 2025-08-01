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
  const jsonHeader = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };

  let paymentId: string | null = null;

  const url = new URL(request.url);
  paymentId = url.searchParams.get("id");

  if (!paymentId) {
    try {
      const body = await request.json() as WebhookBody;
      
      paymentId = body.data.id;

    } catch (err) {
      console.warn("Erro ao fazer parse do JSON do webhook:", err);
    }
  }

  if (!paymentId) {
    return new Response(JSON.stringify({ message: "ID do pagamento ausente" }), {
      status: 400,
      headers: jsonHeader,
    });
  }


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

  const paymentData = await paymentRes.json() as PaymentData;
  const { status, external_reference: intentionId } = paymentData;

  if (!intentionId) {
    return new Response(JSON.stringify({ message: "Referência externa ausente." }), { status: 400, headers: jsonHeader });
  }

  if (status !== "approved") {
    return new Response(JSON.stringify({ message: "Pagamento não aprovado." }), {
      status: 200,
      headers: jsonHeader,
    });
  }

  await env.DB.prepare(`
    UPDATE intentions
    SET status = 'approved'
    WHERE intention_id = ?
  `).bind(intentionId).run();

  const result = await env.DB.prepare(`
    SELECT template_id
    FROM intentions
    WHERE intention_id = ?
  `).bind(intentionId).first();

  if (!result.template_id) {
    return new Response(JSON.stringify({ message: "Intenção não encontrada." }), {
      status: 404,
      headers: jsonHeader,
    });
  }

  if (typeof result.template_id !== "string" || !/^[a-z_]+$/.test(result.template_id)) {
    return new Response(JSON.stringify({ message: "Nome de template inválido" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const templateTable = result.template_id;

  await env.DB.prepare(`
    UPDATE ${templateTable}
    SET status = 'approved'
    WHERE intention_id = ?
  `).bind(intentionId).run();

  return new Response(JSON.stringify({ message: "Pagamento aprovado." }), {
    status: 200,
    headers: jsonHeader,
  });
}