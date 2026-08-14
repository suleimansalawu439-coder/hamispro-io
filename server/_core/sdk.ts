import { ForbiddenError } from "@shared/_core/errors";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import * as db from "../db";

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

export type AuthenticatedUser = User & {
  taskUid?: string;
  isCron?: boolean;
};

class SDKServer {
  private parseCookies(cookieHeader: string | undefined) {
    if (!cookieHeader) {
      return new Map<string, string>();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }

  private getSessionSecret() {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("JWT_SECRET is not configured");
    return new TextEncoder().encode(secret);
  }

  async verifySession(
    token: string | undefined | null
  ): Promise<{ sub: string; email?: string } | null> {
    if (!token) {
      return null;
    }

    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(token, secretKey, {
        algorithms: ["HS256"],
      });
      const { sub, email } = payload as Record<string, unknown>;

      if (!isNonEmptyString(sub)) {
        return null;
      }

      return {
        sub,
        email: typeof email === "string" ? email : undefined,
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }

  async authenticateRequest(req: Request): Promise<AuthenticatedUser> {
    // Look for Bearer token in Authorization header
    let sessionToken: string | undefined;
    
    const authHeader = req.headers.authorization;
    if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
      sessionToken = authHeader.slice(7);
    }

    if (!sessionToken) {
      // Fallback to checking for Supabase cookie if any
      const cookies = this.parseCookies(req.headers.cookie);
      // Supabase default auth token cookie name pattern if they used SSR auth
      const projectRef = process.env.VITE_SUPABASE_URL?.match(/:\/\/([^.]+)\.supabase\.co/)?.[1];
      if (projectRef) {
        const sbCookie = cookies.get(`sb-${projectRef}-auth-token`);
        if (sbCookie) {
          try {
            const parsed = JSON.parse(sbCookie);
            sessionToken = parsed.access_token || parsed[0];
          } catch {}
        }
      }
    }

    const session = await this.verifySession(sessionToken);

    if (!session) {
      throw ForbiddenError("Invalid or missing session");
    }

    const sessionUserId = session.sub;
    const signedInAt = new Date();
    let user = await db.getUserByOpenId(sessionUserId);

    // If user not in DB, sync them
    if (!user) {
      await db.upsertUser({
        openId: sessionUserId,
        name: session.email?.split("@")[0] || "Admin",
        email: session.email || null,
        loginMethod: "supabase",
        lastSignedIn: signedInAt,
      });
      user = await db.getUserByOpenId(sessionUserId);
    }

    if (!user) {
      throw ForbiddenError("User not found");
    }

    // Update last signed in
    await db.upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt,
    });

    return user;
  }
}

export const sdk = new SDKServer();
