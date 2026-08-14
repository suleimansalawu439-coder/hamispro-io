import type { Request, Response } from "express";
import { appRouter } from "../routers";
import { createContext } from "./context";

export async function buildSsrPrefetch(req: Request, res: Response) {
  const ctx = await createContext({ req, res, info: {} as any });
  const caller = appRouter.createCaller(ctx);
  return {
    contentList: (input: any) => caller.content.list(input),
    contentBySlug: (slug: string) => caller.content.bySlug({ slug }),
    resourcesList: (input: any) => caller.resources.list(input),
    systemPublicSettings: () => caller.system.publicSettings(),
  };
}
