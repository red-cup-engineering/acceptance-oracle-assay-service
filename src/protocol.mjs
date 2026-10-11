import { EMPTY_WITNESS_ROOT, admitJsonSemanticContent, identifyJsonSemanticContent } from "@red-cup-engineering/semantic-content-identify-service";
import { assayAcceptanceOracle } from "./assay.mjs";
export const PROFILE = "org.emsenn.software.acceptance-oracle-assay.v2";
export const PROVIDER_ACCOUNT = "eip155:31337:0x35715b8765d0ae4a623b9ac7eb7edea6e5e77450";
function exact(value, keys) { return value && Object.getPrototypeOf(value) === Object.prototype && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0"); }
const REQUEST_KIND = "acceptance-oracle-assay.request", RECEIPT_KIND = "acceptance-oracle-assay.receipt";
function identify(value, objectKind) { return identifyJsonSemanticContent({ objectKind, value, witnessRoot: EMPTY_WITNESS_ROOT }); }
function admit(bytes, objectKind) { const identity = admitJsonSemanticContent({ bytes, objectKind }); return { identity, value: identity.value }; }
export function normalizeRequest(value) {
  if (!exact(value, ["kind", "manifest", "oracle"]) || value.kind !== "AcceptanceOracleAssayRequest") throw new Error("oracle assay request has an unknown, absent, or legacy field");
  if (!value.manifest || !value.oracle || !Array.isArray(value.manifest.testVectors) || !Array.isArray(value.manifest.sourceEvidence) || !Array.isArray(value.oracle.artifacts) || !value.oracle.redWitness) throw new Error("oracle assay request is incomplete");
  return value;
}
export function encodeRequest(value) { const normalized = normalizeRequest(value), identity = identify(normalized, REQUEST_KIND); return { value: normalized, ...identity }; }
export function decodeRequest(bytes) { return normalizeRequest(admit(bytes, REQUEST_KIND).value); }
export async function performAssay(value) { const request = normalizeRequest(value), subject = identify(request, REQUEST_KIND).id, assay = assayAcceptanceOracle(request); const receipt = { kind: "AcceptanceOracleAssayReceipt", profile: PROFILE, provider: PROVIDER_ACCOUNT, subject, assay }, document = identify(receipt, RECEIPT_KIND); return { receipt, semanticId: document.id, canonicalBytes: document.bytes }; }
export function decodeReceipt(bytes) { const { identity, value } = admit(bytes, RECEIPT_KIND); if (!exact(value, ["assay", "kind", "profile", "provider", "subject"]) || value.kind !== "AcceptanceOracleAssayReceipt" || value.profile !== PROFILE || value.provider !== PROVIDER_ACCOUNT || typeof value.assay?.accepted !== "boolean") throw new Error("oracle assay receipt is malformed or foreign"); return { receipt: value, semanticId: identity.id }; }
