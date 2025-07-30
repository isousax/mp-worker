import type { Env } from "../index";

interface PreferenceRequestBody {
	product: {
		templateId: string;
		title: string;
		price: number;
		plan: string;
		currency_id: string;
		picture_url?: string;
	},
	player: {
		email: string;
	}
	form_data: Record<string, any>;
}

export async function handleCreatePreference(request: Request, env: Env): Promise<Response> {
	try {
		const bodyText = await request.text();
		let body: PreferenceRequestBody;

		try {
			body = JSON.parse(bodyText);
		} catch {
			return new Response(
				JSON.stringify({ status: 400, message: "Corpo da requisição malformado." }),
				{ status: 400, headers: { "Content-Type": "application/json" } }
			);
		}

		if (!body.player?.email || !body.product?.templateId || !body.product?.plan ||
			!body.product?.title || !body.product?.price || !body.product?.currency_id ||
			!body.product?.picture_url) {
			return new Response(
				JSON.stringify({ status: 400, message: "Corpo da requisição malformado." }),
				{ status: 400, headers: { "Content-Type": "application/json" } }
			);
		}


		const intentionId = crypto.randomUUID();
		await env.DB.prepare(`
  INSERT INTO intentions_db (id, email, template_id, plan, form_data, created_at)
  VALUES (?, ?, ?, ?, ?, ?)
`).bind(
			intentionId,
			body.player.email,
			body.product.templateId,
			body.product.plan,
			JSON.stringify(body.form_data),
			new Date().toISOString()
		).run();

		const preference = {
			items: [
				{
					id: body.product.templateId,
					title: body.product.title,
					quantity: 1,
					unit_price: body.product.price,
					currency_id: body.product.currency_id,
					picture_url: body.product.picture_url,
				},
			],
			payer: {
				email: body.player.email,
			},
			back_urls: {
				success: `https://${env.SITE_DNS}/models/${body.product.templateId}/sucesso`,
				failure: `https://${env.SITE_DNS}/models/${body.product.templateId}/falha`,
				pending: `https://${env.SITE_DNS}/models/${body.product.templateId}/pendente`,
			},
			auto_return: "approved",
			external_reference: intentionId,
		};

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
			return new Response(
				JSON.stringify({ status: response.status, message: `Erro na criação da preference: ${errorText}` }),
				{ status: response.status, headers: { "Content-Type": "application/json" } });
		}

		const data = await response.json() as { id: string; init_point: string };

		return new Response(JSON.stringify({ id: data.id, init_point: data.init_point }), {
			headers: { "Content-Type": "application/json" },
			status: 200,
		});
	} catch (err) {
		console.error("Erro interno:", err);
		return new Response(
			JSON.stringify({ status: 500, message: "Erro inesperado no servidor." }),
			{ status: 500, headers: { "Content-Type": "application/json" } }
		);
	}
}