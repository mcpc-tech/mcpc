import { OpenAPIHono } from "@hono/zod-openapi";
import { createApp } from "./app.ts";
import process from "node:process";


const port = Number(process.env.PORT || 9000);
const hostname = "0.0.0.0";

const app = new OpenAPIHono();

app.route("oapi", createApp());

Deno.serve(
  {
    port,
    hostname,
  },
  app.fetch
);
