import { prisma } from "@/lib/prisma";
import { getStudentLedger } from "@/modules/ledger/student-ledger";
import { toISTCalendarDateString } from "@/modules/ledger/date-utils";
import { paiseToDecimal } from "@/modules/reports/reports-math";

export class ParentError extends Error {
    constructor(message: string, public statusCode = 400) {
        super(message);
        this.name = "ParentError";
    }
}

const TWO = BigInt(2);

/** Students this guardian may see: direct link, or students whose guardian record shares this phone. */
export async function getLinkedStudentIds(guardianId: string): Promise<string[]> {
    const guardian = await prisma.guardian.findUnique({
        where: { id: guardianId },
        select: { phone: true, studentId: true },
    });
    if (!guardian) return [];

    const samePhone = await prisma.guardian.findMany({
        where: { phone: guardian.phone, studentId: { not: null } },
        select: { studentId: true },
    });

    const ids = new Set<string>();
    if (guardian.studentId) ids.add(guardian.studentId);
    for (const g of samePhone) if (g.studentId) ids.add(g.studentId);
    return [...ids];
}

const escapeHtml = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export interface ReceiptView {
    receiptNo: string;
    issuedAt: string; // YYYY-MM-DD
    instituteName: string;
    centreName: string;
    centreCity: string;
    gstin: string;
    studentId: string;
    studentName: string;
    batchName: string;
    amountPaise: bigint;
    taxablePaise: bigint;
    gstPaise: bigint;
    paymentRef: string | null;
    source: string;
}

/** Pure: printable GST receipt. All user-provided text is HTML-escaped. */
export function renderReceiptHtml(r: ReceiptView): string {
    const cgst = r.gstPaise / TWO;
    const sgst = r.gstPaise - cgst;
    const row = (label: string, value: string) =>
        `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`;

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Receipt ${escapeHtml(r.receiptNo)}</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 480px; margin: 16px auto; padding: 0 12px; color: #111; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  p { margin: 0 0 12px; color: #444; font-size: 14px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th, td { text-align: left; padding: 6px 4px; border-bottom: 1px solid #ddd; }
  th { color: #555; font-weight: 500; width: 45%; }
  .total td, .total th { font-weight: 700; color: #111; }
  @media print { body { margin: 0; } }
</style>
</head>
<body>
  <h1>${escapeHtml(r.instituteName)} — Fee Receipt</h1>
  <p>${escapeHtml(r.centreName)}, ${escapeHtml(r.centreCity)} · GSTIN ${escapeHtml(r.gstin)}</p>
  <table>
    ${row("Receipt No", r.receiptNo)}
    ${row("Date", r.issuedAt)}
    ${row("Student", `${r.studentName} (${r.studentId})`)}
    ${row("Batch", r.batchName)}
    ${row("Payment mode", r.source)}
    ${row("Payment reference", r.paymentRef ?? "-")}
    ${row("Taxable value", `₹${paiseToDecimal(r.taxablePaise)}`)}
    ${row("CGST (9%)", `₹${paiseToDecimal(cgst)}`)}
    ${row("SGST (9%)", `₹${paiseToDecimal(sgst)}`)}
    <tr class="total"><th>Total paid</th><td>₹${escapeHtml(paiseToDecimal(r.amountPaise))}</td></tr>
  </table>
</body>
</html>`;
}

export class ParentService {
    /** Dues for every student linked to this guardian. */
    static async getDues(guardianId: string, asOf: Date | string = new Date()) {
        const studentIds = await getLinkedStudentIds(guardianId);
        const ledgers = await Promise.all(studentIds.map((id) => getStudentLedger(id, asOf)));

        return ledgers.map((l) => {
            const instalments = l.instalments.map((i) => ({
                id: i.id,
                seq: i.seq,
                dueDate: i.dueDate ? toISTCalendarDateString(i.dueDate) : null,
                amountRupee: i.amountRupee,
                paidRupee: i.paidRupee,
                remainingRupee: i.remainingRupee,
                isFullyPaid: i.isFullyPaid,
                daysOverdue: i.daysOverdue,
            }));

            return {
                studentId: l.studentId,
                studentName: l.studentName,
                batchName: l.batchName ?? null,
                asOfDate: l.asOfDate,
                totalFeePaise: l.totalFeePaise,
                totalPaidPaise: l.totalPaidPaise,
                totalOutstandingPaise: l.totalOutstandingPaise,
                daysOverdue: l.daysOverdue,
                isFullyPaid: l.isFullyPaid,
                nextDue: instalments.find((i) => !i.isFullyPaid) ?? null,
                instalments,
            };
        });
    }

    /** Receipts for linked students, newest first. */
    static async getReceipts(guardianId: string) {
        const studentIds = await getLinkedStudentIds(guardianId);
        if (studentIds.length === 0) return [];

        const receipts = await prisma.receipt.findMany({
            where: { payment: { studentId: { in: studentIds } } },
            include: {
                payment: {
                    select: { amountPaise: true, source: true, student: { select: { id: true, name: true } } },
                },
            },
            orderBy: { issuedAt: "desc" },
        });

        return receipts.map((r) => ({
            id: r.id,
            receiptNo: r.receiptNo,
            issuedAt: toISTCalendarDateString(r.issuedAt),
            studentId: r.payment.student?.id ?? null,
            studentName: r.payment.student?.name ?? null,
            amountPaise: r.payment.amountPaise.toString(),
            taxablePaise: r.taxablePaise.toString(),
            gstPaise: r.gstPaise.toString(),
            source: r.payment.source,
        }));
    }

    /** Printable receipt. 404 (not 403) if it doesn't belong to this guardian. */
    static async getReceiptHtml(guardianId: string, receiptId: string): Promise<string> {
        const receipt = await prisma.receipt.findUnique({
            where: { id: receiptId },
            include: { payment: { include: { student: { include: { batch: { include: { centre: true } } } } } } },
        });

        const studentIds = await getLinkedStudentIds(guardianId);
        const student = receipt?.payment.student;
        if (!receipt || !student || !studentIds.includes(student.id)) {
            throw new ParentError("Receipt not found.", 404);
        }

        return renderReceiptHtml({
            receiptNo: receipt.receiptNo,
            issuedAt: toISTCalendarDateString(receipt.issuedAt),
            instituteName: process.env.INSTITUTE_NAME || "Tracky",
            centreName: student.batch.centre.name,
            centreCity: student.batch.centre.city,
            gstin: receipt.gstin,
            studentId: student.id,
            studentName: student.name,
            batchName: student.batch.name,
            amountPaise: receipt.payment.amountPaise,
            taxablePaise: receipt.taxablePaise,
            gstPaise: receipt.gstPaise,
            paymentRef: receipt.payment.gatewayRef,
            source: receipt.payment.source,
        });
    }
}