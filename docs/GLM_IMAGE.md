# GLM-Image integration

Current Claude branch exposes `stable_image_generate` through the existing Stable MCP server. The tool is available to ordinary task and worker sessions with network and write access; text-only, read-only and offline sessions do not advertise it. Tool discovery and the system guidance direct tasks needing new image assets to this tool without changing the conversation model. Existing approval routing still applies. No renderer or UI layout changes are needed.

## Credentials and output

- The Electron parent reads the existing encrypted key for an official `https://open.bigmodel.cn/api/paas/v4` profile. Prefer the conversation's profile, then the configured default, then another official profile with a key. GLM names on proxy or Coding Plan profiles do not qualify. No key enters the model prompt, subprocess environment, tool schema or result.
- `prompt` accepts up to 1000 characters; optional `size` defaults to `1280x1280`; `output` is a new workspace `.png` with an existing parent directory. One request produces one image. This is text-to-image, not image editing or screenshot capture.
- The provider URL is downloaded, decoded and saved as PNG. The tool returns a durable path, dimensions and byte count; the model can inspect it with Read and use it in the final deliverable. Provider watermark defaults are retained.
- Identical calls share one paid request within a run. Successful generation URLs are retained for download retries; failed/uncertain generation is not automatically reissued. Existing files are never overwritten. Cancellation and 180-second timeouts propagate. Errors do not expose upstream raw bodies or secrets.
- HTTPS downloads have a 20 MB limit, bounded redirects and public-address checks. A narrow exception supports TUN synthetic DNS (`198.18.0.0/15`) for the exact provider image CDN `maas-watermark-prod-new.cn-wlcb.ufileos.com`; private addresses for other hosts remain blocked.
- Tool policy version increments so resumed conversations refresh their tool definitions.

## Verification (2026-10-22)

- Image service/credential/permission tests, existing model registry, Claude tools and harness regressions passed.
- Hidden Electron browser/Excel and app.asar-layout regressions passed after including the new module in the test archive. The actual builder already includes `desktop/**/*`.
- Real SDK integration discovered the tool via ToolSearch, passed existing approval, called BuiltinTools and received the saved file path. Planner replies were deterministic local fixtures, not a paid model choosing the tool independently.
- Typecheck and production Vite build passed. Existing chunk-size warning remains.
- Live official GLM-Image request used the saved Zhipu key. The first download exposed local proxy synthetic-DNS incompatibility; after correction the saved provider response was reused without another generation. Real 1280×1280 PNG was decoded, saved, visually inspected (blue bird watercolor) and returned through the SDK tool path.
- Live verification submitted two image requests total (both reserved, including the initial failed outcome), estimated ¥0.20 at the official ¥0.10/request rate. Actual billing was not queried. The user limit was ¥1; no recharge. Evidence is under `D:\stable\.local\glm-image-validation-20261022`.
- No formal installer was generated and no interactive application UI acceptance was claimed.

### Follow-up: real planner and conversation display

A separate 2026-10-22 acceptance used real official DeepSeek-Flash with high reasoning. The user prompt named neither GLM-Image nor its tool. The model independently chose ToolSearch → stable_image_generate → Read and produced a final answer. One real GLM-Image POST succeeded. The 1280×1280 image appeared as a thumbnail in the actual Stable conversation, and remained visible after restarting the isolated profile. The conversation screenshot was visually inspected.

Conservative total cost at peak token prices was ¥0.17080176 (including one ¥0.10 image request), within the separately authorized ¥1 cap; no recharge. Actual final billing was not independently verified. The optional right-side expanded preview loaded, but its hidden native view could not be captured; expanded-preview pixels remain unverified. No product behavior/UI changed during this acceptance. Full evidence: `D:\stable\.local\glm-image-real-ui-20261022\VERIFICATION.md`.

Official reference: https://docs.bigmodel.cn/api-reference/模型-api/图像生成

Model and price reference: https://docs.bigmodel.cn/cn/guide/models/image-generation/glm-image

Commands:

```powershell
node --test tests/image-generation.test.cjs tests/claude-tools.test.cjs tests/model-registry.test.cjs tests/claude-harness.test.cjs tests/builtin-tools.test.cjs
node --test --test-name-pattern='real SDK discovers image generation' tests/claude-sdk-integration.cjs
npm run typecheck
npm run build
```
