import { requireAdmin } from '@/lib/server/auth';
import { getOpenAIEgressStatus } from '@/lib/server/openai-fetch';
import { noStoreJson, openAiError } from '@/lib/server/http';
export async function GET(request: Request) {
  try { await requireAdmin(request); return noStoreJson(await getOpenAIEgressStatus()); }
  catch(error) { return openAiError(error); }
}
