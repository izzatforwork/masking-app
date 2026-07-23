import express from "express";
import cors from "cors";
import { glossaryRouter } from "./routes/glossary.js";
import { maskRouter } from "./routes/mask.js";
import { unmaskRouter } from "./routes/unmask.js";

const app = express();
// exposedHeaders is required: cross-origin fetch() can't read custom response
// headers (X-Masked-Item-Count) unless the server explicitly allows it.
app.use(cors({ exposedHeaders: ["X-Masked-Item-Count"] }));
app.use(express.json({ limit: "20mb" }));

app.use("/api/glossary", glossaryRouter);
app.use("/api/mask", maskRouter);
app.use("/api/unmask", unmaskRouter);

app.get("/api/health", (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
app.listen(PORT, () => {
  console.log(`masking-app server listening on http://localhost:${PORT}`);
});
