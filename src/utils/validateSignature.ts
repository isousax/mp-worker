/**
 * Valida a assinatura do webhook do Mercado Pago.
 * @param request - A requisição recebida.
 * @param body - O corpo do webhook.
 * @param secret - O segredo usado para gerar a assinatura.
 * @returns Verdadeiro se a assinatura for válida, falso caso contrário.
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
  const data = encoder.encode(template + secret);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return hashHex === v1;
}
