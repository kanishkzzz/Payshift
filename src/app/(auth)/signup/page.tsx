import { Suspense } from "react";
import SignupForm from "./SignupForm";

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <main className="tracky-workspace grid min-h-screen place-items-center px-4 py-12 text-sm text-slate-500">
          Preparing parent registration…
        </main>
      }
    >
      <SignupForm />
    </Suspense>
  );
}
