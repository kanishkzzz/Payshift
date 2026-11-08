import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireStaff } from "@/modules/auth";
import { RiskError, RiskService } from "@/modules/risk/risk-service";

const querySchema = z.object({
    centreId: z.string().min(1).optional(),
    windowDays: z.coerce.number().int().min(7).max(365).optional(),
});

export async function GET(req: Request) {
    try {
        const { user } = await requireStaff(["COUNSELLOR", "ADMIN"], req);
        const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        }
        return NextResponse.json(
            await RiskService.getMetrics(user, {
                centreId: parsed.data.centreId,
                outcomeWindowDays: parsed.data.windowDays,
            })
        );
    } catch (err) {
        if (err instanceof AuthError || err instanceof RiskError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        console.error("[RiskMetrics]", err instanceof Error ? err.message : err);
        return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
    }
}