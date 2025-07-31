import type { D1Database } from "@cloudflare/workers-types";
import { handleCreatePreference } from "./endpoints/CreatePreference";
import { ConsultIntention } from "./endpoints/ConsultPreference";
import { ReuseIntentions } from "./endpoints/ReuseIntentions";
import { handleWebhook } from "./endpoints/handleWebhook";

export interface Env {
  MP_ACCESS_TOKEN: string;
  SITE_DNS: string;
  MP_WEBHOOK_URL: string;
  DB: D1Database;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (request.method === "POST" && pathname === "/preference/create") {
      return await handleCreatePreference(request, env);
    }
    /* 
     * if (request.method === "POST" && pathname === "/intentions/reuse") {
     *   return await ReuseIntentions(request, env);
     * }
    */
    if (request.method === "GET" && pathname === "/intentions") {
      return await ConsultIntention(request, env);

    }
    if (request.method === "POST" && pathname === "/webhook") {
      return await handleWebhook(request, env);
    }


    return new Response(
      JSON.stringify({ status: 404, message: "Not Found." }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  },
};