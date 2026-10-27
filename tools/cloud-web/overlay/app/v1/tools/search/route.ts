import { handleWebTool } from '@/lib/server/web-tools';
import { openAiError } from '@/lib/server/http';
export async function POST(request: Request) { try { return await handleWebTool(request, 'search'); } catch (error) { return openAiError(error); } }
