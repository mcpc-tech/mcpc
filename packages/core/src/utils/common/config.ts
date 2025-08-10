import process from "node:process";
export const GEMINI_PREFERRED_FORMAT =
  process.env.GEMINI_PREFERRED_FORMAT === "0" ? false : true;
