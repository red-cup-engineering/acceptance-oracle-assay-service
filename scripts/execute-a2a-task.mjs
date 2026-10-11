#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Message, Role } from "@a2a-js/sdk";
import { extractRmnPart, rmnPart } from "@red-cup-engineering/a2a-rmn-part-service";
import { createSettlementStore } from "@lenticule-science/witness-journal-rdf-projection-service/client";
import { decodeRequest, performAssay } from "../src/protocol.mjs";
const ROOT = resolve(import.meta.dirname, "..");
export async function executeA2aMessage(source, env = process.env) { const message = Message.fromJSON(source); if (message.role !== Role.ROLE_USER) throw new Error("oracle assay requires A2A ROLE_USER"); if (!env.WITNESS_JOURNAL_RDF_AGENT) throw new Error("WITNESS_JOURNAL_RDF_AGENT is required"); const input = extractRmnPart(message.parts), result = await performAssay(decodeRequest(input.bytes)), recordedAt = new Date().toISOString(); const store = createSettlementStore({ settlementRoot: ROOT, agentUrl: env.WITNESS_JOURNAL_RDF_AGENT }); await store.record({ category: "acceptance-oracle-assay.receipt", recordedAt, record: { ...result.receipt, semanticId: result.semanticId } }); return Message.toJSON({ messageId: randomUUID(), contextId: message.contextId, taskId: message.taskId, role: Role.ROLE_AGENT, parts: [rmnPart(result.canonicalBytes, "acceptance-oracle-assay-receipt.rmn.cbor")], metadata: { disposition: result.receipt.assay.accepted ? "oracle-evidence-assayed" : "oracle-evidence-not-assayed", receiptNi: result.semanticId }, extensions: [], referenceTaskIds: [] }); }
if (process.argv[1]) try { process.stdout.write(`${JSON.stringify(await executeA2aMessage(JSON.parse(readFileSync(0, "utf8"))))}\n`); } catch (error) { process.stderr.write(`${error.code ?? "oracle-assay-refusal"}: ${error.message}\n`); process.exitCode = 1; }
