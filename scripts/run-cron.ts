import "dotenv/config";
import { runEditorialIngestionPipeline } from "../server/editorialIngestion";

async function main() {
  console.log(`[${new Date().toISOString()}] Starting Standalone Editorial Ingestion Cron`);

  try {
    const result = await runEditorialIngestionPipeline();
    console.log(`[${new Date().toISOString()}] Ingestion completed:`, result);
    process.exit(result.ok ? 0 : 1);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Unhandled error during ingestion:`, error);
    process.exit(1);
  }
}

main();
