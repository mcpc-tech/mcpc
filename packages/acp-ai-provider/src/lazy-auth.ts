// ACP auth-required JSON-RPC error code.
// Spec reference: https://agentclientprotocol.com/protocol/schema#errorcode-9
export const ACP_AUTH_REQUIRED_ERROR_CODE = -32000;

// ACP auth-required error message (case-insensitive fallback match).
const ACP_AUTH_REQUIRED_MESSAGE = "authentication required";

export function isAuthRequiredError(error: unknown): boolean {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (code === ACP_AUTH_REQUIRED_ERROR_CODE) {
      return true;
    }
  }

  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message?: unknown }).message ?? "");
    return message.toLowerCase().includes(ACP_AUTH_REQUIRED_MESSAGE);
  }

  return false;
}
