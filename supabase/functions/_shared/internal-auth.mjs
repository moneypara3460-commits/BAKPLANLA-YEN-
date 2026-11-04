export function hasValidInternalBearer(header, expectedToken) {
  if (!header || !expectedToken || expectedToken.length < 32 || !header.startsWith("Bearer ")) return false;

  const candidate = header.slice("Bearer ".length);
  if (candidate.length !== expectedToken.length) return false;

  let difference = 0;
  for (let index = 0; index < expectedToken.length; index += 1) {
    difference |= candidate.charCodeAt(index) ^ expectedToken.charCodeAt(index);
  }
  return difference === 0;
}

export async function withInternalAuthorization(request, expectedToken, authorizedHandler) {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!hasValidInternalBearer(request.headers.get("authorization"), expectedToken)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return authorizedHandler(request);
}
