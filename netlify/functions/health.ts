import type { Handler } from "@netlify/functions";
export const handler: Handler = async () => ({
  statusCode: 200,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify({
    status: "ok",
    service: "gather",
    time: new Date().toISOString(),
  }),
});
