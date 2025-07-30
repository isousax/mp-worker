import type { Env } from "../index";

export async function ConsultIntention(request: Request, env: Env): Promise<Response> {
    try {
        const uri = new URL(request.url);

        if (uri.searchParams.has("email") && uri.searchParams.has("templateId")) {


            const sql = `
                SELECT email, template_id, intention_id, status, preference_id
                FROM intentions
                WHERE email = ? AND template_id = ? AND status != 'approved'
                ORDER BY created_at DESC
                LIMIT 10
                `;
            const result = await env.DB.prepare(sql)
                .bind(
                    uri.searchParams.get("email"),
                    uri.searchParams.get("templateId")
                )
                .all();

            if (!Array.isArray(result.results) || result.results.length === 0) {
                return new Response(
                    null,
                    { status: 204 }
                );
            }

            const filteredResults = result.results.map(({ intention_id, status, preference_id }) => ({
                intention_id,
                status,preference_id
            }));
            return new Response(JSON.stringify(filteredResults), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
        }

        return new Response(
            JSON.stringify({ status: 400, message: "Parametros da requisição malformados." }),
            { status: 400, headers: { "Content-Type": "application/json" } }
        );
    }
    catch (err) {
        console.error("Erro interno:", err);
        return new Response(
            JSON.stringify({ status: 500, message: "Erro inesperado no servidor." }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }

}