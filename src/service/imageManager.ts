import type { Env } from "../index";

export async function moveAndUpdateImages(env: Env, intentionId: string) {
    const intentionData = await env.DB.prepare(`
    SELECT template_id FROM intentions WHERE intention_id = ?
  `).bind(intentionId).first();

    if (!intentionData) {
        throw new Error(`Intenção ${intentionId} não encontrada`);
    }

    const templateId = intentionData.template_id;

    const templateData = await env.DB.prepare(`
    SELECT form_data FROM ${templateId} WHERE intention_id = ?
  `).bind(intentionId).first();

    if (!templateData || !templateData.form_data) {
        throw new Error(`Dados do template para intenção ${intentionId} não encontrados`);
    }

    let formData;
    try {
        formData = typeof templateData.form_data === "string" ? JSON.parse(templateData.form_data) : templateData.form_data;
    } catch {
        throw new Error(`form_data inválido na intenção ${intentionId}`);
    }


    if (!formData.photos || !Array.isArray(formData.photos)) {
        console.warn(`Nenhuma foto encontrada para intenção ${intentionId}`);
        return;
    }

    const results = await Promise.all(formData.photos.map(async (photo) => {
        if (!photo.preview || typeof photo.preview !== "string") return { status: 'skipped', photo };
        try {
            const url = new URL(photo.preview);
            const key = url.pathname.replace("/file/", "");
            if (!key.startsWith("temp/")) {
                return { status: 'skipped', photo };
            }
            
            const keyParts = key.split("/");
            // keyParts[0] = 'temp', keyParts[1] = template, keyParts[2] = filename
            const templateName = keyParts[1];
            const filename = keyParts.slice(2).join("/");
            const newKey = `final/${templateName}/${intentionId}/${filename}`;
            const object = await env.R2.get(key);
            if (!object) {
                console.warn(`Arquivo ${key} não encontrado no R2`);
                return { status: 'not_found', photo };
            }
            const body = await object.arrayBuffer();
            await env.R2.put(newKey, body, {
                httpMetadata: { contentType: object.httpMetadata.contentType },
            });
            await env.R2.delete(key);
            photo.preview = `https://${env.WORKER_DNS}/file/${newKey}`;
            return { status: 'moved', photo };
        } catch (err) {
            console.error(`Erro ao mover imagem ${photo.preview}`, err);
            return { status: 'error', photo, error: err };
        }
    }));

    await env.DB.prepare(`
    UPDATE ${templateId}
    SET form_data = ?, status = 'approved', updated_at = datetime('now')
    WHERE intention_id = ?
  `).bind(JSON.stringify(formData), intentionId).run();

    // Opcional: Retorne um relatório resumido
    return {
        updated: results.filter(r => r.status === 'moved').length,
        skipped: results.filter(r => r.status === 'skipped').length,
        notFound: results.filter(r => r.status === 'not_found').length,
        errors: results.filter(r => r.status === 'error'),
        total: results.length,
    };
}