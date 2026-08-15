import { useMemo, useState } from "react";
import { Widget } from "@/components/widget";
import { decodeJwt, isExpired, relativeFromNow } from "@/lib/jwt";

const TIME_CLAIMS = [
  ["exp", "Expires"],
  ["nbf", "Not before"],
  ["iat", "Issued at"],
] as const;

export function JwtDecoder({ id }: { id: number }) {
  const [txtToken, setToken] = useState("");

  const decoded = useMemo(
    () => (txtToken.trim() === "" ? null : decodeJwt(txtToken)),
    [txtToken],
  );

  const invalid = txtToken.trim() !== "" && decoded === null;
  // Read once per render rather than per claim, so every row agrees.
  const nowMs = Date.now();
  const alg =
    typeof decoded?.header.alg === "string" ? decoded.header.alg : null;
  const expired = decoded !== null && isExpired(decoded.payload, nowMs);

  const claims = TIME_CLAIMS.flatMap(([claim, label]) => {
    const value = decoded?.payload[claim];
    // A non-finite claim (e.g. exp:1e400, which JSON.parse turns into
    // Infinity) is treated as absent rather than rendered -- relativeFromNow
    // guards too, but excluding it here also keeps the row from appearing
    // with a value nobody asked for.
    if (typeof value !== "number" || !Number.isFinite(value)) return [];
    return [
      {
        claim,
        label,
        absolute: new Date(value * 1000).toLocaleString(),
        relative: relativeFromNow(value, nowMs),
      },
    ];
  });

  return (
    <Widget windowID={id} initialHeight={560} initialWidth={640}>
      <Widget.Title>JWT Decoder</Widget.Title>
      <Widget.Body className="flex flex-col gap-1 lg:gap-4 pb-2 lg:pb-4">
        <div className="field-row-stacked grow-0">
          <label htmlFor="txt_jwt">Token</label>
          <textarea
            className="h-24 font-mono text-xs"
            id="txt_jwt"
            value={txtToken}
            onChange={(e) => setToken(e.target.value)}
          ></textarea>
        </div>
        <div className="grid grid-cols-2 gap-1 lg:gap-4 grow min-h-0">
          <div className="field-row-stacked">
            <label htmlFor="txt_jwt_header">Header</label>
            <textarea
              className="h-full w-full"
              id="txt_jwt_header"
              readOnly={true}
              value={decoded ? JSON.stringify(decoded.header, null, 2) : ""}
            ></textarea>
          </div>
          <div className="field-row-stacked">
            <label htmlFor="txt_jwt_payload">Payload</label>
            <textarea
              className="h-full w-full"
              id="txt_jwt_payload"
              readOnly={true}
              value={decoded ? JSON.stringify(decoded.payload, null, 2) : ""}
            ></textarea>
          </div>
        </div>
        {claims.length > 0 && (
          <ul className="grow-0 m-0 pl-5">
            {claims.map((c) => (
              <li key={c.claim}>
                {c.label}: {c.absolute} ({c.relative})
              </li>
            ))}
          </ul>
        )}
        {decoded && (
          <div className="field-row-stacked grow-0">
            <label htmlFor="txt_jwt_signature">Signature (not verified)</label>
            <input
              id="txt_jwt_signature"
              type="text"
              readOnly={true}
              value={decoded.signature}
            />
          </div>
        )}
      </Widget.Body>
      {/* U+00A0 holds each row's height when there's nothing to report. */}
      <Widget.Status>{alg ? `alg: ${alg}` : " "}</Widget.Status>
      <Widget.Status>
        <span className="text-red-500">
          {invalid ? "Not a valid JWT." : expired ? "Token has expired." : " "}
        </span>
      </Widget.Status>
    </Widget>
  );
}
