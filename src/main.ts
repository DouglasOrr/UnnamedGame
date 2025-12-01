import * as A from "./core/achievements";
import { Items } from "./core/items";
import * as R from "./core/run";
import "./core/sound";
import * as V from "./core/view";
import "./static/style.css";
import * as W from "./core/wave";

window.onload = () => {
  A.setItemsAndLevels(Items, R.Levels);
  const params = new URLSearchParams(window.location.search);
  if (params.get("dev") === "true") {
    W.setDevMode(true);
  }
  V.start({
    skipTo: null,
    // skipTo: "introduction",
    // skipTo: { level: "level_0" },
    // skipTo: "achievements",
    // skipTo: "settings",
  });
};
