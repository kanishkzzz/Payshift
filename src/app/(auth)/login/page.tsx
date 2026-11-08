import { Suspense } from "react";
import LoginForm from "./LoginForm";

type LoginSearchParams = Pick<PageProps<"/login">, "searchParams">;

async function LoginContent({ searchParams }: LoginSearchParams) {
  const { tab } = await searchParams;
  return <LoginForm initialMode={tab === "staff" ? "STAFF" : "PARENT"} />;
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <Suspense
      fallback={
        <main className="tracky-workspace grid min-h-screen place-items-center px-4 py-12">
          <section
            className="tracky-auth-card w-full max-w-md border border-white bg-white p-8 text-sm text-slate-600"
            role="status"
          >
            Loading sign in…
          </section>
        </main>
      }
    >
      <LoginContent searchParams={searchParams} />
    </Suspense>
  );
}
