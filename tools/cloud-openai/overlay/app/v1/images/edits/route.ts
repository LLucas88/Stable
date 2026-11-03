import { handleOpenAIImage } from '@/lib/server/openai-image-gateway';
import { authenticateRequest } from '@/lib/server/auth';
import { openAiError, readJson } from '@/lib/server/http';
export async function POST(request: Request) {
  try {
    await authenticateRequest(request);
    return await handleOpenAIImage(request, await readJson(request, 29 * 1024 * 1024), true);
  } catch (error) { return openAiError(error); }
}
