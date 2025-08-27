import type { Env } from "../index";
import { nanoId } from "../utils/nanoId";
import { validateApiKey } from "../utils/validateApiKey";
import { enforceFormDataLimits } from "../utils/enforceFormDataLimits";

interface PreviewRequestBody {
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

export async function CreatePreview(
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
    if (
      !validateApiKey(
        request.headers.get("Authorization")?.split(" ")[1] || "",
        env
      )
    ) {
      console.info(
        `Token inválido - Request Token: ${
          request.headers.get("Authorization")?.split(" ")[1] || ""
        } - Env Token: ${env.WORKER_API_KEY}`
      );
      return new Response(JSON.stringify({ message: "Token inválido." }), {
        status: 401,
        headers: jsonHeader,
      });
    }

    let body: PreviewRequestBody;

    try {
      body = await request.json();
    } catch {
      console.error("[CreatePreview] Body malformado");
      return new Response(
        JSON.stringify({ message: "Corpo da requisição malformado." }),
        { status: 400, headers: jsonHeader }
      );
    }

    if (!isValidBody(body)) {
      console.error("[CreatePreview] Body inválido após validação");
      return new Response(
        JSON.stringify({ message: "Corpo da requisição malformado." }),
        { status: 400, headers: jsonHeader }
      );
    }

    const intentionId = nanoId(10, "PREVIEW-");
    const finalSiteUrl = `https://${env.SITE_DNS}/site/${intentionId}`;
    const createdAt = new Date().toISOString();

    try {
      const sqlIntention = `
        INSERT INTO intentions (intention_id, email, template_id, plan, price, final_url, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
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
        )
        .run();
    } catch (err) {
      console.error(
        `[CreatePreview] Erro ao inserir registro na tabela intentions:`,
        err
      );
      return new Response(
        JSON.stringify({ message: "Erro inesperado no servidor." }),
        { status: 500, headers: jsonHeader }
      );
    }

    try {
      const sanitizedFormData = enforceFormDataLimits(body.form_data || {}, body.productInfo.plan);

      const sqlModel = `
        INSERT INTO ${body.productInfo.template_id} (intention_id, email, form_data, created_at)
        VALUES (?, ?, ?, ?)
    `;
      await env.DB.prepare(sqlModel)
        .bind(
          intentionId,
          body.payer.email,
          JSON.stringify(sanitizedFormData),
          createdAt
        )
        .run();

      console.info(
        `[CreatePreview] saved form_data for ${intentionId} (plan=${body.productInfo.plan})`
      );
    } catch (err) {
      console.error(
        `[CreatePreview] Erro ao inserir registro na tabela ${body.productInfo.template_id}:`,
        err
      );
      return new Response(
        JSON.stringify({ message: "Erro inesperado no servidor." }),
        { status: 500, headers: jsonHeader }
      );
    }

    return new Response(
      JSON.stringify({
        id: intentionId,
        preview_url: finalSiteUrl,
      }),
      {
        headers: jsonHeader,
        status: 200,
      }
    );
  }  catch (err) {
    console.error("Erro interno:", err);
    return new Response(
      JSON.stringify({ message: "Erro inesperado no servidor." }),
      { status: 500, headers: jsonHeader }
    );
  }
}

function isValidBody(body: PreviewRequestBody): boolean {
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
