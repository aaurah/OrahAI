export const logger = {
  info:  (...a: unknown[]) => console.log("[sandbox]", ...a),
  warn:  (...a: unknown[]) => console.warn("[sandbox]", ...a),
  error: (...a: unknown[]) => console.error("[sandbox]", ...a),
};
