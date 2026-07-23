import { useState } from "react";
import "./App.css";
import MaskFlow from "./components/MaskFlow";
import UnmaskFlow from "./components/UnmaskFlow";

function App() {
  const [tab, setTab] = useState<"mask" | "unmask">("mask");

  return (
    <div className="shell">
      <header className="shell-header">
        <h1>masking-app</h1>
        <p className="subtitle">
          Fully local. No document content or real values ever leave this machine.
        </p>
        <div className="tabs">
          <button
            className={tab === "mask" ? "active" : ""}
            onClick={() => setTab("mask")}
          >
            Mask a document
          </button>
          <button
            className={tab === "unmask" ? "active" : ""}
            onClick={() => setTab("unmask")}
          >
            Unmask a result
          </button>
        </div>
      </header>
      {tab === "mask" ? <MaskFlow /> : <UnmaskFlow />}
    </div>
  );
}

export default App;
