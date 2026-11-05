import { prisma } from "@/lib/prisma";
import { toISTCalendarDateString } from "@/modules/ledger/date-utils";
import { buildDuesSummary, buildTallyCsv } from "./reports-math";
import type { DuesInstalmentInput, DuesSummary, TallyReceiptRow } from "./types";

const ZERO = BigInt(0);
const DAY_MS = 24 * 60 * 60 * 1000;
const istMidnight = (date: string) => new Date(`${date}T00:00:00+05:30`);

/** NextResponse.json can't serialise BigInt; convert to strings. */
export function toJsonSafe<T>(value: T): unknown {
    return JSON.parse(JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
}

export class ReportsService {
    static async getDuesSummary(opts: {
        asOf?: string;
        centreId?: string;
        batchId?: string;
    }): Promise<DuesSummary> {
        const asOf = opts.asOf ?? toISTCalendarDateString(new Date());

        const instalments = await prisma.instalment.findMany({
            where: {
                enrollment: {
                    student: {
                        status: "ACTIVE",
                        ...(opts.batchId ? { batchId: opts.batchId } : {}),
                        ...(opts.centreId ? { batch: { centreId: opts.centreId } } : {}),
                    },
                },
            },
            select: {
                id: true,
                dueDate: true,
                amountPaise: true,
                allocations: { select: { amountPaise: true } },
                enrollment: {
                    select: {
                        student: {
                            select: {
                                id: true,
                                name: true,
                                batch: { select: { id: true, name: true, centre: { select: { id: true, name: true } } } },
                            },
                        },
                    },
                },
            },
        });

        const rows: DuesInstalmentInput[] = [];
        for (const inst of instalments) {
            const paid = inst.allocations.reduce((s, a) => s + a.amountPaise, ZERO);
            const outstanding = inst.amountPaise > paid ? inst.amountPaise - paid : ZERO;
            if (outstanding <= ZERO) continue;

            const student = inst.enrollment.student;
            rows.push({
                instalmentId: inst.id,
                studentId: student.id,
                studentName: student.name,
                batchId: student.batch.id,
                batchName: student.batch.name,
                centreId: student.batch.centre.id,
                centreName: student.batch.centre.name,
                dueDate: inst.dueDate,
                outstandingPaise: outstanding,
            });
        }

        return buildDuesSummary(rows, asOf);
    }

    /** Receipts issued between from and to (inclusive, IST) as a Tally CSV. */
    static async getTallyCsv(opts: { from: string; to: string; centreId?: string }): Promise<string> {
        const receipts = await prisma.receipt.findMany({
            where: {
                issuedAt: { gte: istMidnight(opts.from), lt: new Date(istMidnight(opts.to).getTime() + DAY_MS) },
                payment: {
                    status: "MATCHED",
                    ...(opts.centreId ? { student: { batch: { centreId: opts.centreId } } } : {}),
                },
            },
            include: { payment: { include: { student: { select: { id: true, name: true } } } } },
            orderBy: { receiptNo: "asc" },
        });

        const rows: TallyReceiptRow[] = receipts.map((r) => ({
            date: r.issuedAt,
            receiptNo: r.receiptNo,
            studentId: r.payment.student?.id ?? "UNKNOWN",
            studentName: r.payment.student?.name ?? "Unknown student",
            amountPaise: r.payment.amountPaise,
            taxablePaise: r.taxablePaise,
            gstPaise: r.gstPaise,
            gstin: r.gstin,
            paymentRef: r.payment.gatewayRef,
            source: r.payment.source,
        }));

        return buildTallyCsv(rows);
    }
}