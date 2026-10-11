import { createHash } from "node:crypto";

function sha256(value) { return `sha256:${createHash("sha256").update(value).digest("hex")}`; }
function exactDigest(value) { return typeof value === "string" && /^sha256:[a-f0-9]{64}$/u.test(value); }

function measuredEntries(entries, label, { requireText = false } = {}) {
  const seen = new Set(), failures = [];
  const values = Array.isArray(entries) ? entries : [];
  if (values.length === 0) failures.push(`${label}-absent`);
  const measures = values.map((entry, index) => {
    const path = typeof entry?.path === "string" ? entry.path : "";
    const digest = entry?.digest;
    const bytes = entry?.bytes;
    if (!path || seen.has(path)) failures.push(`${label}-${index + 1}-path`);
    seen.add(path);
    if (!exactDigest(digest)) failures.push(`${label}-${index + 1}-digest`);
    if (!Number.isSafeInteger(bytes) || bytes < 0) failures.push(`${label}-${index + 1}-bytes`);
    if (requireText) {
      if (typeof entry?.text !== "string") failures.push(`${label}-${index + 1}-text`);
      else if (Buffer.byteLength(entry.text) !== bytes || sha256(entry.text) !== digest) failures.push(`${label}-${index + 1}-content-does-not-bind-measure`);
    }
    return { path, digest, bytes };
  });
  return { measures, failures };
}

function vectorIds(vectors) {
  const ids = Array.isArray(vectors) ? vectors.map((vector) => vector?.id) : [];
  const failures = [];
  if (ids.length === 0) failures.push("test-vectors-absent");
  if (ids.some((id) => typeof id !== "string" || !id)) failures.push("test-vector-id-invalid");
  if (new Set(ids).size !== ids.length) failures.push("test-vector-id-duplicate");
  return { ids, failures };
}

function redWitness(witness, ids) {
  const failures = [];
  if (witness?.passed !== false) failures.push("red-execution-not-failed");
  if (typeof witness?.output !== "string" || !witness.output) failures.push("red-execution-output-absent");
  else if (!exactDigest(witness.outputDigest) || sha256(witness.output) !== witness.outputDigest) failures.push("red-execution-output-does-not-bind-digest");
  const executed = Array.isArray(witness?.executedVectorIds) ? witness.executedVectorIds : [];
  if (executed.length !== ids.length || new Set(executed).size !== ids.length || ids.some((id) => !executed.includes(id))) failures.push("red-execution-vector-coverage-mismatch");
  return { witness: { failedAsRequired: witness?.passed === false, outputDigest: witness?.outputDigest ?? null, outputBytes: typeof witness?.output === "string" ? Buffer.byteLength(witness.output) : null, executedVectorIds: executed }, failures };
}

export function assayAcceptanceOracle({ manifest, oracle }) {
  const source = measuredEntries(manifest.sourceEvidence, "source-evidence");
  const artifacts = measuredEntries(oracle.artifacts, "oracle-artifact", { requireText: true });
  const vectors = vectorIds(manifest.testVectors);
  const witness = redWitness(oracle.redWitness, vectors.ids);
  const failures = [...source.failures, ...artifacts.failures, ...vectors.failures, ...witness.failures];
  return {
    type: "AcceptanceOracleAssay",
    accepted: failures.length === 0,
    sourceEvidence: source.measures,
    oracleArtifacts: artifacts.measures,
    testVectorIds: vectors.ids,
    redWitness: witness.witness,
    failures,
  };
}
