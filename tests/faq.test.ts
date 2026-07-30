import { describe, expect, it } from "vitest";
import { modelFaq } from "../src/data/faq.js";
import { loadAllModels } from "../src/data/load.js";
import { model, TODAY } from "./helpers.js";

const successor = model({
  model: "gpt-4o",
  name: "GPT-4o",
  status: "active",
  deprecated_on: undefined,
  shutdown_on: undefined,
});

function questions(entry = model(), catalog = [model(), successor]): string[] {
  return modelFaq(entry, catalog, TODAY).map((faq) => faq.question);
}

describe("modelFaq", () => {
  it("asks the questions people actually type", () => {
    const asked = questions();
    expect(asked[0]).toBe("When did OpenAI GPT-4 32k shut down?");
    expect(asked).toContain("Is OpenAI GPT-4 32k still available?");
  });

  it("puts the shutdown question first for a model that is going away", () => {
    const deprecated = model({ shutdown_on: "2026-10-23", status: "deprecated" });
    expect(questions(deprecated)[0]).toBe("When will OpenAI GPT-4 32k shut down?");
  });

  it("adds replacement and migration questions when a successor is named", () => {
    const withSuccessor = model({
      replacements: [{ provider: "openai", model: "gpt-4o", recommended: true, external: false }],
    });
    const asked = questions(withSuccessor);
    expect(asked).toContain("What replaces OpenAI GPT-4 32k?");
    expect(asked).toContain("How do I migrate from OpenAI GPT-4 32k to gpt-4o?");
  });

  it("answers the availability question with a flat no once a model is retired", () => {
    const availability = modelFaq(model(), [model()], TODAY).find((faq) =>
      faq.question.includes("still available"),
    )!;
    expect(availability.answer.startsWith("No.")).toBe(true);
    expect(availability.answer).toContain("Calls to it return an error.");
  });

  it("answers with a qualified yes while a model is deprecated but alive", () => {
    const deprecated = model({ shutdown_on: "2026-10-23", status: "deprecated" });
    const faqs = modelFaq(deprecated, [deprecated], TODAY);
    const availability = faqs.find((faq) => faq.question.includes("still available"))!;
    expect(availability.answer.startsWith("Yes, for now.")).toBe(true);
    expect(availability.answer).toContain("until October 23, 2026");
  });

  // The hedge matters: presenting an earliest-possible date as a commitment is
  // the failure mode that would cost this site its credibility.
  it("hedges a soft shutdown date in the answer", () => {
    const soft = model({
      shutdown_on: undefined,
      deprecated_on: undefined,
      earliest_shutdown_on: "2026-10-16",
      status: "active",
    });
    const shutdown = modelFaq(soft, [soft], TODAY).find((faq) =>
      faq.question.includes("shut down"),
    )!;
    expect(shutdown.answer).toContain(
      "earliest possible retirement date rather than a firm commitment",
    );
  });

  it("answers the alias question so a dated id resolves the same way", () => {
    const aliased = model({ aliases: ["gpt-4-32k-0613", "gpt-4-32k-0314"] });
    const alias = modelFaq(aliased, [aliased], TODAY).find((faq) =>
      faq.question.startsWith("Does this apply"),
    )!;
    expect(alias.answer).toContain("those ids share");
    expect(alias.answer).toContain("gpt-4-32k-0613");
  });

  it("caps at five questions", () => {
    const busy = model({
      aliases: ["a", "b"],
      shutdown_on: "2026-10-23",
      status: "deprecated",
      replacements: [{ provider: "openai", model: "gpt-4o", recommended: true, external: false }],
    });
    expect(modelFaq(busy, [busy, successor], TODAY).length).toBeLessThanOrEqual(5);
  });

  it("gives every real model at least one answerable question", async () => {
    const { models } = await loadAllModels();
    for (const entry of models) {
      const faqs = modelFaq(entry, models, TODAY);
      expect(faqs.length).toBeGreaterThan(0);
      for (const faq of faqs) {
        expect(faq.question.endsWith("?")).toBe(true);
        expect(faq.answer.length).toBeGreaterThan(20);
      }
    }
  });

  it("never asks the same question twice on one page", async () => {
    const { models } = await loadAllModels();
    for (const entry of models) {
      const asked = modelFaq(entry, models, TODAY).map((faq) => faq.question);
      expect(new Set(asked).size).toBe(asked.length);
    }
  });
});
