import { OpenAPIHono } from "@hono/zod-openapi";
import { createApp } from "./app.ts";


const port = Number(process.env.PORT || 9000);
const hostname = "0.0.0.0";

const app = new OpenAPIHono();

app.route("core", createApp());

Deno.serve({
  port,
  hostname,
}, app.fetch);
