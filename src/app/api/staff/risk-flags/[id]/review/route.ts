import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireStaff } from "@/modules/auth";
import { RiskError, RiskService } from "@/modules/risk/risk-service";
import { FALSE_FLAG_REASONS } from "@/modules/risk/types";

const schema = z
    .object({
        status: z.enum(["CONFIRMED", "FALSE_FLAG"]),
        reason: z.enum(FALSE_FLAG_REASONS).optional(),
        note: z.string().trim().max(1000).optional(),
    })
    .refine((d) => d.status !== "FALSE_FLAG" || d.reason, {
        message: "reason is required when marking FALSE_FLAG",
        path: ["reason"],
    });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { user } = await requireStaff(["COUNSELLOR", "ADMIN"], req);
        const { id } = await params;
        const parsed = schema.safeParse(await req.json().catch(() => null));
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        }
        return NextResponse.json(await RiskService.reviewFlag(id, user, parsed.data));
    } catch (err) {
        if (err instanceof AuthError || err instanceof RiskError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        console.error("[RiskReview]", err instanceof Error ? err.message : err);
        return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
    }
}