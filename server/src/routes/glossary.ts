import { Router } from "express";
import { readGlossary, addGlossaryTerm, removeGlossaryTerm } from "../lib/glossary.js";

export const glossaryRouter = Router();

glossaryRouter.get("/", (_req, res) => {
  res.json({ terms: readGlossary() });
});

glossaryRouter.post("/", (req, res) => {
  const { term } = req.body ?? {};
  if (typeof term !== "string" || !term.trim()) {
    return res.status(400).json({ error: "term is required" });
  }
  res.json({ terms: addGlossaryTerm(term) });
});

glossaryRouter.delete("/:term", (req, res) => {
  res.json({ terms: removeGlossaryTerm(decodeURIComponent(req.params.term)) });
});
