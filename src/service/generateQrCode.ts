// service/generateQrCode.ts
import QRCode from "qrcode";

type UploadResponse = { url?: string };

/**
 * Gera SVG de QR code e envia ao file-worker (/upload?key=...).
 * Retorna a URL pública (string) ou lança erro.
 */
export async function generateQrCode(
  finalSiteUrl: string,
  intentionId: string,
  env: any
): Promise<string> {
  const fileWorkerUrl = `https://${env.FILE_WORKER_URL}`;
  if (!fileWorkerUrl || typeof fileWorkerUrl !== "string") {
    throw new Error("FILE_WORKER_URL não configurado no env do Worker.");
  }

  const key = `qrcodes/${intentionId}.svg`;

  try {
    const svg = await QRCode.toString(finalSiteUrl, {
      type: "svg",
      margin: 2,
      color: { dark: "#000000", light: "#FFFFFF" },
    });

    // 2) Upload via file-worker
    const uploadUrl = `${fileWorkerUrl}/upload?key=${encodeURIComponent(key)}`;
    console.info("[generateQrCode] Enviando QR code para file-worker:", uploadUrl);
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "image/svg+xml" },
      body: svg,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text().catch(() => "");
      throw new Error(`Falha ao enviar QR para file-worker: ${uploadRes.status} ${errText}`);
    }

    const uploadData = (await uploadRes.json().catch(() => ({} as UploadResponse))) as UploadResponse;

    if (uploadData && typeof uploadData.url === "string" && uploadData.url.length > 0) {
      return uploadData.url;
    }

    throw new Error("Resposta do file-worker não contém url.");
  } catch (err) {
    console.error("[generateQrCode] erro:", err);
    throw err;
  }
}
