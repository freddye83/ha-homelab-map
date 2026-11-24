load(H + "/harness.js");
loadString(readFile(CARD).replace(/import\.meta\.url/g, '"file:///x.js"'));
customElements.get = (name) => Cards[name];
// the editor is an ES module: run it in its own scope and keep what it exports
const source = readFile(CARD.replace(/ha-homelab-map\.js$/, "ha-homelab-map-editor.js"));
const exported = [...source.matchAll(/^export (?:const|class|function\*?) (\w+)/gm)].map((m) => m[1]);
loadString(`globalThis.ED = (() => {\n${source.replace(/^export /gm, "")}\nreturn { ${exported.join(", ")} };\n})();`);

const kit = Cards["ha-homelab-map"].editorKit;
let failed = 0;
const check = (ok, name, detail = "") => {
  if (!ok) failed++;
  print(ok ? `ok   ${name}` : `FAIL ${name}${detail ? `: ${detail}` : ""}`);
};
const valid = (config) => {
  try {
    kit.validateConfig(config);
    return "";
  } catch (error) {
    return String(error.message);
  }
};

check(kit.version === Cards["ha-homelab-map"].version, "editorKit carries the card version");
check(
  ["placeItems", "edgeAnchor", "roundedPath", "validateConfig"].every((f) => typeof kit[f] === "function"),
  "editorKit exposes the card's geometry and validation",
);
check(Object.isFrozen(kit), "editorKit is frozen");

// every default the editor uses for a new item is accepted by the card, in a parent that allows it
for (const type of Object.keys(kit.ITEM_KEYS)) {
  const item = { type, id: `new_${type}`, ...JSON.parse(JSON.stringify(ED.NEW_ITEM[type])) };
  const parentType = Object.keys(kit.CHILD_TYPES).find((p) => kit.CHILD_TYPES[p].includes(type));
  let config;
  if (type === "port") config = { items: [{ type: "ports", id: "p", at: [0, 0], items: [{ ...item, at: [0, 0] }] }] };
  else if (type === "rackdevice" || type === "fanpanel") {
    const rack = { type: "rack", id: "r", at: [0, 0], units: 6, items: [] };
    item.u = ED.freeUnit(rack, item.units);
    rack.items.push(item);
    config = { items: [rack] };
  } else if (type === "ports") config = { items: [{ ...item, at: [0, 0], items: [{ type: "port", id: "p1", at: [0, 0], state: "active" }] }] };
  else config = { items: [{ ...item, at: [0, 0] }] };
  const error = valid(config);
  check(!error, `a new ${type} (allowed in ${parentType}) is valid`, error);
}

// the forms only offer keys the card accepts, and every accepted key is editable
const config = { vlans: { LAN: "#6c9cda" }, items: [{ type: "group", id: "g", at: [0, 0], items: [] }] };
const fieldKeys = (schema) => schema.flatMap((f) => (f.schema ? fieldKeys(f.schema) : [f.name]));
const PAIRS = { at_x: "at", at_y: "at", size_w: "size", size_h: "size" };
for (const type of Object.keys(kit.ITEM_KEYS)) {
  const names = [...new Set(fieldKeys(ED.itemSchema(type, config, { objectRefs: new Set() })).map((k) => PAIRS[k] ?? k))];
  const allowed = kit.ITEM_KEYS[type].filter((k) => k !== "type" && k !== "items");
  const extra = names.filter((k) => !allowed.includes(k));
  const missing = allowed.filter((k) => !names.includes(k));
  check(!extra.length && !missing.length, `the ${type} form covers exactly its keys`, `extra ${extra} missing ${missing}`);
}
for (const [kind, keys] of [["data", kit.DATALINE_KEYS], ["power", kit.LINE_KEYS]]) {
  const names = ED.lineSchema(kind, config).map((f) => f.name);
  check(names.length === keys.length && names.every((k) => keys.includes(k)), `the ${kind} cable form covers exactly its keys`);
}

// rack units
const rack = { type: "rack", id: "r", units: 6, items: [{ type: "rackdevice", id: "a", u: 1 }, { type: "rackdevice", id: "b", u: 2, units: 2 }] };
check(ED.freeUnit(rack, 1) === 4, "freeUnit finds the first free unit", ED.freeUnit(rack, 1));
check(ED.freeUnit(rack, 3) === 4, "freeUnit fits a 3U device", ED.freeUnit(rack, 3));
check(ED.freeUnit(rack, 4) === null, "freeUnit reports a full rack");
check(ED.freeUnit(rack, 0.5, rack.items[0]) === 1, "freeUnit ignores the device being moved");

// anchors
const box = { x: 100, y: 100, w: 200, h: 50 };
check(JSON.stringify(ED.anchorFor(box, [299, 112])) === '{"edge":"right","point":25}', "anchorFor picks the nearest edge and rounds the position");
check(JSON.stringify(ED.anchorFor(box, [150, 98])) === '{"edge":"top","point":25}', "anchorFor works on horizontal edges");

// ids
const map = {
  items: [{ type: "device", id: "nas", at: [0, 0], size: [10, 10] }, { type: "badge", id: "b", at: [0, 0], entity: "sun.sun", icon: "none", toggle: "g" }, {
    type: "group",
    id: "g",
    at: [0, 0],
    items: [],
  }],
  datalines: [{ id: "l", start_device: "nas", start_edge: "left", end_device: "nas", end_edge: "right" }],
};
check(ED.uniqueId(map, "nas") === "nas_2" && ED.uniqueId(map, "router") === "router", "uniqueId keeps ids unique across items and lines");
ED.renameId(map, "nas", "storage");
ED.renameId(map, "g", "group1");
check(
  map.datalines[0].start_device === "storage" && map.datalines[0].end_device === "storage" && map.items[1].toggle === "group1",
  "renameId follows lines and toggles",
);
ED.dropReferences(map, new Set(["storage", "group1"]));
check(map.datalines === undefined && map.items[1].toggle === undefined, "dropReferences removes the lines and toggles of deleted items");

print(failed ? `FAILED ${failed}` : "ALL PASSED");
