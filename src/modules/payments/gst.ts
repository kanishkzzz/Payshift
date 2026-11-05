const ONE_HUNDRED = BigInt(100);
const ONE_EIGHTEEN = BigInt(118);
const HALF_UP = BigInt(59);

/**
 * Splits a GST-inclusive amount (18%) into taxable value and GST, in exact paise.
 * taxable = round(amount / 1.18), using integer math only.
 */
export function splitGstInclusive(amountPaise: bigint): {
    taxablePaise: bigint;
    gstPaise: bigint;
} {
    const taxablePaise = (amountPaise * ONE_HUNDRED + HALF_UP) / ONE_EIGHTEEN;
    return { taxablePaise, gstPaise: amountPaise - taxablePaise };
}