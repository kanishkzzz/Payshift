import { NextResponse } from "next/server";
import { AuthError, requireStaff } from "@/modules/auth";
import { RiskError, RiskService } from "@/modules/risk/risk-service";
import { z } from "zod";

const querySchema = z.object({
  status: z.enum(["OPEN", "CONFIRMED", "FALSE_FLAG"]).optional().default("OPEN"),
  tier: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
});

export async function GET(req: Request) {
  try {
    const { user } = await requireStaff(["COUNSELLOR", "ADMIN"], req);
    const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    return NextResponse.json(await RiskService.listFlags(user, parsed.data));
  } catch (error) {
    if (error instanceof AuthError || error instanceof RiskError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    console.error("[RiskFlags]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Unable to load risk flags." }, { status: 500 });
  }
}
