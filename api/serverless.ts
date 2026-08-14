import { app } from "../server/_core/app";

export default function handler(req: any, res: any) {
  return app(req, res);
}
