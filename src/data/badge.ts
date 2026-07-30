// shields.io endpoint JSON, one file per model.
//
//   ![](https://img.shields.io/endpoint?url=https://modeldeprecations.dev/badge/openai/gpt-4-32k.json)
//
// A README badge that turns red the day a model is retired is worth more to a
// maintainer than a link, and every one of them is a link back here.

import { statusOn, type Model, type Status } from "../schema/model.js";
import { lifecycle } from "./status.js";

export interface Badge {
  schemaVersion: 1;
  label: string;
  message: string;
  color: string;
}

/** Green while it works, amber once deprecated, red once it is gone. */
const COLORS: Record<Status, string> = {
  active: "brightgreen",
  deprecated: "orange",
  retired: "red",
};

export function buildBadge(model: Model, today: string): Badge {
  const life = lifecycle(model, today);
  const status = statusOn(model, today);
  const message = status === "active" && life.shutdown ? `active until ${life.shutdown}` : status;
  return {
    schemaVersion: 1,
    label: model.model,
    message,
    color: status === "active" && life.shutdown ? "yellowgreen" : COLORS[status],
  };
}
