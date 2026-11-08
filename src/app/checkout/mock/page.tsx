import MockCheckout from "./mock-checkout";

export default async function MockCheckoutPage({ searchParams }: PageProps<"/checkout/mock">) {
  const params = await searchParams;
  const orderId = Array.isArray(params.ref) ? params.ref[0] ?? "" : params.ref ?? "";
  return <MockCheckout orderId={orderId} />;
}
