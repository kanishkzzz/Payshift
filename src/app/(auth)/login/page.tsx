import LoginForm from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  return <LoginForm initialMode={tab === "staff" ? "STAFF" : "PARENT"} />;
}
