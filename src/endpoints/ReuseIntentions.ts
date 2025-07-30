import type { Env } from "../index";
import { planLabels } from "../util/planLabels";

interface PreferenceRequestBody {
    intention_id: string;
}
interface intencionInfo {
    template_id: string;
    price: number;
    email: string;
    plan: string;
}

export async function ReuseIntentions(request: Request, env: Env): Promise<Response> {
    const jsonHeader = { "Content-Type": "application/json" };
    try {
        let body: PreferenceRequestBody;

        try {
            body = await request.json();
        } catch {
            return new Response(
                JSON.stringify({ status: 400, message: "Corpo da requisição malformado." }),
                { status: 400, headers: jsonHeader }
            );
        }

        if (!isNonEmpty(body.intention_id)) {
            return new Response(
                JSON.stringify({ status: 400, message: "Corpo da requisição malformado." }),
                { status: 400, headers: jsonHeader }
            );
        }

        const updatedAt = new Date().toISOString();
        const intentionId = body.intention_id;
        let existingIntention: intencionInfo | null;

        existingIntention = await obatinIntentionIdIndDb(env, intentionId);

        if (!existingIntention) {
            return new Response(
                JSON.stringify({ status: 404, message: "Intenção de pagamento não encontrada." }),
                { status: 404, headers: jsonHeader }
            );
        }

        const preference = {
            items: [
                {
                    id: existingIntention.template_id,
                    title: planLabels(existingIntention.plan),
                    quantity: 1,
                    unit_price: existingIntention.price
                },
            ],
            payer: {
                email: existingIntention.email,
            },
            back_urls: {
                success: `https://${env.SITE_DNS}/models/${existingIntention.template_id}/sucesso`,
                failure: `https://${env.SITE_DNS}/models/${existingIntention.template_id}/falha`,
                pending: `https://${env.SITE_DNS}/models/${existingIntention.template_id}/pendente`,
            },
            auto_return: "approved",
            external_reference: intentionId,
        };

        const responseMP = await fetch("https://api.mercadopago.com/checkout/preferences", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(preference),
        });

        if (!responseMP.ok) {
            const errorText = await responseMP.text();
            return new Response(
                JSON.stringify({ status: responseMP.status, message: `Erro na criação da preference: ${errorText}` }),
                { status: responseMP.status, headers: jsonHeader });
        }

        const dataResponseMP = await responseMP.json() as { id: string; init_point: string };

        await updatePreferenceId(env, dataResponseMP.id, intentionId, updatedAt)

        return new Response(JSON.stringify({ id: dataResponseMP.id, init_point: dataResponseMP.init_point }), {
            headers: jsonHeader,
            status: 200,
        });
    } catch (err) {
        console.log("Erro interno:", err);
        console.error("Erro interno:", err);
        return new Response(
            JSON.stringify({ status: 500, message: "Erro inesperado no servidor." }),
            { status: 500, headers: jsonHeader }
        );
    }
}

function isNonEmpty(str: string | undefined): boolean {
    return typeof str === 'string' && str.trim().length > 0;
}

function obatinIntentionIdIndDb(env: Env, intentionId: string): Promise<intencionInfo | null> {
    const sql = `
        SELECT template_id, price, email, plan
        FROM intentions 
        WHERE intention_id = ?
    `;
    return env.DB.prepare(sql)
        .bind(intentionId)
        .first<intencionInfo>()
        .then(row => row ? row : null);
}

function updatePreferenceId(env: Env, preferenceId: string, intentionId: string, updatedAt: string): Promise<void> {
    const sql = `
        UPDATE intentions 
        SET preference_id = ?, updated_at =?
        WHERE intention_id = ?
    `;
    return env.DB.prepare(sql)
        .bind(preferenceId, updatedAt, intentionId)
        .run()
        .then(() => {});
}