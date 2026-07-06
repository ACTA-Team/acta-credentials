import { ActaApiError, normalizeError } from "../src/errors";

describe("normalizeError", () => {
  it("maps an API error response to code/message/requestId", () => {
    const axiosErr = {
      isAxiosError: true,
      message: "Request failed with status code 409",
      response: {
        status: 409,
        data: { error: "vc_already_exists", message: "VC exists", request_id: "req-1" },
      },
    };
    const e = normalizeError(axiosErr);
    expect(e).toBeInstanceOf(ActaApiError);
    expect(e.status).toBe(409);
    expect(e.code).toBe("vc_already_exists");
    expect(e.message).toBe("VC exists");
    expect(e.requestId).toBe("req-1");
    expect(e.isTimeout).toBe(false);
  });

  it("flags a timeout", () => {
    const e = normalizeError({ code: "ECONNABORTED", message: "timeout of 30000ms exceeded" });
    expect(e.status).toBe(0);
    expect(e.code).toBe("timeout");
    expect(e.isTimeout).toBe(true);
  });

  it("flags a network error (no response)", () => {
    const e = normalizeError({ message: "Network Error" });
    expect(e.code).toBe("network_error");
    expect(e.isNetworkError).toBe(true);
  });

  it("passes an existing ActaApiError through unchanged", () => {
    const original = new ActaApiError({ status: 400, code: "bad", message: "bad" });
    expect(normalizeError(original)).toBe(original);
  });

  it("synthesizes a code when the body has none", () => {
    const e = normalizeError({ response: { status: 500, data: {} } });
    expect(e.status).toBe(500);
    expect(e.code).toBe("http_500");
  });
});
