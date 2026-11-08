import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireStaff } from "@/modules/auth";
import { RefundError, RefundService } from "@/modules/refunds/refund-service";

const schema = z.object({
    action: z.enum(["approve", "reject", "settle"]),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { user } = await requireStaff(["ACCOUNTS", "ADMIN"], req);
        const { id } = await params;
        const parsed = schema.safeParse(await req.json().catch(() => null));
        if (!parsed.success) {
            return NextResponse.json({ error: "action must be approve, reject or settle" }, { status: 400 });
        }
        const result = await RefundService.transition(id, parsed.data.action, user.id);
        return NextResponse.json(result);
    } catch (err) {
        if (err instanceof AuthError || err instanceof RefundError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        console.error("[Refunds]", err instanceof Error ? err.message : err);
        return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
    }
}
