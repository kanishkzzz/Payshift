import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireStaff } from "@/modules/auth";
import { RefundError, RefundService } from "@/modules/refunds/refund-service";


const createSchema = z.object({
    enrollmentId: z.string().trim().min(1),
    leaveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "leaveDate must be YYYY-MM-DD"),
    reason: z.string().trim().max(500).optional(),
    preview: z.boolean().optional(), // true = calculate only, don't save
});

function errorResponse(err: unknown) {
    if (err instanceof AuthError || err instanceof RefundError) {
        return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error("[Refunds]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
}

export async function GET(req: Request) {
    try {
        await requireStaff(["ACCOUNTS", "ADMIN"], req);
        return NextResponse.json(await RefundService.list());
    } catch (err) {
        return errorResponse(err);
    }
}

export async function POST(req: Request) {
    try {
        const { user } = await requireStaff(["ACCOUNTS", "ADMIN"], req);
        const parsed = createSchema.safeParse(await req.json().catch(() => null));
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        }

        const { preview, ...input } = parsed.data;
        if (preview) {
            return NextResponse.json(await RefundService.preview(input.enrollmentId, input.leaveDate));
        }
        const created = await RefundService.createCase({ ...input, actorId: user.id });
        return NextResponse.json(created, { status: 201 });
    } catch (err) {
        return errorResponse(err);
    }
}