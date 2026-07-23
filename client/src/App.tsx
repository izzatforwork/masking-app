import { useState } from "react";
import MaskFlow from "./components/MaskFlow";
import UnmaskFlow from "./components/UnmaskFlow";

function App() {
  const [tab, setTab] = useState<"mask" | "unmask">("mask");

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 24, fontFamily: "sans-serif" }}>
      <h1>masking-app</h1>
      <p style={{ color: "#555" }}>
        Fully local. No document content, real values, or the decryption key/passphrase ever leaves this
        machine.
      </p>
      <div style={{ marginBottom: 16 }}>
        <button onClick={() => setTab("mask")} disabled={tab === "mask"}>
          Mask a document
        </button>{" "}
        <button onClick={() => setTab("unmask")} disabled={tab === "unmask"}>
          Unmask a result
        </button>
      </div>
      {tab === "mask" ? <MaskFlow /> : <UnmaskFlow />}
    </div>
  );
}

export default App;
