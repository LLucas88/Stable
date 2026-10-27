import { handleImageGeneration } from '@/lib/server/image-gateway';
import { openAiError } from '@/lib/server/http';
export async function POST(request: Request) {
  try { return await handleImageGeneration(request); } catch (error) { return openAiError(error); }
}
