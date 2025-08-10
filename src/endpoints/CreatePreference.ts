import type { Env } from "../index";
import { nanoId } from "../utils/nanoId";
import { planLabels } from "../utils/planLabels";
import { generateQrCode } from "../service/generateQrCode";

interface PreferenceRequestBody {
  productInfo: {
    template_id: string;
    title: string;
    price: number;
    plan: string;
    currency_id: string;
    picture_url?: string;
  };
  payer: {
    email: string;
  };
  form_data: Record<string, any>;
}

export async function CreatePreference(
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
    let body: PreferenceRequestBody;

    try {
      body = await request.json();
    } catch {
      console.error("[CreatePreference] Body malformado");
      return new Response(
        JSON.stringify({ message: "Corpo da requisição malformado." }),
        { status: 400, headers: jsonHeader }
      );
    }

    if (!isValidBody(body)) {
      console.error("[CreatePreference] Body inválido após validação");
      return new Response(
        JSON.stringify({ message: "Corpo da requisição malformado." }),
        { status: 400, headers: jsonHeader }
      );
    }

    const intentionId = nanoId(10, env.PREFIX_ID);
    const finalSiteUrl = `https://${env.SITE_DNS}/site/${intentionId}`;
    const createdAt = new Date().toISOString();

    const preference = {
      items: [
        {
          id: body.productInfo.template_id,
          title: planLabels(body.productInfo.plan),
          quantity: 1,
          unit_price: body.productInfo.price,
          currency_id: body.productInfo.currency_id,
          picture_url: body.productInfo.picture_url,
          category_id: "virtual_goods",
          description: "Site dedicatório",
          statement_descriptor: "DEDICART",
        },
      ],
      payer: {
        email: body.payer.email,
      },
      back_urls: {
        success: `https://${env.SITE_DNS}/checkout/${body.productInfo.template_id}/status`,
        failure: `https://${env.SITE_DNS}/checkout/${body.productInfo.template_id}/failure`,
        pending: `https://${env.SITE_DNS}/checkout/${body.productInfo.template_id}/status`,
      },
      notification_url: `${env.MP_WEBHOOK_URL}`,
      auto_return: "approved",
      external_reference: intentionId,
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
        `[CreatePreference] Erro ao criar preferencia de pagamento:`,
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

    let qrCodeUrl: string | null;
    if (body.productInfo.plan === "premium") {
      try {
        qrCodeUrl = await generateQrCode(finalSiteUrl, intentionId, env);
      } catch (err) {
        console.error("[CreatePreference] Erro ao gerar QR code:", err);
      }
    }

    try {
      const sqlIntention = `
        INSERT INTO intentions (intention_id, email, template_id, plan, price, final_url, created_at, qr_code)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;
      await env.DB.prepare(sqlIntention)
        .bind(
          intentionId,
          body.payer.email,
          body.productInfo.template_id,
          body.productInfo.plan,
          body.productInfo.price,
          finalSiteUrl,
          createdAt,
          qrCodeUrl
        )
        .run();
    } catch (err) {
      console.error(
        `[CreatePreference] Erro ao inserir registro na tabela intentions:`,
        err
      );
      return new Response(
        JSON.stringify({ message: "Erro inesperado no servidor." }),
        { status: 500, headers: jsonHeader }
      );
    }

    try {
      const sqlModel = `
        INSERT INTO ${body.productInfo.template_id} (intention_id, email, form_data, created_at)
        VALUES (?, ?, ?, ?)
    `;
      await env.DB.prepare(sqlModel)
        .bind(
          intentionId,
          body.payer.email,
          JSON.stringify(body.form_data),
          createdAt
        )
        .run();
    } catch (err) {
      console.error(
        `[CreatePreference] Erro ao inserir registro na tabela ${body.productInfo.template_id}:`,
        err
      );
      return new Response(
        JSON.stringify({ message: "Erro inesperado no servidor." }),
        { status: 500, headers: jsonHeader }
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

function isValidBody(body: PreferenceRequestBody): boolean {
  const product = body.productInfo;
  const payer = body.payer;
  return !!(
    isValidEmail(payer.email) &&
    isValidTemplate(product.template_id) &&
    isNonEmpty(product.plan) &&
    isNonEmpty(product.title) &&
    isNonEmpty(product.currency_id) &&
    typeof product.price === "number"
  );
}
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function isValidTemplate(templateId: string): boolean {
  return /^[a-z_]+$/.test(templateId);
}
function isNonEmpty(str: string | undefined): boolean {
  return typeof str === "string" && str.trim().length > 0;
}
