import { handleChatCompletion } from '@/lib/server/gateway';
import { openAiError } from '@/lib/server/http';
export async function POST(request:Request) {
  try { return await handleChatCompletion(request,true); } catch(error){ return openAiError(error); }
}
