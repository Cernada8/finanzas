import { signIn } from "@/lib/auth";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

export default async function LoginPage(props: PageProps<"/login">) {
  const searchParams = await props.searchParams;
  const callbackUrl = typeof searchParams.callbackUrl === "string" ? searchParams.callbackUrl : "/";
  const error = typeof searchParams.error === "string" ? searchParams.error : undefined;

  async function authenticate(formData: FormData) {
    "use server";
    try {
      await signIn("credentials", {
        email: formData.get("email"),
        password: formData.get("password"),
        redirectTo: callbackUrl,
      });
    } catch (err) {
      if (err instanceof AuthError) {
        redirect(`/login?error=CredentialsSignin&callbackUrl=${encodeURIComponent(callbackUrl)}`);
      }
      throw err;
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--surface-2)] px-4">
      <div className="card w-full max-w-sm p-8">
        <h1 className="text-lg font-semibold">Sign in</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">Private single-owner workspace. No public sign-up.</p>

        {error && (
          <p className="mt-4 rounded-md border px-3 py-2 text-sm" style={{ borderColor: "var(--status-critical)", color: "var(--status-critical)" }}>
            Invalid email or password.
          </p>
        )}

        <form action={authenticate} className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            Email
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className="rounded-md border px-3 py-2 text-sm"
              style={{ borderColor: "var(--border)" }}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Password
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="rounded-md border px-3 py-2 text-sm"
              style={{ borderColor: "var(--border)" }}
            />
          </label>
          <button
            type="submit"
            className="mt-2 rounded-md px-3 py-2 text-sm font-medium text-white"
            style={{ background: "var(--series-1)" }}
          >
            Sign in
          </button>
        </form>

        <p className="mt-6 text-xs text-[var(--text-muted)]">
          Demo workspace credentials: demo@example.com / demo-password-please-change
        </p>
      </div>
    </div>
  );
}
