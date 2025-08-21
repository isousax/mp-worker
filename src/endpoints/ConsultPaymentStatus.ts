import type { Env } from "../index";
import { validateApiKey } from "../utils/validateApiKey";

export async function ConsultPaymentStatus(
  request: Request,
  env: Env
): Promise<Response> {
  const jsonHeader = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET",
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

    const uri = new URL(request.url);

    if (uri.searchParams.has("payment_id")) {
      const paymentId = uri.searchParams.get("payment_id");

      const sql = `
        SELECT status, final_url
        FROM intentions
        WHERE ',' || payment_id || ',' LIKE '%,' || ? || ',%'
      `;

      const intention = await env.DB.prepare(sql).bind(paymentId).first();

      if (!intention) {
        console.info("Pagamento não encontrado.");
        return new Response(
          JSON.stringify({ message: "Pagamento não encontrado." }),
          { status: 404, headers: jsonHeader }
        );
      }

      const headers = new Headers();
      headers.set("Content-Type", "application/json");
      headers.set("Cache-Control", "public, max-age=3600");
      headers.set("Access-Control-Allow-Origin", "*");
      headers.set("Access-Control-Allow-Methods", "GET");
      headers.set("Access-Control-Allow-Headers", "Content-Type");

      console.info("Status do pagamento: ", intention.status);
      if (intention.status === "approved") {
        return new Response(
          JSON.stringify({
            status: intention.status,
            final_url: intention.final_url,
          }),
          { status: 200, headers: headers }
        );
      }
      return new Response(JSON.stringify({ status: intention.status }), {
        status: 200,
        headers: jsonHeader,
      });
    } else {
      return new Response(
        JSON.stringify({ message: "Parâmetros da requisição malformados." }),
        { status: 400, headers: jsonHeader }
      );
    }
  } catch (err) {
    console.error("Erro interno:", err);
    return new Response(
      JSON.stringify({ message: "Erro inesperado no servidor." }),
      { status: 500, headers: jsonHeader }
    );
  }
}
