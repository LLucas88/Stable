import { handleWebTool } from '@/lib/server/web-tools';
import { openAiError } from '@/lib/server/http';
export async function POST(request: Request) { try { return await handleWebTool(request, 'fetch'); } catch (error) { return openAiError(error); } }
