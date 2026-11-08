import { NextResponse } from "next/server";
import { z } from "zod";
import { RefundReasonCode, RefundStatus } from "@prisma/client";
import { AuthError, requireStaff } from "@/modules/auth";
import { RefundError, RefundService } from "@/modules/refunds/refund-service";

const querySchema = z.object({
    status: z.nativeEnum(RefundStatus).optional(),
});

const createSchema = z
    .object({
        enrollmentId: z.string().trim().min(1, "enrollmentId is required"),
        leaveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "leaveDate must be YYYY-MM-DD").optional(),
        reasonCode: z.nativeEnum(RefundReasonCode, {
            message: "Invalid reasonCode. Must be one of STUDENT_WITHDRAWAL, BATCH_CANCELLED, MEDICAL_GROUNDS, DOUBLE_PAYMENT, OTHER",
        }),
        reasonDetail: z.string().trim().max(500).optional(),
        preview: z.boolean().optional(), // true = calculate only, don't save
    })
    .refine(
        (data) => {
            if (data.reasonCode === "OTHER") {
                return typeof data.reasonDetail === "string" && data.reasonDetail.trim().length > 0;
            }
            return true;
        },
        {
            message: "reasonDetail is required when reasonCode is OTHER",
            path: ["reasonDetail"],
        }
    );

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
        const url = new URL(req.url);
        const queryParsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
        if (!queryParsed.success) {
            return NextResponse.json({ error: queryParsed.error.issues[0].message }, { status: 400 });
        }

        const cases = await RefundService.list({ status: queryParsed.data.status });
        return NextResponse.json(cases);
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

        const created = await RefundService.createCase({
            enrollmentId: input.enrollmentId,
            leaveDate: input.leaveDate,
            reasonCode: input.reasonCode,
            reasonDetail: input.reasonDetail,
            actorId: user.id,
        });
        return NextResponse.json(created, { status: 201 });
    } catch (err) {
        return errorResponse(err);
    }
}
