import process from "node:process";

export const isProdEnv = () => process.env.NODE_ENV === "production";
export const isSCF = () =>
  Boolean(process.env.SCF_RUNTIME || process.env.PROD_SCF) as boolean;

if (isSCF()) {
  console.log({ isSCF: isSCF(), SCF_RUNTIME: process.env.SCF_RUNTIME });
}
