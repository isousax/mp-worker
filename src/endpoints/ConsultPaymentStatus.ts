import type { Env } from "../index";

export async function ConsultPaymentStatus(request: Request, env: Env): Promise<Response> {
  const jsonHeader = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET",
    "Access-Control-Allow-Headers": "Content-Type"
  };

  try {
    const uri = new URL(request.url);

    if (uri.searchParams.has("payment_id")) {
      const paymentId = uri.searchParams.get("payment_id");

      const sql = `
        SELECT status 
        FROM intentions 
        WHERE payment_id = ?
      `;

      const intention = await env.DB.prepare(sql).bind(paymentId).first();

      if (!intention) {
        console.info("Pagamento não encontrado.");
        return new Response(
          JSON.stringify({ message: "Pagamento não encontrado." }),
          { status: 404, headers: jsonHeader }
        );
      }

      console.info("Status do pagamento: ", intention.status);
      return new Response(
        JSON.stringify({ status: intention.status }),
        { status: 200, headers: jsonHeader }
      );
    }
    else {
      return new Response(
        JSON.stringify({ message: "Parâmetros da requisição malformados." }),
        { status: 400, headers: jsonHeader }
      );
    }
  }
  catch (err) {
    console.error("Erro interno:", err);
    return new Response(
      JSON.stringify({ message: "Erro inesperado no servidor." }),
      { status: 500, headers: jsonHeader }
    );
  }
}
