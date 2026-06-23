/**
 * Strip secrets from text before it leaves the server (tool error payloads, fatal
 * logs). The main risk is RPC URLs with an embedded API key (Alchemy/Infura put
 * the key in the path or query) surfacing in a viem transport error that we hand
 * back to the model/client.
 *
 * Strategy: reduce every URL to `scheme://host`, dropping userinfo, path, query
 * and fragment — that's where keys live. The host is kept so errors stay useful.
 */
export function redactSecrets(message: string): string {
  return message.replace(/\bhttps?:\/\/[^\s'"`]+/gi, (url) => {
    try {
      const u = new URL(url);
      return `${u.protocol}//${u.host}`; // host = hostname[:port], no userinfo
    } catch {
      return "[redacted-url]";
    }
  });
}
