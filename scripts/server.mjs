#!/usr/bin/env node
import { resolve } from "node:path";
import { serveContractedAgent } from "@red-cup-engineering/a2a-contracted-agent-service";
const port = Number(process.env.PORT ?? 19845), host = process.env.HOST ?? "127.0.0.1", baseUrl = process.env.BASE_URL ?? `http://${host}:${port}`;
serveContractedAgent({ port, host, baseUrl, agentCard: resolve("content/agent-cards/acceptance-oracle-assay-service.json"), executor: process.execPath, executorArgs: [resolve("bin/execute-a2a-task.mjs")] }).then(() => process.stdout.write(`${baseUrl}\n`)).catch((error) => { process.stderr.write(`${error.stack ?? error.message}\n`); process.exitCode = 1; });
