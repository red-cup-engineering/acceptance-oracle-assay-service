import { createHash } from "node:crypto";

function sha256(value) { return `sha256:${createHash("sha256").update(value).digest("hex")}`; }
function exactDigest(value) { return typeof value === "string" && /^sha256:[a-f0-9]{64}$/u.test(value); }

// All evidence operations consume one inert source cut. A caller's accessor,
// inherited field, or decorated Array cannot change a witness between its
// admission check and the acceptance projection. Transport still authenticates
// bytes/identity separately; this only refuses executable in-process records.
function ownData(record, key) {
  if (!record || typeof record !== "object") return undefined;
  const proto = Object.getPrototypeOf(record);
  if (proto !== Object.prototype && proto !== null) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  return descriptor && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined;
}

function denseDataArray(input) {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype || input.length > 10000) return [];
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (Reflect.ownKeys(descriptors).length !== input.length + 1) return [];
  const values = [];
  for (let i = 0; i < input.length; i++) {
    const descriptor = descriptors[i];
    if (!descriptor || !Object.hasOwn(descriptor, "value") || !descriptor.enumerable) return [];
    values.push(descriptor.value);
  }
  return values;
}

function measuredEntries(entries, label, { requireText = false } = {}) {
  const seen = new Set(), failures = [];
  const values = denseDataArray(entries);
  if (values.length === 0) failures.push(`${label}-absent`);
  const measures = values.map((entry, index) => {
    const sourcePath = ownData(entry, "path");
    const path = typeof sourcePath === "string" ? sourcePath : "";
    const digest = ownData(entry, "digest");
    const bytes = ownData(entry, "bytes");
    if (!path || seen.has(path)) failures.push(`${label}-${index + 1}-path`);
    seen.add(path);
    if (!exactDigest(digest)) failures.push(`${label}-${index + 1}-digest`);
    if (!Number.isSafeInteger(bytes) || bytes < 0) failures.push(`${label}-${index + 1}-bytes`);
    if (requireText) {
      const content = ownData(entry, "text");
      if (typeof content !== "string") failures.push(`${label}-${index + 1}-text`);
      else if (Buffer.byteLength(content) !== bytes || sha256(content) !== digest) failures.push(`${label}-${index + 1}-content-does-not-bind-measure`);
    }
    return { path, digest, bytes };
  });
  return { measures, failures };
}

function vectorIds(vectors) {
  const ids = denseDataArray(vectors).map((vector) => ownData(vector, "id"));
  const failures = [];
  if (ids.length === 0) failures.push("test-vectors-absent");
  if (ids.some((id) => typeof id !== "string" || !id)) failures.push("test-vector-id-invalid");
  if (new Set(ids).size !== ids.length) failures.push("test-vector-id-duplicate");
  return { ids, failures };
}

function redWitness(witness, ids) {
  const failures = [];
  const passed = ownData(witness, "passed");
  const output = ownData(witness, "output");
  const outputDigest = ownData(witness, "outputDigest");
  const executed = denseDataArray(ownData(witness, "executedVectorIds"));
  if (passed !== false) failures.push("red-execution-not-failed");
  if (typeof output !== "string" || !output) failures.push("red-execution-output-absent");
  else if (!exactDigest(outputDigest) || sha256(output) !== outputDigest) failures.push("red-execution-output-does-not-bind-digest");
  if (executed.length !== ids.length || new Set(executed).size !== ids.length || ids.some((id) => !executed.includes(id))) failures.push("red-execution-vector-coverage-mismatch");
  return { witness: { failedAsRequired: passed === false, outputDigest: outputDigest ?? null, outputBytes: typeof output === "string" ? Buffer.byteLength(output) : null, executedVectorIds: executed }, failures };
}

export function assayAcceptanceOracle(request) {
  const manifest = ownData(request, "manifest");
  const oracle = ownData(request, "oracle");
  const source = measuredEntries(ownData(manifest, "sourceEvidence"), "source-evidence");
  const artifacts = measuredEntries(ownData(oracle, "artifacts"), "oracle-artifact", { requireText: true });
  const vectors = vectorIds(ownData(manifest, "testVectors"));
  const witness = redWitness(ownData(oracle, "redWitness"), vectors.ids);
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
