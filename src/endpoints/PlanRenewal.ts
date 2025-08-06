import type { Env } from "../index";
import { planLabels } from "../util/planLabels";

interface RenovationRequestBody {
  intentionId: string;
}

interface IntentionRow {
  email: string;
  template_id: string;
  plan: string;
  price: number;
  expires_in: string;
}

export async function PlanRenewal(
  request: Request,
  env: Env
): Promise<Response> {
  const jsonHeader = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  try {
    let body: RenovationRequestBody;

    try {
      body = await request.json();
    } catch {
      return new Response(
        JSON.stringify({ message: "Corpo da requisição malformado." }),
        { status: 400, headers: jsonHeader }
      );
    }

    const sqlIntention = `
        SELECT email, template_id, plan, price
        FROM intentions
        WHERE intention_id = ?
        `;
    const row = await env.DB.prepare(sqlIntention)
      .bind(body.intentionId)
      .first<IntentionRow>();

    if (!row) {
      console.info("Intenção não encontrada.");
      return new Response(
        JSON.stringify({ message: "Intenção não encontrada." }),
        { status: 404, headers: jsonHeader }
      );
    }
    if (!row.template_id || !row.plan ||
        typeof row.price !== "number" || row.price <= 0
    ) {
      console.error("Dados incompletos/ausentes no banco.");
      return new Response(
        JSON.stringify({ message: "Dados incompletos/ausentes no banco." }),
        { status: 400, headers: jsonHeader }
      );
    }

    const preference = {
      items: [
        {
          id: row.template_id,
          title: planLabels(row.plan) + " - Renovação",
          quantity: 1,
          unit_price: row.price,
          currency_id: "BRL",
          picture_url: "https://www.dedicart.online/renovation.png",
          category_id: "virtual_goods",
          description: "Site dedicatório",
          statement_descriptor: "DEDICART",
        },
      ],
      payer: {
        email: row.email,
      },
      back_urls: {
        success: `https://${env.SITE_DNS}/checkout/${row.template_id}/status`,
        failure: `https://${env.SITE_DNS}/checkout/${row.template_id}/failure`,
        pending: `https://${env.SITE_DNS}/checkout/${row.template_id}/status`,
      },
      notification_url: `${env.MP_WEBHOOK_URL}?operation=renewal`,
      auto_return: "approved",
      external_reference: body.intentionId,
    };

    const responseMP = await fetch(
      "https://api.mercadopago.com/checkout/preferences",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(preference),
      }
    );

    if (!responseMP.ok) {
      const errorText = await responseMP.text();
      console.error(
        "Erro ao criar preferencia de pagamento:",
        responseMP.status,
        errorText
      );
      return new Response(
        JSON.stringify({
          status: responseMP.status,
          message: `Erro na criação da preferencia de pagamento.`,
        }),
        { status: responseMP.status, headers: jsonHeader }
      );
    }

    const dataResponseMP = (await responseMP.json()) as {
      id: string;
      init_point: string;
    };

    return new Response(
      JSON.stringify({
        id: dataResponseMP.id,
        init_point: dataResponseMP.init_point,
      }),
      {
        headers: jsonHeader,
        status: 200,
      }
    );
  } catch (err) {
    console.error("Erro interno:", err);
    return new Response(
      JSON.stringify({ message: "Erro inesperado no servidor." }),
      { status: 500, headers: jsonHeader }
    );
  }
}
