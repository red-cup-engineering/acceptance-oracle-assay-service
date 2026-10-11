import { randomUUID } from "node:crypto";
import { Message, Role } from "@a2a-js/sdk";
import { a2aResultParts, sendRmnTask } from "@red-cup-engineering/a2a-rmn-task-client-service";
import { extractRmnPart, rmnPart } from "@red-cup-engineering/a2a-rmn-part-service";
import { decodeReceipt, encodeRequest } from "./protocol.mjs";
import { SOVEREIGN_CIRCUIT_INTERFACE_EXTENSION, providerAccountFromAgentCard } from "./sovereign-provider.mjs";
export const ACCEPTANCE_ORACLE_ASSAY_AGENT_CARD_URL = process.env.ACCEPTANCE_ORACLE_ASSAY_AGENT_CARD_URL
  ?? "https://bare-cedar-fog.561.group/a2a/acceptance-oracle-assay/.well-known/agent-card.json";
export async function requestAcceptanceOracleAssay({ agentUrl = ACCEPTANCE_ORACLE_ASSAY_AGENT_CARD_URL, manifest, oracle, signal, send = sendRmnTask }) {
  if (typeof agentUrl !== "string" || !/^https?:\/\//u.test(agentUrl)) throw new Error("acceptance-oracle assay requires one absolute A2A Agent Card URL");
  const request = encodeRequest({ kind: "AcceptanceOracleAssayRequest", manifest, oracle }), subject = request.id;
  const message = Message.toJSON({ messageId: randomUUID(), contextId: "", taskId: "", role: Role.ROLE_USER, parts: [rmnPart(request.bytes, "acceptance-oracle-assay-request.rmn.cbor")], metadata: {}, extensions: [], referenceTaskIds: [] });
  const exchange = await send({ agentUrl, extensions: [SOVEREIGN_CIRCUIT_INTERFACE_EXTENSION], requireSignature: true, message, ...(signal ? { signal } : {}) });
  const output = extractRmnPart(a2aResultParts(exchange.result)), decoded = decodeReceipt(output.bytes), receipt = decoded.receipt, provider = providerAccountFromAgentCard(exchange.agentCard);
  if (receipt.provider !== provider || receipt.subject !== subject) throw new Error("oracle assay receipt does not bind the contracted face and exact subject");
  return { receipt, assay: receipt.assay, receiptNi: decoded.semanticId, exchange };
}
