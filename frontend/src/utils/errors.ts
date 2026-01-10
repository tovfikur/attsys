import axios from "axios";

export function getErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data;
    if (data && typeof data === "object" && "error" in data) {
      const errorValue = (data as Record<string, unknown>).error;
      if (typeof errorValue === "string") return errorValue;
    }
  }

  if (err instanceof Error && typeof err.message === "string") return err.message;
  if (err && typeof err === "object" && "message" in err) {
    const msg = (err as Record<string, unknown>).message;
    if (typeof msg === "string") return msg;
  }
  return fallback;
}

