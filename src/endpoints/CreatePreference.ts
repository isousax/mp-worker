import type { Env } from "../index";

interface PreferenceRequestBody {
	id: string;
	title: string;
	price: number;
	currency_id: string;
	picture_url?: string;
}

export async function handleCreatePreference(request: Request, env: Env): Promise<Response> {
	try {
		//console.log("Headers:", JSON.stringify([...request.headers]));
		const bodyText = await request.text();
		//console.log("Raw body:", bodyText);

		// Tentar parsear o JSON
		let body: PreferenceRequestBody;
		try {
			body = JSON.parse(bodyText);
		} catch {
			return new Response(
				JSON.stringify({ status: 400, message: "Corpo da requisição malformado." }),
				{ status: 400, headers: { "Content-Type": "application/json" } }
			);
		}

		// Validação estrita
		if (
			typeof body !== "object" ||
			typeof body.id !== "string" ||
			typeof body.title !== "string" ||
			typeof body.currency_id !== "string" ||
			typeof body.picture_url !== "string" ||
			typeof body.price !== "number"
		) {
			return new Response(
				JSON.stringify({ status: 400, message: "Corpo da requisição malformado." }),
				{ status: 400, headers: { "Content-Type": "application/json" } }
			);
		}

		const preference = {
			items: [
				{
					id: body.id,
					title: body.title,
					quantity: 1,
					unit_price: body.price,
					currency_id: body.currency_id,
					picture_url: body.picture_url,
				},
			],
			back_urls: {
				success: `https://${env.SITE_DNS}/models/${body.id}/sucesso`,
				failure: `https://${env.SITE_DNS}/models/${body.id}/falha`,
				pending: `https://${env.SITE_DNS}/models/${body.id}/pendente`,
			},
			auto_return: "approved",
		};

		//console.log("Body da preferência:", JSON.stringify(preference));

		const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(preference),
		});

		if (!response.ok) {
			const errorText = await response.text();
			return new Response(`Erro na criação da preferência: ${errorText}`, { status: 500 });
		}

		const data = await response.json() as { id: string; init_point: string };

		return new Response(JSON.stringify({ id: data.id, init_point: data.init_point }), {
			headers: { "Content-Type": "application/json" },
			status: 200,
		});
	} catch (err) {
		//console.error("Erro inesperado:", err);
		return new Response(
			JSON.stringify({ status: 500, message: "Erro inesperado no servidor." }),
			{ status: 500, headers: { "Content-Type": "application/json" } }
		);
	}
}