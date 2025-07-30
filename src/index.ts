import type { D1Database } from "@cloudflare/workers-types";
import { handleCreatePreference } from "./endpoints/CreatePreference";

export interface Env {
  MP_ACCESS_TOKEN: string;
  SITE_DNS: string;
  DB: D1Database;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (request.method === "POST" && pathname === "/create-preference") {
      return await handleCreatePreference(request, env);
    }

    return new Response(
				JSON.stringify({ status: 404, message: "Not Found." }),
				{ status: 404, headers: { "Content-Type": "application/json" } }
			);
  },
};