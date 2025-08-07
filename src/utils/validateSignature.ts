/**
 * Valida a assinatura do webhook do Mercado Pago.
 * @param request - A requisição recebida.
 * @param body - O corpo do webhook.
 * @param secret - O segredo usado para gerar a assinatura.
 * @returns true apenas se a assinatura for válida.
 */
export async function validateSignature(
  request: Request,
  body: { data?: { id: string } },
  secret: string
): Promise<boolean> {
  const signature = request.headers.get("x-signature");
  const requestId = request.headers.get("x-request-id") || "";
  if (!signature || !requestId) {
    console.error("Cabeçalhos de assinatura ausentes");
    return false;
  }

  const [tsPart, v1Part] = signature.split(",");
  const ts = tsPart?.split("=")[1];
  const v1 = v1Part?.split("=")[1];
  if (!ts || !v1 || !body.data?.id) return false;

  const template = `id:${body.data.id};request-id:${requestId};ts:${ts};`;

  const encoder = new TextEncoder();
  // Mercado Pago exige HMAC-SHA256, usando o segredo como chave
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signatureBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(template));
  const hashArray = Array.from(new Uint8Array(signatureBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

  return hashHex === v1;
}
