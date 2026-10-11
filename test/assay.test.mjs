import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Message, Role } from "@a2a-js/sdk";
import { rmnPart } from "@red-cup-engineering/a2a-rmn-part-service";
import { assayAcceptanceOracle } from "../src/assay.mjs";
import { ACCEPTANCE_ORACLE_ASSAY_AGENT_CARD_URL, requestAcceptanceOracleAssay } from "../src/client.mjs";
import { performAssay } from "../src/protocol.mjs";

function sha256(value) { return `sha256:${createHash("sha256").update(value).digest("hex")}`; }
function evidence(path, text) { return { path, text, digest: sha256(text), bytes: Buffer.byteLength(text) }; }
function input() {
  const source = evidence("calc.mjs", "export const add = (a,b) => a-b");
  const artifact = evidence("union-acceptance/add.test.mjs", "test('addition-vector',()=>assert.equal(add(2,3),5))");
  const output = "not ok addition-vector";
  return {
    manifest: { id: "urn:test:oracle", testVectors: [{ id: "addition-vector", given: ["two and three"], when: "add is invoked", then: ["five"], forbidden: ["subtraction"] }], sourceEvidence: [source] },
    oracle: { artifacts: [artifact], redWitness: { passed: false, output, outputDigest: sha256(output), executedVectorIds: ["addition-vector"] } },
  };
}

test("the assay binds exact material measures and the red witness without dispatching a reviewer", () => {
  const result = assayAcceptanceOracle(input());
  assert.equal(result.accepted, true);
  assert.deepEqual(result.sourceEvidence, [{ path: "calc.mjs", digest: sha256("export const add = (a,b) => a-b"), bytes: 31 }]);
  assert.deepEqual(result.testVectorIds, ["addition-vector"]);
  assert.equal(result.redWitness.outputBytes, Buffer.byteLength("not ok addition-vector"));
  assert.equal("text" in result.oracleArtifacts[0], false);
});

test("source evidence projects the carrier byte measure rather than a Unicode text projection length", () => {
  const request = input();
  request.manifest.sourceEvidence = [{
    path: "calc.mjs",
    digest: sha256("éx"),
    bytes: Buffer.byteLength("éx"),
    text: "é",
  }];
  const result = assayAcceptanceOracle(request);
  assert.equal(result.accepted, true);
  assert.deepEqual(result.sourceEvidence, [{ path: "calc.mjs", digest: sha256("éx"), bytes: 3 }]);
});

test("the assay does not turn an incomplete red witness into a behavioral claim", () => {
  const request = input();
  request.oracle.redWitness.executedVectorIds = [];
  const result = assayAcceptanceOracle(request);
  assert.equal(result.accepted, false);
  assert.deepEqual(result.failures, ["red-execution-vector-coverage-mismatch"]);
});

test("the Actor-facing client defaults to the Agent Card projected by its FOAM locus", async () => {
  const locus = JSON.parse(readFileSync(new URL("../content/foam/locus.json", import.meta.url), "utf8"));
  const agentCard = JSON.parse(readFileSync(new URL("../content/agent-cards/acceptance-oracle-assay-service.json", import.meta.url), "utf8"));
  const offer = JSON.parse(readFileSync(new URL("../content/offers/current.json", import.meta.url), "utf8"));
  let observedUrl;
  const request = input();
  const result = await requestAcceptanceOracleAssay({
    ...request,
    send: async ({ agentUrl, message }) => {
      observedUrl = agentUrl;
      const assay = await performAssay({ kind: "AcceptanceOracleAssayRequest", ...request });
      return {
        result: Message.fromJSON(Message.toJSON({
          messageId: "00000000-0000-4000-8000-000000000092",
          contextId: "",
          taskId: "",
          role: Role.ROLE_AGENT,
          parts: [rmnPart(assay.canonicalBytes, "acceptance-oracle-assay-receipt.rmn.cbor")],
          metadata: {},
          extensions: [],
          referenceTaskIds: [],
        })),
        agentCard,
      };
    },
  });
  assert.equal(observedUrl, ACCEPTANCE_ORACLE_ASSAY_AGENT_CARD_URL);
  assert.equal(observedUrl, locus.messageFace);
  assert.equal(observedUrl, offer.callable);
  assert.equal(offer.seller, locus.actor);
  assert.equal(offer.operation, locus.operation);
  assert.equal(agentCard.skills.some(({ id }) => id === locus.operation), true);
  assert.equal(result.assay.accepted, true);
});

test("deployment retains a loopback listener while the signed Agent Card advertises its public face", () => {
  const unit = readFileSync(new URL("../ops/systemd/acceptance-oracle-assay-service.service", import.meta.url), "utf8");
  assert.match(unit, /^Environment=HOST=127\.0\.0\.1$/mu);
  assert.match(unit, /^Environment=PORT=19845$/mu);
  assert.match(unit, /^Environment=BASE_URL=https:\/\/bare-cedar-fog\.561\.group\/a2a\/acceptance-oracle-assay$/mu);
});

test("the client preserves refusal of a non-Actor-facing address", async () => {
  await assert.rejects(
    requestAcceptanceOracleAssay({ ...input(), agentUrl: "not-an-agent-card", send: async () => assert.fail("must not dispatch") }),
    /absolute A2A Agent Card URL/u,
  );
});
