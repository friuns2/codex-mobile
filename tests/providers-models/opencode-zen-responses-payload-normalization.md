### OpenCode Zen Responses Payload Normalization

#### Feature/Change Name
Preserve native Responses input and add Zen's keyless free-tier admission shape.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. No OpenCode Zen API key configured

#### Steps
1. Open Settings
2. Set Provider to `OpenCode Zen`
3. Set API format to `Responses`
4. Save
5. Select model `muse-spark-1.3-contributor-free`
6. Send `hi`
7. Switch API format to `Completions`
8. Save
9. Select model `trinity-large-preview-free`
10. Send `hi`

#### Expected Results
- `Responses` mode posts native Responses input to `/zen/v1/responses`
- The request declares canonical OpenCode IDs, streaming, and `bash` and `read` tools
- `muse-spark-1.3-contributor-free` returns a successful assistant greeting without a user key
- `Completions` mode still posts through `/zen/v1/chat/completions` and returns a successful assistant greeting
- Models unsupported by Zen for a chosen format, such as `minimax-m2.5-free` in `Responses` mode, surface the upstream error without being hidden

#### Rollback/Cleanup
- Switch provider/API format back to preferred defaults

---
