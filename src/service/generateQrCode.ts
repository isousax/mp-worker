import QRCode from "qrcode";

/**
 * Gera SVG de QR code, salva no R2 (via env.R2.put) e retorna a URL pública.
 *
 * Requisitos:
 * - Este Worker precisa ter binding R2 disponível em `env.R2`.
 * - Para montar a URL pública, o código tenta (em ordem):
 *   1) env.FILE_WORKER_PUBLIC_HOST (ex: "dedicart-file-worker.dedicart.workers.dev")
 *   2) env.FILE_WORKER_URL (ex: "https://dedicart-file-worker.dedicart.workers.dev")
 *   3) env.SITE_DNS (ex: "dedicart.com.br") — usado como fallback se nada mais estiver setado.
 *
 * Observação: o domínio escolhido deve servir `/file/{key}` (ex.: file-worker deve ter rota /file/:key).
 */

export async function generateQrCode(
  finalSiteUrl: string,
  intentionId: string,
  env: any
): Promise<string> {
  if (!env || !env.R2) {
    throw new Error("R2 binding não encontrado em env. Verifique se env.R2 está configurado.");
  }

  const key = `qrcodes/${intentionId}.svg`;

  try {
    const svg = await QRCode.toString(finalSiteUrl, {
      type: "svg",
      margin: 2,
      color: { dark: "#000000", light: "#FFFFFF" },
    });

    const encoder = new TextEncoder();
    const bytes = encoder.encode(svg);

    await env.R2.put(key, bytes, {
      httpMetadata: { contentType: "image/svg+xml" },
    });

    let publicHost = env.FILE_WORKER_URL;

    if (!publicHost || typeof publicHost !== "string") {
      throw new Error(
        "Não foi possível determinar host público para servir o arquivo. Configure FILE_WORKER_PUBLIC_HOST or FILE_WORKER_URL or SITE_DNS in env."
      );
    }

    publicHost = publicHost.replace(/^https?:\/\//, "").replace(/\/+$/, "");

    const publicUrl = `https://${publicHost}/file/${key}`;
    return publicUrl;
  } catch (err) {
    console.error("[generateQrCode] erro ao gerar/enviar QR:", err);
  }
}
