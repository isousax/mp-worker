import type { Env } from "../index";
import { nanoId } from "../util/nanoId";
import { planLabels } from "../util/planLabels";

interface PreferenceRequestBody {
    productInfo: {
        template_id: string;
        title: string;
        price: number;
        plan: string;
        currency_id: string;
        picture_url?: string;
    },
    payer: {
        email: string;
    }
    form_data: Record<string, any>;
}

export async function handleCreatePreference(request: Request, env: Env): Promise<Response> {
    const jsonHeader = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
    };
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

        if (!isValidBody(body)) {
            return new Response(
                JSON.stringify({ status: 400, message: "Corpo da requisição malformado." }),
                { status: 400, headers: jsonHeader }
            );
        }


        const intentionId = nanoId(10, 'P-');
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
        console.info("Criando preference:", JSON.stringify(preference, null, 2));

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

        const sqlIntention = `
        INSERT INTO intentions (intention_id, email, template_id, plan, price, preference_id, final_url, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        await env.DB.prepare(sqlIntention).bind(
            intentionId,
            body.payer.email,
            body.productInfo.template_id,
            body.productInfo.plan,
            body.productInfo.price,
            dataResponseMP.id,
            finalSiteUrl,
            createdAt
        ).run();

        const sqlModel = `
        INSERT INTO ${body.productInfo.template_id} (intention_id, email, form_data, created_at)
        VALUES (?, ?, ?, ?)
    `;
        await env.DB.prepare(sqlModel).bind(
            intentionId,
            body.payer.email,
            JSON.stringify(body.form_data),
            createdAt
        ).run();

        return new Response(JSON.stringify({ id: dataResponseMP.id, init_point: dataResponseMP.init_point }), {
            headers: jsonHeader,
            status: 200,
        });
    } catch (err) {
        console.error("Erro interno:", err);
        return new Response(
            JSON.stringify({ status: 500, message: "Erro inesperado no servidor." }),
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
    return typeof str === 'string' && str.trim().length > 0;
}