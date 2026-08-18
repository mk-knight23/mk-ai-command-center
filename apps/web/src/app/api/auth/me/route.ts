import { errJson, okJson, requireUser } from "@/lib/api";

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (!auth) return errJson("unauthorized", "Not authenticated.", 401);
  return okJson(auth.user);
}
