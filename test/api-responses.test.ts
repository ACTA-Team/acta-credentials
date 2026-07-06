import {
  isTxPrepareResponse,
  isTxSubmitResponse,
  type TxResponse,
} from "../src/types/api-responses";

describe("TxResponse type guards", () => {
  it("isTxPrepareResponse detects a prepare response", () => {
    const prep: TxResponse = { xdr: "AAA", network: "Test SDF Network" };
    expect(isTxPrepareResponse(prep)).toBe(true);
    expect(isTxSubmitResponse(prep)).toBe(false);
  });

  it("isTxSubmitResponse detects a submit response", () => {
    const sub: TxResponse = { tx_id: "abc123" };
    expect(isTxSubmitResponse(sub)).toBe(true);
    expect(isTxPrepareResponse(sub)).toBe(false);
  });
});
