import { PrismaAdapter } from '@auth/prisma-adapter';
import type { Role, UserStatus } from '@prisma/client';
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { prisma } from '@/lib/db/prisma';
import { verifyPassword } from '@/lib/auth/password';
import { signInSchema } from '@/lib/validation/auth';
import { AUTH_SESSION_MAX_AGE_SECONDS } from '@/lib/auth/session-config';

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'jwt', maxAge: AUTH_SESSION_MAX_AGE_SECONDS },
  pages: {
    signIn: '/sign-in',
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const parsed = signInSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email },
        });

        if (
          !user?.passwordHash ||
          user.status !== 'ACTIVE' ||
          !(await verifyPassword(user.passwordHash, parsed.data.password))
        ) {
          return null;
        }

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          role: user.role,
          status: user.status,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.status = user.status;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = token.role as Role;
      session.user.status = token.status as UserStatus;
      return session;
    },
  },
});
