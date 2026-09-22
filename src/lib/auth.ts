/**
 * Single-owner authentication (brief §7): no public registration. The one Owner row for this
 * workspace is created by the seed/setup script; sign-in is email + password against a bcrypt
 * hash. Uses NextAuth (established auth library, not custom crypto) with a database-independent
 * JWT session so it works the same in demo and live workspace modes.
 */
import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      isDemo: boolean;
    } & DefaultSession["user"];
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== "string" || typeof password !== "string") return null;

        const owner = await prisma.owner.findUnique({ where: { email: email.toLowerCase() } });
        if (!owner) return null;

        const valid = await bcrypt.compare(password, owner.passwordHash);
        if (!valid) return null;

        await prisma.auditEvent.create({
          data: { ownerId: owner.id, action: "login" },
        });

        return { id: owner.id, email: owner.email, name: owner.displayName, isDemo: owner.isDemo };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.isDemo = (user as { isDemo?: boolean }).isDemo ?? false;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.isDemo = Boolean(token.isDemo);
      }
      return session;
    },
  },
});

/** Throws if there is no authenticated owner. Use in every server action / route handler that touches owner data. */
export async function requireOwner() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("UNAUTHENTICATED");
  }
  return session.user;
}
