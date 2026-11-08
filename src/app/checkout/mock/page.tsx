import { Suspense } from "react";
import MockCheckout from "./mock-checkout";

type CheckoutSearchParams = Pick<PageProps<"/checkout/mock">, "searchParams">;

async function MockCheckoutContent({ searchParams }: CheckoutSearchParams) {
  const params = await searchParams;
  const orderId = Array.isArray(params.ref) ? params.ref[0] ?? "" : params.ref ?? "";
  return <MockCheckout orderId={orderId} />;
}

export default function MockCheckoutPage({ searchParams }: PageProps<"/checkout/mock">) {
  return (
    <Suspense
      fallback={
        <main className="tracky-workspace grid min-h-screen place-items-center px-4 py-12">
          <section
            className="tracky-auth-card w-full max-w-md border border-white bg-white p-7 text-sm text-slate-600 sm:p-9"
            role="status"
          >
            Preparing your demo checkout…
          </section>
        </main>
      }
    >
      <MockCheckoutContent searchParams={searchParams} />
    </Suspense>
  );
}
