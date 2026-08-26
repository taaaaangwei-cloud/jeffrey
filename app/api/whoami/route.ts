export async function GET(request: Request) {
  const userId = request.headers.get("oai-authenticated-user-id");
  if (!userId) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  return Response.json({ userId });
}
