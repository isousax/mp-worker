import type { D1Database } from "@cloudflare/workers-types";
import type { R2Bucket } from "@cloudflare/workers-types";
import { CreatePreference } from "./endpoints/CreatePreference";
import { handleWebhook } from "./endpoints/handleWebhook";
import { ConsultPaymentStatus } from "./endpoints/ConsultPaymentStatus";
import { PlanRenewal } from "./endpoints/PlanRenewal";

export interface Env {
  MP_ACCESS_TOKEN: string;
  SITE_DNS: string;
  MP_WEBHOOK_URL: string;
  FILE_WORKER_URL: string;
  PREFIX_ID: string;
  DB: D1Database;
  R2: R2Bucket;
  mpSecret: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (request.method === "POST" && pathname === "/preference/create") {
      return await CreatePreference(request, env);
    }
    /* 
     if (request.method === "POST" && pathname === "/intentions/reuse") {
       return await ReuseIntentions(request, env);
     }
    
    if (request.method === "GET" && pathname === "/intentions") {
      return await ConsultIntention(request, env);

    }
    */
   if (request.method === "GET" && pathname === "/consult-payment-status") {
      return await ConsultPaymentStatus(request, env);
    }

    if (request.method === "POST" && pathname === "/webhook") {
      return await handleWebhook(request, env);
    }

    if (request.method === "POST" && pathname === "/renewal") {
      return await PlanRenewal(request, env);
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
          "Access-Control-Allow-Headers": "Content-Type"
        }
      });
    }

    return new Response(
      JSON.stringify({ status: 404, message: "Not Found." }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  },
};