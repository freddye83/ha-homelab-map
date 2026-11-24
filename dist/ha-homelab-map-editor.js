// Visual editor for ha-homelab-map. Loaded on demand by HaHomelabMap.getConfigElement().
// The YAML stays the source of truth: the editor only writes keys the card accepts, and it places, validates
// and connects items with the card's own functions (HaHomelabMap.editorKit).

const CARD_TYPE = "ha-homelab-map";
const EDITOR_TYPE = `${CARD_TYPE}-editor`;
const SVG_NS = "http://www.w3.org/2000/svg";
const HISTORY = 100;
const SNAPS = [1, 5, 10];
const ZOOMS = ["fit", 0.5, 0.75, 1, 1.5, 2];
const HANDLE = 5;
const MIN_HIT = 6;

// Sizes that are a [w, h] pair; the other item sizes are a single number.
const PAIR_SIZE = ["device", "pool", "hdd", "ssd", "bay", "led"];
// Items resized with the handle: pair sizes, square sizes (chip, fan) and rack units.
const SQUARE_SIZE = ["chip", "fan"];
const UNIT_TYPES = ["rackdevice", "fanpanel"];
const RESIZABLE = [...PAIR_SIZE, ...SQUARE_SIZE, "rack", ...UNIT_TYPES];

// Defaults for new items. Each one passes the card's validation on its own.
export const NEW_ITEM = {
  rack: { units: 12 },
  device: { size: [200, 64] },
  rackdevice: { units: 1 },
  fanpanel: { units: 2 },
  endpoint: { icon: "mdi:server" },
  badge: { entity: "sun.sun", icon: "mdi:information-outline", size: 10 },
  chip: { icon: "mdi:docker", size: 16 },
  led: { color: "green" },
  label: { text: "Label", size: 10 },
  group: { items: [] },
  ports: { size: 12, items: [] },
  pool: { size: [100, 48] },
  hdd: {},
  ssd: {},
  bay: {},
  fan: {},
  port: { state: "active" },
};

const ICONS = {
  rack: "mdi:server",
  device: "mdi:router-network",
  rackdevice: "mdi:server-network",
  fanpanel: "mdi:fan",
  endpoint: "mdi:monitor",
  badge: "mdi:numeric",
  chip: "mdi:circle-double",
  led: "mdi:led-on",
  label: "mdi:format-text",
  group: "mdi:group",
  ports: "mdi:ethernet",
  port: "mdi:ethernet-cable",
  pool: "mdi:database",
  hdd: "mdi:harddisk",
  ssd: "mdi:expansion-card",
  bay: "mdi:tray",
  fan: "mdi:fan",
};

const ENTITY_KEYS = ["entity", "status_entity", "update_entity", "small_entity", "usage_entity", "temperature", "rx", "tx"];
const YAML_KEYS = ["status_map", "states", "thresholds", "range", "vlans"];
const BOOL_KEYS = ["show_border", "bold", "vertical", "fit_viewport", "debug", "vlan_toggle", "power_toggle", "animation_toggle", "debug_toggle"];

const LABELS = {
  id: "ID",
  type: "Type",
  at: "Position (x, y)",
  size: "Size",
  units: "Units",
  u: "Top unit (U)",
  side: "Half width",
  text: "Text",
  icon: "Icon (mdi:… or none)",
  icon_color: "Icon colour",
  image: "Image URL (/local/…)",
  small_image: "Small image URL",
  url: "Link URL",
  caption: "Caption",
  label: "Label",
  color: "Colour",
  vlan: "VLAN",
  effect: "Effect",
  decimals: "Decimals",
  count: "Fans",
  speed: "Expected speed (e.g. 1Gbps)",
  state: "Fixed state",
  toggle: "Toggles group",
  texture: "Texture",
  texture_opacity: "Texture opacity",
  line_radius: "Line corner radius",
  font: "Font",
  background: "Background",
  scale: "Scale",
  start_device: "Start device",
  start_port: "Start port",
  start_edge: "Start edge",
  start_point: "Start point (%)",
  end_device: "End device",
  end_port: "End port",
  end_edge: "End edge",
  end_point: "End point (%)",
  points: "Waypoints (x,y x,y …)",
  flow: "Flow",
  status: "Status (active, inactive or an entity)",
  rates_at: "Rates at (start, end or %)",
  rates_placement: "Rates placement",
  rates_size: "Rates size",
};

const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
const round = (value, step) => Math.round(value / step) * step;
const half = (value) => Math.round(value * 2) / 2;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const kit = () => customElements.get(CARD_TYPE)?.editorKit;

const svgEl = (tag, attrs = {}, parent = null) => {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) el.setAttribute(k, v);
  parent?.appendChild(el);
  return el;
};

const setOrDelete = (obj, key, value) => {
  const empty = value === undefined || value === null || value === "" || (Array.isArray(value) && !value.length) ||
    (typeof value === "object" && !Array.isArray(value) && !Object.keys(value).length);
  if (empty) delete obj[key];
  else obj[key] = value;
};

// Walks the items with their index path, parent and absolute origin.
export const walkItems = (items, fn, path = [], parent = null) => {
  (items || []).forEach((item, i) => {
    fn(item, [...path, i], parent);
    walkItems(item.items, fn, [...path, i], item);
  });
};

export const itemAt = (config, path) => {
  let list = config.items;
  let item = null;
  for (const i of path) {
    item = list?.[i];
    list = item?.items;
  }
  return item ?? null;
};

export const listOf = (config, path) => (path.length > 1 ? itemAt(config, path.slice(0, -1)).items : config.items);

export const allIds = (config) => {
  const ids = new Set();
  walkItems(config.items, (item) => ids.add(item.id));
  for (const list of ["datalines", "powerlines"]) for (const line of config[list] || []) ids.add(line.id);
  return ids;
};

export const uniqueId = (config, base) => {
  const ids = allIds(config);
  const stem = String(base).replace(/[^\w-]+/g, "_") || "item";
  if (!ids.has(stem)) return stem;
  let n = 2;
  while (ids.has(`${stem}_${n}`)) n++;
  return `${stem}_${n}`;
};

// Renames an id everywhere it is referenced: lines, ports, badge toggles.
export const renameId = (config, from, to) => {
  walkItems(config.items, (item) => {
    if (item.toggle === from) item.toggle = to;
  });
  for (const list of ["datalines", "powerlines"]) {
    for (const line of config[list] || []) {
      for (const key of ["start_device", "start_port", "end_device", "end_port"]) if (line[key] === from) line[key] = to;
    }
  }
};

// Removes the lines that end on one of the given ids, and the toggles that point at them.
export const dropReferences = (config, ids) => {
  for (const list of ["datalines", "powerlines"]) {
    if (!config[list]) continue;
    config[list] = config[list].filter((line) => !["start_device", "start_port", "end_device", "end_port"].some((k) => ids.has(line[k])));
    if (!config[list].length) delete config[list];
  }
  walkItems(config.items, (item) => {
    if (ids.has(item.toggle)) delete item.toggle;
  });
};

// Lowest free unit of a rack for a rackdevice or fan panel of the given height.
export const freeUnit = (rack, units = 1, skip = null) => {
  const used = [];
  for (const item of rack.items || []) {
    if (item === skip || !UNIT_TYPES.includes(item.type)) continue;
    used.push([item.u, item.u + (item.units ?? (item.type === "fanpanel" ? 2 : 1)), item.side]);
  }
  for (let u = 1; u + units - 1 <= rack.units; u += 0.5) {
    if (used.every(([a, b]) => u + units <= a || u >= b)) return u;
  }
  return null;
};

// The side and position of an anchor on a box, closest to a point (in map coordinates).
export const anchorFor = (box, [px, py], step = 5) => {
  const d = { left: Math.abs(px - box.x), right: Math.abs(box.x + box.w - px), top: Math.abs(py - box.y), bottom: Math.abs(box.y + box.h - py) };
  const edge = Object.keys(d).reduce((a, b) => (d[b] < d[a] ? b : a));
  const along = edge === "left" || edge === "right" ? (py - box.y) / (box.h || 1) : (px - box.x) / (box.w || 1);
  return { edge, point: clamp(round(along * 100, step), 0, 100) };
};

// Fields of the item form. Pairs and sizes are split into two number fields.
export const itemSchema = (type, config, ids) => {
  const { ITEM_KEYS, TEXTURES } = kit();
  const keys = ITEM_KEYS[type].filter((k) => k !== "type" && k !== "items");
  const vlans = Object.keys(config.vlans || {});
  const groups = [];
  walkItems(config.items, (item) => {
    if (item.type === "group") groups.push(item.id);
  });
  const fields = [];
  for (const key of keys) {
    if (key === "id") fields.push({ name: "id", required: true, selector: { text: {} } });
    else if (key === "at") fields.push({ type: "grid", name: "", schema: [{ name: "at_x", selector: num(1) }, { name: "at_y", selector: num(1) }] });
    else if (key === "size" && PAIR_SIZE.includes(type)) {
      fields.push({ type: "grid", name: "", schema: [{ name: "size_w", selector: num(1, 1) }, { name: "size_h", selector: num(1, 1) }] });
    } else if (key === "size") fields.push({ name: "size", selector: num(1, 1) });
    else if (key === "units" && type === "badge") fields.push({ name: "units", selector: { text: {} } });
    else if (key === "units") fields.push({ name: "units", selector: num(type === "rack" ? 1 : 0.5, type === "rack" ? 1 : 0.5) });
    else if (key === "u") fields.push({ name: "u", selector: num(0.5, 1) });
    else if (key === "side") fields.push({ name: "side", selector: select(["", "left", "right"]) });
    else if (key === "effect") fields.push({ name: "effect", selector: select(["", "flicker", "blink", "none"]) });
    else if (key === "state") fields.push({ name: "state", selector: select(["", "active", "warn", "inactive", "fault", "disabled"]) });
    else if (key === "texture") fields.push({ name: "texture", selector: select(["", ...TEXTURES]) });
    else if (key === "texture_opacity") fields.push({ name: "texture_opacity", selector: num(0.05, 0, 1) });
    else if (key === "vlan") fields.push({ name: "vlan", selector: select(["", ...vlans]) });
    else if (key === "toggle") fields.push({ name: "toggle", selector: select(["", ...groups]) });
    else if (key === "decimals" || key === "count") fields.push({ name: key, selector: num(1, 0) });
    else if (BOOL_KEYS.includes(key)) fields.push({ name: key, selector: { boolean: {} } });
    else if (YAML_KEYS.includes(key)) fields.push({ name: key, selector: { object: {} } });
    else if (ENTITY_KEYS.includes(key)) fields.push({ name: key, selector: ids.objectRefs.has(key) ? { object: {} } : { entity: {} } });
    else fields.push({ name: key, selector: { text: {} } });
  }
  return fields;
};

export const lineSchema = (kind, config) => {
  const { DATALINE_KEYS, LINE_KEYS, EDGES } = kit();
  const devices = [];
  const ports = [];
  walkItems(config.items, (item) => {
    if (["rack", "device", "rackdevice", "endpoint"].includes(item.type)) devices.push(item.id);
    if (item.type === "port") ports.push(item.id);
  });
  const keys = kind === "data" ? DATALINE_KEYS : LINE_KEYS;
  const vlans = Object.keys(config.vlans || {});
  const fields = [];
  for (const key of keys) {
    if (/_device$/.test(key)) fields.push({ name: key, selector: select(["", ...devices]) });
    else if (/_port$/.test(key)) fields.push({ name: key, selector: select(["", ...ports]) });
    else if (/_edge$/.test(key)) fields.push({ name: key, selector: select(["", ...EDGES]) });
    else if (/_point$/.test(key)) fields.push({ name: key, selector: num(5, 0, 100) });
    else if (key === "flow") {
      fields.push({ name: key, selector: select(kind === "data" ? ["", "forward", "reverse", "dominant"] : ["", "forward", "reverse"]) });
    } else if (key === "vlans") fields.push({ name: key, selector: { select: { multiple: true, mode: "list", options: vlans } } });
    else if (key === "rates_placement") fields.push({ name: key, selector: select(["", "middle", "above", "below"]) });
    else if (key === "rates_size") fields.push({ name: key, selector: num(1, 1) });
    else if (key === "rx" || key === "tx") fields.push({ name: key, selector: { entity: {} } });
    else fields.push({ name: key, selector: { text: {} } });
  }
  return fields;
};

const num = (step, min, max) => ({ number: { mode: "box", step, ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}) } });
const select = (options) => ({ select: { mode: "dropdown", options: options.map((value) => ({ value, label: value === "" ? "—" : value })) } });

const STYLES = `
:host { display: block; }
.bar { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-bottom: 8px; }
.bar .grow { flex: 1; }
.bar .ver { font-size: 11px; color: var(--secondary-text-color); }
button.b { display: inline-flex; align-items: center; gap: 4px; border: 1px solid var(--divider-color); border-radius: 16px; background: none;
  color: var(--primary-text-color); padding: 4px 10px; font: inherit; font-size: 12px; cursor: pointer; }
button.b:hover { border-color: var(--primary-color); color: var(--primary-color); }
button.b:disabled { opacity: .4; cursor: default; }
button.b ha-icon { --mdc-icon-size: 16px; }
select.s { border: 1px solid var(--divider-color); border-radius: 6px; background: var(--card-background-color); color: var(--primary-text-color);
  padding: 4px 6px; font: inherit; font-size: 12px; }
.stage { position: relative; border: 1px solid var(--divider-color); border-radius: var(--ha-card-border-radius, 12px); overflow: auto; }
.stage > svg.ovl { position: absolute; left: 0; top: 0; touch-action: none; user-select: none; -webkit-user-select: none; outline: none; }
.ovl .hit { fill: transparent; stroke: none; cursor: pointer; }
.ovl .hit:hover { fill: var(--primary-color); fill-opacity: .08; stroke: var(--primary-color); stroke-opacity: .5; stroke-width: 1; vector-effect: non-scaling-stroke; }
.ovl .hit.move { cursor: move; }
.ovl .lhit { fill: none; stroke: transparent; stroke-width: 10; cursor: pointer; pointer-events: stroke; vector-effect: non-scaling-stroke; }
.ovl .lhit:hover { stroke: var(--primary-color); stroke-opacity: .25; }
.ovl .sel { fill: none; stroke: var(--primary-color); stroke-width: 1.5; stroke-dasharray: 4 3; vector-effect: non-scaling-stroke; pointer-events: none; }
.ovl .lsel { fill: none; stroke: var(--primary-color); stroke-width: 3; stroke-opacity: .55; vector-effect: non-scaling-stroke; pointer-events: none; }
.ovl .bad { stroke: var(--error-color, #db4437); }
.ovl .hdl { fill: var(--primary-color); stroke: #fff; stroke-width: 1; vector-effect: non-scaling-stroke; cursor: pointer; }
.ovl .hdl.rz { cursor: nwse-resize; }
.ovl .hdl.end { fill: var(--warning-color, #ffa600); }
.ovl .hdl.auto { fill: var(--card-background-color, #fff); stroke: var(--primary-color); }
.coords { position: absolute; right: 6px; bottom: 4px; font-size: 11px; color: var(--secondary-text-color); background: var(--card-background-color);
  padding: 0 4px; border-radius: 4px; pointer-events: none; }
.hint { font-size: 12px; color: var(--secondary-text-color); margin: 6px 2px 10px; line-height: 1.5; }
.error { color: var(--error-color, #db4437); font-size: 12px; margin: 6px 2px; white-space: pre-wrap; }
.tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--divider-color); margin: 8px 0 12px; }
.tabs button { background: none; border: none; border-bottom: 2px solid transparent; padding: 8px 12px; color: var(--secondary-text-color); cursor: pointer;
  font: inherit; font-weight: 500; }
.tabs button.on { color: var(--primary-color); border-bottom-color: var(--primary-color); }
.tree { border: 1px solid var(--divider-color); border-radius: 8px; padding: 4px; max-height: 280px; overflow: auto; margin-bottom: 8px; }
.row { display: flex; align-items: center; gap: 6px; padding: 3px 6px; border-radius: 6px; cursor: pointer; font-size: 13px; }
.row:hover { background: var(--secondary-background-color); }
.row.on { background: rgba(var(--rgb-primary-color, 3, 169, 244), .15); }
.row ha-icon { --mdc-icon-size: 16px; color: var(--secondary-text-color); }
.row .muted { color: var(--secondary-text-color); font-size: 11px; }
.row .grow { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.actions { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 6px 0 12px; }
h4 { margin: 14px 0 8px; font-size: 14px; font-weight: 500; }
.empty { color: var(--secondary-text-color); font-size: 13px; padding: 6px; }
.root.fs { position: fixed; inset: 0; z-index: 9999; display: flex; gap: 0; background: var(--primary-background-color, #fafafa); }
.root.fs .left { flex: 1; min-width: 0; padding: 12px 16px; overflow: auto; box-sizing: border-box; display: flex; flex-direction: column; }
.root.fs .stage { flex: 1; }
.root.fs .right { width: min(460px, 40vw); flex: none; overflow: auto; padding: 12px 16px; box-sizing: border-box; border-left: 1px solid var(--divider-color);
  background: var(--card-background-color, #fff); }
`;

export class HaHomelabMapEditor extends HTMLElement {
  #hass = null;
  #config = null;
  #last = "";
  #sel = null;
  #tab = "items";
  #snap = 5;
  #zoom = 1;
  #past = [];
  #future = [];
  #built = false;
  #preview = null;
  #stage = null;
  #overlay = null;
  #coords = null;
  #panel = null;
  #error = null;
  #root = null;
  #placed = [];
  #boxes = new Map();
  #lines = [];
  #drag = null;
  #link = null;
  #fs = false;
  #fsApi = false;
  #forms = [];
  #formKey = "";
  #frame = 0;
  #resizer = null;
  #onKey = (ev) => this.#key(ev);
  #onFsChange = () => {
    if (this.#fsApi && !document.fullscreenElement && this.#fs) this.#fullscreen(false);
  };

  set hass(hass) {
    this.#hass = hass;
    if (this.#preview) this.#preview.hass = hass;
    for (const form of this.#forms) form.hass = hass;
  }

  setConfig(config) {
    const text = JSON.stringify(config);
    if (text === this.#last) return;
    this.#last = text;
    this.#config = clone(config);
    if (!Array.isArray(this.#config.items)) this.#config.items = [];
    if (this.#sel && !this.#selected()) this.#sel = null;
    this.#build();
    this.#refresh();
  }

  connectedCallback() {
    window.addEventListener("keydown", this.#onKey);
    document.addEventListener("fullscreenchange", this.#onFsChange);
    this.#loadForms();
  }

  disconnectedCallback() {
    if (this.#fs) this.#fullscreen(false);
    window.removeEventListener("keydown", this.#onKey);
    document.removeEventListener("fullscreenchange", this.#onFsChange);
  }

  // ha-form and the entity picker are loaded lazily by Home Assistant; creating an entities card editor loads them.
  async #loadForms() {
    if (customElements.get("ha-form") && customElements.get("ha-entity-picker")) return;
    try {
      const helpers = await window.loadCardHelpers?.();
      const card = await helpers?.createCardElement({ type: "entities", entities: [] });
      await card?.constructor?.getConfigElement?.();
    } catch {
      // the forms then render as soon as Home Assistant has loaded them
    }
    this.#formKey = "";
    if (this.#config) this.#renderPanel();
  }

  // ---------- skeleton ----------

  #build() {
    if (this.#built || !kit()) return;
    const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${STYLES}</style>
      <div class="root"><div class="left">
        <div class="bar">
          <button class="b" data-a="undo" title="Undo (Ctrl+Z)"><ha-icon icon="mdi:undo"></ha-icon></button>
          <button class="b" data-a="redo" title="Redo (Ctrl+Y)"><ha-icon icon="mdi:redo"></ha-icon></button>
          <label class="ver">Grid <select class="s" data-a="snap">${SNAPS.map((s) => `<option value="${s}">${s} px</option>`).join("")}</select></label>
          <label class="ver">Zoom <select class="s" data-a="zoom">${
      ZOOMS.map((z) => `<option value="${z}">${z === "fit" ? "Fit" : `${z * 100} %`}</option>`).join("")
    }</select></label>
          <span class="grow"></span>
          <button class="b" data-a="fs"><ha-icon icon="mdi:fullscreen"></ha-icon><span>Full screen</span></button>
          <span class="ver">v${esc(kit().version)}</span>
        </div>
        <div class="stage"><div class="coords"></div></div>
        <div class="error" hidden></div>
        <div class="hint">Drag an item to move it (rack devices snap to half units), drag the handle at its bottom-right corner to resize it.
          Select a device and <b>Shift</b>+click another device or port to draw a cable. On a selected cable, drag the dots, drop an orange end
          on another device or port to reconnect it, double-click the cable to add a point and a point to remove it. <b>Alt</b> moves freely,
          arrow keys nudge by 1 px (<b>Shift</b>: 10 px), <b>Delete</b> removes the selection.</div>
      </div><div class="right">
        <div class="tabs"><button data-tab="items">Items</button><button data-tab="lines">Cables</button><button data-tab="card">Card</button></div>
        <div class="panel"></div>
      </div></div>`;
    this.#root = root.querySelector(".root");
    this.#stage = root.querySelector(".stage");
    this.#coords = root.querySelector(".coords");
    this.#panel = root.querySelector(".panel");
    this.#error = root.querySelector(".error");
    root.querySelector('[data-a="snap"]').value = String(this.#snap);
    root.addEventListener("click", (ev) => {
      const a = ev.target.closest("[data-a]")?.dataset.a;
      if (a === "undo") this.#undo();
      else if (a === "redo") this.#redo();
      else if (a === "fs") this.#fullscreen(!this.#fs);
      const tab = ev.target.closest("[data-tab]")?.dataset.tab;
      if (tab) {
        this.#tab = tab;
        this.#renderPanel();
      }
    });
    root.querySelector('[data-a="snap"]').addEventListener("change", (ev) => {
      this.#snap = Number(ev.target.value) || 1;
    });
    root.querySelector('[data-a="zoom"]').value = String(this.#zoom);
    root.querySelector('[data-a="zoom"]').addEventListener("change", (ev) => {
      this.#zoom = ev.target.value === "fit" ? "fit" : Number(ev.target.value) || 1;
      this.#applyZoom();
    });
    this.#preview = document.createElement(CARD_TYPE);
    this.#preview.addEventListener("hass-more-info", (ev) => ev.stopPropagation());
    this.#stage.prepend(this.#preview);
    this.#overlay = svgEl("svg", { class: "ovl", tabindex: 0, "aria-label": "Map editor" }, this.#stage);
    this.#overlay.addEventListener("pointerdown", (ev) => this.#down(ev));
    this.#overlay.addEventListener("pointermove", (ev) => this.#move(ev));
    this.#overlay.addEventListener("pointerup", (ev) => this.#up(ev));
    this.#overlay.addEventListener("pointercancel", (ev) => this.#up(ev));
    this.#overlay.addEventListener("dblclick", (ev) => this.#dbl(ev));
    this.#overlay.addEventListener("wheel", (ev) => ev.stopPropagation(), { passive: true });
    if (typeof ResizeObserver !== "undefined") {
      this.#resizer = new ResizeObserver(() => this.#schedule());
      this.#resizer.observe(this.#stage);
    }
    if (this.#hass) this.#preview.hass = this.#hass;
    this.#built = true;
  }

  // ---------- config changes ----------

  #commit({ history = true, panel = true } = {}) {
    if (history) {
      this.#past.push(this.#last);
      if (this.#past.length > HISTORY) this.#past.shift();
      this.#future = [];
    }
    this.#last = JSON.stringify(this.#config);
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: clone(this.#config) }, bubbles: true, composed: true }));
    this.#refresh(panel);
  }

  #undo() {
    if (!this.#past.length) return;
    this.#future.push(this.#last);
    this.#restore(this.#past.pop());
  }

  #redo() {
    if (!this.#future.length) return;
    this.#past.push(this.#last);
    this.#restore(this.#future.pop());
  }

  #restore(text) {
    this.#config = JSON.parse(text);
    if (this.#sel && !this.#selected()) this.#sel = null;
    this.#formKey = "";
    this.#commit({ history: false });
  }

  #validate(config) {
    try {
      kit().validateConfig(config);
      return null;
    } catch (error) {
      return String(error?.message ?? error);
    }
  }

  #refresh(panel = true) {
    if (!this.#built) return;
    const error = this.#validate(this.#config);
    this.#error.hidden = !error;
    this.#error.textContent = error ?? "";
    if (!error) {
      try {
        this.#preview.setConfig(clone(this.#config));
      } catch {
        // already reported above
      }
    }
    this.#schedule();
    if (panel) this.#renderPanel();
    const bar = this.shadowRoot;
    bar.querySelector('[data-a="undo"]').disabled = !this.#past.length;
    bar.querySelector('[data-a="redo"]').disabled = !this.#future.length;
  }

  #schedule() {
    cancelAnimationFrame(this.#frame);
    this.#frame = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        this.#applyZoom(false);
        this.#drawOverlay();
      })
    );
  }

  // Zooms the preview with CSS zoom; the overlay follows through getScreenCTM().
  #applyZoom(redraw = true) {
    if (!this.#preview) return;
    let zoom = this.#zoom;
    if (zoom === "fit") {
      const svg = this.#mapSvg();
      const current = Number(this.#preview.style.zoom) || 1;
      const natural = svg ? svg.getBoundingClientRect().width / current : 0;
      const room = this.#stage.clientWidth - 24;
      const tall = svg ? svg.getBoundingClientRect().height / current : 0;
      const roomH = this.#fs ? this.#stage.clientHeight - 24 : Infinity;
      zoom = natural ? Math.min(room / natural, tall ? roomH / tall : Infinity) : 1;
    }
    this.#preview.style.zoom = String(Math.max(0.1, zoom));
    if (redraw) this.#drawOverlay();
  }

  // ---------- geometry ----------

  #mapSvg() {
    return this.#preview?.shadowRoot?.querySelector(".stage svg") ?? null;
  }

  // Boxes of every item in map coordinates: the card's own placement, refined with the drawn size of badges,
  // chips and labels, and with the extent of the children for groups and ports.
  #measure() {
    const { placeItems, edgeAnchor } = kit();
    const placed = placeItems(this.#config.items, [0, 0], []);
    const paths = new Map();
    walkItems(this.#config.items, (item, path) => paths.set(item, path));
    const svg = this.#mapSvg();
    const inverse = svg?.getScreenCTM?.()?.inverse();
    // drawn size in map coordinates; client rects include the transforms that getBBox() leaves out
    const drawn = (id) => {
      const el = svg?.querySelector(`[data-id="${CSS.escape(id)}"]`);
      if (!inverse || !el) return null;
      // union of the visible shapes only: badges keep a hidden probe text for measuring
      let box = null;
      for (const shape of el.querySelectorAll("path, rect, circle, ellipse, line, polyline, polygon, text, image, use")) {
        if (shape.closest('[visibility="hidden"], title')) continue;
        const r = shape.getBoundingClientRect();
        if (!r.width && !r.height) continue;
        box = box
          ? { l: Math.min(box.l, r.left), t: Math.min(box.t, r.top), r: Math.max(box.r, r.right), b: Math.max(box.b, r.bottom) }
          : { l: r.left, t: r.top, r: r.right, b: r.bottom };
      }
      if (!box) return null;
      const a = new DOMPoint(box.l, box.t).matrixTransform(inverse);
      const b = new DOMPoint(box.r, box.b).matrixTransform(inverse);
      return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
    };
    for (const p of placed) {
      p.path = paths.get(p.dev);
      if (["badge", "chip", "label", "led"].includes(p.dev.type)) {
        const b = drawn(p.dev.id);
        if (b) Object.assign(p, { x: b.x, y: b.y, w: b.w, h: b.h });
      }
    }
    for (const p of [...placed].reverse()) {
      if (p.w || p.h || !p.dev.items?.length) continue;
      const kids = placed.filter((c) => c.path.length === p.path.length + 1 && c.path.slice(0, -1).join() === p.path.join() && (c.w || c.h));
      if (!kids.length) continue;
      const x1 = Math.min(...kids.map((c) => c.x));
      const y1 = Math.min(...kids.map((c) => c.y));
      p.w = Math.max(...kids.map((c) => c.x + c.w)) - x1;
      p.h = Math.max(...kids.map((c) => c.y + c.h)) - y1;
      p.x = x1;
      p.y = y1;
    }
    this.#placed = placed;
    this.#boxes = new Map(placed.map((p) => [p.dev.id, p]));
    const anchorOf = (cfg, end) => {
      const id = cfg[`${end}_device`] ?? cfg[`${end}_port`];
      const box = id !== undefined ? this.#boxes.get(id) : null;
      return box ? [edgeAnchor(box, cfg[`${end}_edge`], cfg[`${end}_point`])] : [];
    };
    this.#lines = [];
    for (const [list, kind] of [["datalines", "data"], ["powerlines", "power"]]) {
      (this.#config[list] || []).forEach((cfg, index) => {
        const pts = [...anchorOf(cfg, "start"), ...(cfg.points || []), ...anchorOf(cfg, "end")];
        if (pts.length >= 2) this.#lines.push({ cfg, list, kind, index, pts });
      });
    }
  }

  #drawOverlay() {
    if (!this.#built || !this.#overlay) return;
    const svg = this.#mapSvg();
    const ovl = this.#overlay;
    ovl.replaceChildren();
    if (!svg) return;
    const stage = this.#stage.getBoundingClientRect();
    const r = svg.getBoundingClientRect();
    ovl.setAttribute("viewBox", svg.getAttribute("viewBox"));
    ovl.setAttribute("preserveAspectRatio", svg.getAttribute("preserveAspectRatio") ?? "xMidYMid meet");
    Object.assign(ovl.style, {
      left: `${r.left - stage.left + this.#stage.scrollLeft}px`,
      top: `${r.top - stage.top + this.#stage.scrollTop}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
    });
    ovl.setAttribute("width", r.width);
    ovl.setAttribute("height", r.height);
    this.#measure();
    const devices = kit().DEVICE_TYPES;
    const { roundedPath } = kit();
    const radius = this.#config.line_radius ?? 6;
    // largest boxes first so that nested items stay on top and win the click
    const order = [...this.#placed].sort((a, b) => b.w * b.h - a.w * a.h);
    for (const p of order) {
      if (!p.path) continue;
      const w = Math.max(p.w, MIN_HIT);
      const h = Math.max(p.h, MIN_HIT);
      svgEl("rect", {
        class: "hit move",
        x: p.x - (w - p.w) / 2,
        y: p.y - (h - p.h) / 2,
        width: w,
        height: h,
        "data-path": p.path.join("."),
        "data-device": devices.includes(p.dev.type) || p.dev.type === "port" ? "1" : null,
      }, ovl);
    }
    for (const line of this.#lines) {
      svgEl("path", { class: "lhit", d: roundedPath(line.pts, radius), "data-line": `${line.list}.${line.index}` }, ovl);
    }
    this.#drawSelection();
  }

  #selected() {
    const s = this.#sel;
    if (!s) return null;
    if (s.kind === "item") return itemAt(this.#config, s.path);
    return this.#config[s.list]?.[s.index] ?? null;
  }

  #drawSelection() {
    const ovl = this.#overlay;
    const s = this.#sel;
    if (!s) return;
    if (s.kind === "item") {
      const item = this.#selected();
      const box = item && this.#boxes.get(item.id);
      if (!box) return;
      svgEl("rect", { class: `sel${this.#drag?.bad ? " bad" : ""}`, x: box.x - 2, y: box.y - 2, width: box.w + 4, height: box.h + 4, rx: 3 }, ovl);
      if (RESIZABLE.includes(item.type)) {
        svgEl(
          "rect",
          { class: "hdl rz", "data-h": "resize", x: box.x + box.w - HANDLE / 2, y: box.y + box.h - HANDLE / 2, width: HANDLE, height: HANDLE },
          ovl,
        );
      }
      return;
    }
    const line = this.#lines.find((l) => l.list === s.list && l.index === s.index);
    if (!line) return;
    svgEl("path", { class: "lsel", d: kit().roundedPath(line.pts, this.#config.line_radius ?? 6) }, ovl);
    (line.cfg.points || []).forEach(([x, y], k) => svgEl("circle", { class: "hdl", "data-h": "pt", "data-k": k, cx: x, cy: y, r: HANDLE / 1.4 }, ovl));
    for (const end of ["start", "end"]) {
      if (line.cfg[`${end}_device`] === undefined && line.cfg[`${end}_port`] === undefined) continue;
      const [x, y] = end === "start" ? line.pts[0] : line.pts[line.pts.length - 1];
      svgEl("circle", { class: "hdl end", "data-h": "end", "data-end": end, cx: x, cy: y, r: HANDLE / 1.2 }, ovl);
    }
  }

  // ---------- pointer ----------

  #point(ev) {
    const ctm = this.#overlay.getScreenCTM();
    if (!ctm) return [0, 0];
    const p = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(ctm.inverse());
    return [p.x, p.y];
  }

  #snapTo(value, free) {
    return free ? Math.round(value) : round(value, this.#snap);
  }

  #down(ev) {
    if (ev.button !== 0) return;
    this.#overlay.focus({ preventScroll: true });
    const p = this.#point(ev);
    const handle = ev.target.closest("[data-h]");
    const hit = ev.target.closest("[data-path]");
    const lhit = ev.target.closest("[data-line]");
    if (handle) this.#grabHandle(handle, p);
    else if (hit) {
      const path = hit.dataset.path.split(".").map(Number);
      const item = itemAt(this.#config, path);
      if (ev.shiftKey && hit.dataset.device && this.#sel?.kind === "item") {
        this.#connect(this.#selected(), item);
        return;
      }
      this.#select({ kind: "item", path });
      const box = this.#boxes.get(item.id);
      this.#drag = { mode: "move", item, start: p, at: clone(item.at), u: item.u, box: { ...box }, before: this.#last };
    } else if (lhit) {
      const [list, index] = lhit.dataset.line.split(".");
      this.#select({ kind: "line", list, index: Number(index) });
    } else this.#select(null);
    if (this.#drag) {
      this.#overlay.setPointerCapture(ev.pointerId);
      ev.preventDefault();
    }
  }

  #grabHandle(handle, p) {
    const target = this.#selected();
    if (!target) return;
    const kind = handle.dataset.h;
    if (kind === "resize") {
      const box = this.#boxes.get(target.id);
      this.#drag = { mode: "resize", item: target, start: p, box: { ...box }, size: clone(target.size), units: target.units, before: this.#last };
    } else if (kind === "pt") {
      const k = Number(handle.dataset.k);
      this.#drag = { mode: "point", line: target, k, start: p, orig: [...target.points[k]], before: this.#last };
    } else if (kind === "end") {
      this.#drag = { mode: "end", line: target, end: handle.dataset.end, start: p, before: this.#last };
    }
  }

  #move(ev) {
    const p = this.#point(ev);
    this.#coords.textContent = `${Math.round(p[0])}, ${Math.round(p[1])}`;
    const d = this.#drag;
    if (!d) return;
    const dx = p[0] - d.start[0];
    const dy = p[1] - d.start[1];
    if (!d.moved && Math.hypot(dx, dy) < 2) return;
    d.moved = true;
    const free = ev.altKey;
    const next = clone(this.#config);
    const target = d.item ? this.#locate(next, d.item) : this.#locateLine(next, d.line);
    if (!target) return;
    if (d.mode === "move") {
      if (UNIT_TYPES.includes(target.type)) target.u = Math.max(1, half(d.u + dy / kit().RACK.unit));
      else target.at = [this.#snapTo(d.at[0] + dx, free), this.#snapTo(d.at[1] + dy, free)];
    } else if (d.mode === "resize") this.#resize(target, d, dx, dy, free);
    else if (d.mode === "point") target.points[d.k] = [this.#snapTo(d.orig[0] + dx, free), this.#snapTo(d.orig[1] + dy, free)];
    else if (d.mode === "end") {
      d.at = p;
      this.#drawOverlay();
      svgEl("circle", { class: "hdl end", cx: p[0], cy: p[1], r: HANDLE }, this.#overlay);
      return;
    }
    // only keep positions the card accepts (e.g. a rack device cannot overlap another one)
    d.bad = !!this.#validate(next);
    if (d.bad) {
      this.#drawOverlay();
      return;
    }
    this.#config = next;
    d.item = d.item ? this.#locate(next, d.item, true) : null;
    d.line = d.line ? this.#locateLine(next, d.line) : null;
    this.#last = JSON.stringify(next);
    this.#preview.setConfig(clone(next));
    this.#schedule();
  }

  #resize(item, d, dx, dy, free) {
    const { RACK } = kit();
    if (PAIR_SIZE.includes(item.type)) {
      item.size = [Math.max(1, this.#snapTo(d.box.w + dx, free)), Math.max(1, this.#snapTo(d.box.h + dy, free))];
    } else if (SQUARE_SIZE.includes(item.type)) item.size = Math.max(4, this.#snapTo(Math.max(d.box.w + dx, d.box.h + dy), free));
    else if (item.type === "rack") item.units = Math.max(1, Math.round((d.box.h + dy - 2 * RACK.cap) / RACK.unit));
    else if (UNIT_TYPES.includes(item.type)) item.units = Math.max(0.5, half((d.box.h + dy + 2) / RACK.unit));
  }

  #up(ev) {
    const d = this.#drag;
    if (!d) return;
    this.#drag = null;
    try {
      this.#overlay.releasePointerCapture(ev.pointerId);
    } catch {
      // the pointer was not captured
    }
    if (d.mode === "end" && d.at) this.#reconnect(d.line, d.end, d.at);
    if (!d.moved && d.mode !== "end") return;
    this.#last = d.before;
    this.#commit();
  }

  #dbl(ev) {
    if (this.#sel?.kind !== "line") return;
    const line = this.#selected();
    const drawn = this.#lines.find((l) => l.cfg === line);
    if (!line || !drawn) return;
    const p = this.#point(ev);
    const tolerance = 8 / (this.#overlay.getScreenCTM()?.a || 1);
    const before = this.#last;
    const k = (line.points || []).findIndex(([x, y]) => Math.hypot(x - p[0], y - p[1]) <= tolerance);
    if (k >= 0) {
      line.points.splice(k, 1);
      if (!line.points.length) delete line.points;
    } else {
      const pts = drawn.pts;
      let best = -1;
      let dist = Infinity;
      for (let i = 0; i < pts.length - 1; i++) {
        const [a, b] = [pts[i], pts[i + 1]];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const t = clamp(((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / (len * len), 0, 1);
        const d = Math.hypot(p[0] - (a[0] + t * (b[0] - a[0])), p[1] - (a[1] + t * (b[1] - a[1])));
        if (d < dist) [dist, best] = [d, i];
      }
      if (best < 0 || dist > tolerance) return;
      const hasStart = line.start_device !== undefined || line.start_port !== undefined;
      line.points = line.points || [];
      line.points.splice(hasStart ? best : best + 1, 0, p.map((v) => this.#snapTo(v, ev.altKey)));
    }
    this.#last = before;
    this.#commit();
  }

  // Finds the same item in another copy of the config (by id, unique across the map).
  #locate(config, item, keepPath = false) {
    let found = null;
    walkItems(config.items, (it, path) => {
      if (it.id === item.id) {
        found = it;
        if (keepPath && this.#sel?.kind === "item") this.#sel.path = path;
      }
    });
    return found;
  }

  #locateLine(config, line) {
    for (const list of ["datalines", "powerlines"]) {
      const found = (config[list] || []).find((l) => l.id === line.id);
      if (found) return found;
    }
    return null;
  }

  #reconnect(line, end, at) {
    const devices = kit().DEVICE_TYPES;
    const hit = [...this.#placed].filter((p) =>
      (devices.includes(p.dev.type) || p.dev.type === "port") &&
      at[0] >= p.x - 3 && at[0] <= p.x + p.w + 3 && at[1] >= p.y - 3 && at[1] <= p.y + p.h + 3
    ).sort((a, b) => a.w * a.h - b.w * b.h)[0];
    if (!hit) return;
    const port = hit.dev.type === "port";
    delete line[`${end}_device`];
    delete line[`${end}_port`];
    line[`${end}_${port ? "port" : "device"}`] = hit.dev.id;
    const { edge, point } = anchorFor(hit, at);
    line[`${end}_edge`] = edge;
    setOrDelete(line, `${end}_point`, point === 50 ? undefined : point);
  }

  #connect(from, to) {
    if (!from || !to || from === to) return;
    const devices = kit().DEVICE_TYPES;
    const ok = (item) => devices.includes(item.type) || item.type === "port";
    if (!ok(from) || !ok(to)) return;
    const a = this.#boxes.get(from.id);
    const b = this.#boxes.get(to.id);
    if (!a || !b) return;
    const dx = b.x + b.w / 2 - (a.x + a.w / 2);
    const dy = b.y + b.h / 2 - (a.y + a.h / 2);
    const horizontal = Math.abs(dx) >= Math.abs(dy);
    const line = { id: uniqueId(this.#config, `${from.id}-${to.id}`) };
    line[from.type === "port" ? "start_port" : "start_device"] = from.id;
    line.start_edge = horizontal ? (dx > 0 ? "right" : "left") : dy > 0 ? "bottom" : "top";
    line[to.type === "port" ? "end_port" : "end_device"] = to.id;
    line.end_edge = horizontal ? (dx > 0 ? "left" : "right") : dy > 0 ? "top" : "bottom";
    const s = kit().edgeAnchor(a, line.start_edge);
    const e = kit().edgeAnchor(b, line.end_edge);
    if (Math.abs(s[0] - e[0]) > 0.5 && Math.abs(s[1] - e[1]) > 0.5) {
      const mid = horizontal ? round((s[0] + e[0]) / 2, this.#snap) : round((s[1] + e[1]) / 2, this.#snap);
      line.points = horizontal ? [[mid, s[1]], [mid, e[1]]] : [[s[0], mid], [e[0], mid]];
    }
    this.#config.datalines = [...(this.#config.datalines || []), line];
    this.#sel = { kind: "line", list: "datalines", index: this.#config.datalines.length - 1 };
    this.#tab = "lines";
    this.#formKey = "";
    this.#commit();
  }

  #select(sel) {
    if (JSON.stringify(sel) === JSON.stringify(this.#sel)) return;
    this.#sel = sel;
    if (sel?.kind === "item") this.#tab = "items";
    if (sel?.kind === "line") this.#tab = "lines";
    this.#drawOverlay();
    this.#renderPanel();
  }

  #key(ev) {
    if (!this.isConnected || !this.#built) return;
    const path = ev.composedPath?.() ?? [];
    const typing = path.some((el) => el?.tagName && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) ||
      path.some((el) => el?.isContentEditable || el?.tagName === "HA-CODE-EDITOR");
    if (typing) return;
    const mod = ev.ctrlKey || ev.metaKey;
    if (mod && ev.key.toLowerCase() === "z") {
      ev.preventDefault();
      if (ev.shiftKey) this.#redo();
      else this.#undo();
      return;
    }
    if (mod && ev.key.toLowerCase() === "y") {
      ev.preventDefault();
      this.#redo();
      return;
    }
    if (ev.key === "Escape" && this.#fs) {
      this.#fullscreen(false);
      return;
    }
    if (!path.includes(this) && !this.#fs) return;
    const target = this.#selected();
    if (!target) return;
    if (ev.key === "Delete" || ev.key === "Backspace") {
      ev.preventDefault();
      this.#remove();
      return;
    }
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (!arrows[ev.key] || this.#sel.kind !== "item") return;
    ev.preventDefault();
    const [x, y] = arrows[ev.key].map((v) => v * (ev.shiftKey ? 10 : 1));
    const next = clone(this.#config);
    const item = this.#locate(next, target);
    if (UNIT_TYPES.includes(item.type)) item.u = Math.max(1, item.u + Math.sign(y) * 0.5);
    else item.at = [item.at[0] + x, item.at[1] + y];
    if (this.#validate(next)) return;
    this.#config = next;
    this.#commit();
  }

  // ---------- structure ----------

  #add(type, parentPath) {
    const parent = parentPath ? itemAt(this.#config, parentPath) : null;
    const item = { type, id: uniqueId(this.#config, type), ...clone(NEW_ITEM[type]) };
    if (UNIT_TYPES.includes(type)) {
      const u = freeUnit(parent, item.units);
      if (u === null) {
        this.#flash(`No free unit left in rack '${parent.id}'.`);
        return;
      }
      item.u = u;
    } else if (type === "port") {
      const n = parent.items.length;
      item.at = [n * ((parent.size ?? 12) + 2), 0];
    } else if (parent) item.at = [10, 10];
    else {
      const svg = this.#mapSvg();
      const vb = svg?.viewBox?.baseVal;
      item.at = vb ? [round(vb.x + vb.width / 2 - 40, 10), round(vb.y + vb.height / 2 - 20, 10)] : [20, 20];
    }
    if (type === "ports") {
      item.items.push({ type: "port", id: uniqueId(this.#config, `${item.id}_1`), at: [0, 0], state: "active" });
    }
    const list = parent ? (parent.items = parent.items || []) : this.#config.items;
    list.push(item);
    walkItems(this.#config.items, (it, path) => {
      if (it === item) this.#sel = { kind: "item", path };
    });
    this.#tab = "items";
    this.#formKey = "";
    this.#commit();
  }

  #duplicate() {
    const s = this.#sel;
    if (s?.kind === "line") {
      const copy = clone(this.#selected());
      copy.id = uniqueId(this.#config, copy.id);
      this.#config[s.list].splice(s.index + 1, 0, copy);
      this.#sel = { ...s, index: s.index + 1 };
      this.#commit();
      return;
    }
    const item = this.#selected();
    if (!item) return;
    const copy = clone(item);
    const rename = (it) => {
      it.id = uniqueId(this.#config, it.id);
      allIdsCache.add(it.id);
      (it.items || []).forEach(rename);
    };
    const allIdsCache = allIds(this.#config);
    rename(copy);
    if (UNIT_TYPES.includes(copy.type)) {
      const rack = itemAt(this.#config, s.path.slice(0, -1));
      const u = freeUnit(rack, copy.units ?? 1);
      if (u === null) {
        this.#flash(`No free unit left in rack '${rack.id}'.`);
        return;
      }
      copy.u = u;
    } else if (copy.at) copy.at = [copy.at[0] + 10, copy.at[1] + 10];
    const list = listOf(this.#config, s.path);
    list.splice(s.path[s.path.length - 1] + 1, 0, copy);
    this.#sel = { kind: "item", path: [...s.path.slice(0, -1), s.path[s.path.length - 1] + 1] };
    this.#formKey = "";
    this.#commit();
  }

  #remove() {
    const s = this.#sel;
    if (!s) return;
    if (s.kind === "line") {
      this.#config[s.list].splice(s.index, 1);
      if (!this.#config[s.list].length) delete this.#config[s.list];
    } else {
      const item = this.#selected();
      const gone = new Set();
      walkItems([item], (it) => gone.add(it.id));
      listOf(this.#config, s.path).splice(s.path[s.path.length - 1], 1);
      dropReferences(this.#config, gone);
    }
    this.#sel = null;
    this.#formKey = "";
    this.#commit();
  }

  #reorder(delta) {
    const s = this.#sel;
    if (s?.kind !== "item") return;
    const list = listOf(this.#config, s.path);
    const i = s.path[s.path.length - 1];
    const j = i + delta;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    this.#sel = { kind: "item", path: [...s.path.slice(0, -1), j] };
    this.#formKey = "";
    this.#commit();
  }

  #flash(message) {
    this.#error.hidden = false;
    this.#error.textContent = message;
  }

  // ---------- fullscreen ----------

  async #fullscreen(on) {
    if (on === this.#fs) return;
    this.#fs = on;
    this.#root.classList.toggle("fs", on);
    const button = this.shadowRoot.querySelector('[data-a="fs"]');
    button.innerHTML = `<ha-icon icon="${on ? "mdi:fullscreen-exit" : "mdi:fullscreen"}"></ha-icon><span>${on ? "Exit full screen" : "Full screen"}</span>`;
    if (on) {
      this.#fsApi = false;
      try {
        if (this.#root.requestFullscreen) {
          await this.#root.requestFullscreen({ navigationUI: "hide" });
          this.#fsApi = true;
        }
      } catch {
        // falls back to a fixed overlay
      }
    } else if (this.#fsApi) {
      this.#fsApi = false;
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
      } catch {
        // already left
      }
    }
    this.#schedule();
  }

  // ---------- side panel ----------

  #renderPanel() {
    if (!this.#built) return;
    for (const b of this.shadowRoot.querySelectorAll(".tabs button")) b.classList.toggle("on", b.dataset.tab === this.#tab);
    const target = this.#selected();
    const key = JSON.stringify([this.#tab, this.#sel, target?.type, this.#structure()]);
    if (key === this.#formKey) {
      for (const form of this.#forms) form.data = form.read();
      return;
    }
    this.#formKey = key;
    this.#forms = [];
    this.#panel.replaceChildren();
    if (this.#tab === "items") this.#itemsPanel();
    else if (this.#tab === "lines") this.#linesPanel();
    else this.#cardPanel();
  }

  #structure() {
    const ids = [];
    walkItems(this.#config.items, (it) => ids.push(`${it.id}:${it.type}`));
    const lines = ["datalines", "powerlines"].map((l) => (this.#config[l] || []).map((x) => x.id).join());
    return [ids.join(), lines, Object.keys(this.#config.vlans || {}).join()];
  }

  #form(schema, read, write, labels = LABELS) {
    const form = document.createElement("ha-form");
    form.hass = this.#hass;
    form.schema = schema;
    form.read = read;
    form.data = read();
    form.computeLabel = (field) => labels[field.name] ?? field.name.replace(/_/g, " ");
    form.addEventListener("value-changed", (ev) => {
      ev.stopPropagation();
      const before = this.#last;
      const draft = clone(this.#config);
      write(ev.detail.value || {}, draft);
      const error = this.#validate(draft);
      this.#config = draft;
      this.#last = before;
      this.#commit({ panel: false });
      if (error) this.#flash(error);
    });
    this.#forms.push(form);
    return form;
  }

  #button(icon, text, action, title = text) {
    const b = document.createElement("button");
    b.className = "b";
    b.title = title;
    b.innerHTML = `<ha-icon icon="${icon}"></ha-icon>${text ? `<span>${esc(text)}</span>` : ""}`;
    b.addEventListener("click", (ev) => {
      ev.stopPropagation();
      action();
    });
    return b;
  }

  #typeSelect(types, onPick, label) {
    const s = document.createElement("select");
    s.className = "s";
    s.innerHTML = `<option value="">${esc(label)}</option>${types.map((t) => `<option value="${t}">${t}</option>`).join("")}`;
    s.addEventListener("change", () => {
      if (s.value) onPick(s.value);
      s.value = "";
    });
    return s;
  }

  #itemsPanel() {
    const { CHILD_TYPES } = kit();
    const tree = document.createElement("div");
    tree.className = "tree";
    if (!this.#config.items.length) tree.innerHTML = `<div class="empty">No items yet.</div>`;
    walkItems(this.#config.items, (item, path) => {
      const row = document.createElement("div");
      const on = this.#sel?.kind === "item" && this.#sel.path.join() === path.join();
      row.className = `row${on ? " on" : ""}`;
      row.style.paddingLeft = `${6 + (path.length - 1) * 16}px`;
      row.innerHTML = `<ha-icon icon="${ICONS[item.type] ?? "mdi:shape"}"></ha-icon><span class="grow">${esc(item.id)} <span class="muted">${
        esc(item.type)
      }</span></span>`;
      row.addEventListener("click", () => this.#select({ kind: "item", path }));
      tree.appendChild(row);
    });
    this.#panel.appendChild(tree);
    const actions = document.createElement("div");
    actions.className = "actions";
    actions.appendChild(this.#typeSelect(CHILD_TYPES.top, (t) => this.#add(t, null), "Add item…"));
    const item = this.#sel?.kind === "item" ? this.#selected() : null;
    if (item) {
      const children = CHILD_TYPES[item.type] ?? [];
      if (children.length) actions.appendChild(this.#typeSelect(children, (t) => this.#add(t, this.#sel.path), `Add inside ${item.id}…`));
      actions.append(
        this.#button("mdi:arrow-up", "", () => this.#reorder(-1), "Draw earlier (below)"),
        this.#button("mdi:arrow-down", "", () => this.#reorder(1), "Draw later (on top)"),
        this.#button("mdi:content-copy", "Duplicate", () => this.#duplicate()),
        this.#button("mdi:delete-outline", "Delete", () => this.#remove()),
      );
    }
    this.#panel.appendChild(actions);
    if (!item) return;
    const h = document.createElement("h4");
    h.textContent = `${item.type} · ${item.id}`;
    this.#panel.appendChild(h);
    const objectRefs = new Set(ENTITY_KEYS.filter((k) => item[k] && typeof item[k] === "object"));
    const schema = itemSchema(item.type, this.#config, { objectRefs });
    const id = item.id;
    this.#panel.appendChild(this.#form(schema, () => this.#itemData(this.#locate(this.#config, { id }) ?? item), (v, draft) => {
      const target = this.#locate(draft, { id });
      if (target) this.#writeItem(target, v, draft);
    }));
  }

  #itemData(item) {
    const data = {};
    for (const [k, v] of Object.entries(item)) if (k !== "items" && k !== "type") data[k] = v;
    if (Array.isArray(item.at)) [data.at_x, data.at_y] = item.at;
    if (Array.isArray(item.size)) [data.size_w, data.size_h] = item.size;
    if (item.units === true) data.units = "true";
    return data;
  }

  #writeItem(item, v, draft) {
    const keys = kit().ITEM_KEYS[item.type];
    const oldId = item.id;
    for (const key of keys) {
      if (key === "type" || key === "items") continue;
      if (key === "at") {
        if (v.at_x !== undefined || v.at_y !== undefined) item.at = [Number(v.at_x) || 0, Number(v.at_y) || 0];
        continue;
      }
      if (key === "size" && PAIR_SIZE.includes(item.type)) {
        if (v.size_w || v.size_h) item.size = [Number(v.size_w) || 1, Number(v.size_h) || 1];
        else delete item.size;
        continue;
      }
      let value = v[key];
      if (key === "id") value = String(value ?? "").trim() || oldId;
      if (key === "units" && item.type === "badge") value = value === "true" ? true : value;
      setOrDelete(item, key, value === false && BOOL_KEYS.includes(key) ? undefined : value);
    }
    if (item.id !== oldId) {
      if (allIds(draft).has(item.id) && [...collect(draft, item.id)].length > 1) item.id = oldId;
      else renameId(draft, oldId, item.id);
    }
  }

  #linesPanel() {
    const tree = document.createElement("div");
    tree.className = "tree";
    let count = 0;
    for (const [list, kind] of [["datalines", "data"], ["powerlines", "power"]]) {
      (this.#config[list] || []).forEach((line, index) => {
        count++;
        const row = document.createElement("div");
        const on = this.#sel?.kind === "line" && this.#sel.list === list && this.#sel.index === index;
        row.className = `row${on ? " on" : ""}`;
        const from = line.start_device ?? line.start_port ?? "open";
        const to = line.end_device ?? line.end_port ?? "open";
        row.innerHTML = `<ha-icon icon="${kind === "power" ? "mdi:power-plug" : "mdi:ethernet-cable"}"></ha-icon><span class="grow">${
          esc(line.id)
        } <span class="muted">${esc(from)} → ${esc(to)}</span></span>`;
        row.addEventListener("click", () => this.#select({ kind: "line", list, index }));
        tree.appendChild(row);
      });
    }
    if (!count) tree.innerHTML = `<div class="empty">No cables yet. Select a device, then Shift+click another device or port on the map.</div>`;
    this.#panel.appendChild(tree);
    const actions = document.createElement("div");
    actions.className = "actions";
    const line = this.#sel?.kind === "line" ? this.#selected() : null;
    if (line) {
      const other = this.#sel.list === "datalines" ? "powerlines" : "datalines";
      actions.append(
        this.#button("mdi:swap-horizontal", "Reverse", () => this.#reverse()),
        this.#button(
          other === "powerlines" ? "mdi:power-plug" : "mdi:ethernet-cable",
          other === "powerlines" ? "Make power cable" : "Make data cable",
          () => this.#switchKind(),
        ),
        this.#button("mdi:content-copy", "Duplicate", () => this.#duplicate()),
        this.#button("mdi:delete-outline", "Delete", () => this.#remove()),
      );
    }
    this.#panel.appendChild(actions);
    if (!line) return;
    const h = document.createElement("h4");
    h.textContent = `${this.#sel.list === "datalines" ? "Data" : "Power"} cable · ${line.id}`;
    this.#panel.appendChild(h);
    const kind = this.#sel.list === "datalines" ? "data" : "power";
    const ref = { list: this.#sel.list, index: this.#sel.index };
    const read = () => {
      const l = this.#config[ref.list]?.[ref.index] ?? {};
      const data = { ...l };
      if (Array.isArray(l.points)) data.points = l.points.map((p) => p.join(",")).join(" ");
      return data;
    };
    this.#panel.appendChild(this.#form(lineSchema(kind, this.#config), read, (v, draft) => {
      const target = draft[ref.list]?.[ref.index];
      if (!target) return;
      const keys = kind === "data" ? kit().DATALINE_KEYS : kit().LINE_KEYS;
      const oldId = target.id;
      for (const key of keys) {
        let value = v[key];
        if (key === "points") {
          const pts = String(value ?? "").split(/[\s;]+/).map((s) => s.split(",").map(Number)).filter((p) => p.length === 2 && p.every(Number.isFinite));
          value = pts.length ? pts : undefined;
        }
        if ((key === "start_point" || key === "end_point" || key === "rates_size") && value !== undefined && value !== "") value = Number(value);
        if (key === "rates_at" && /^\d+(\.\d+)?$/.test(String(value ?? ""))) value = Number(value);
        if (key === "id") value = String(value ?? "").trim() || oldId;
        setOrDelete(target, key, value);
      }
      if (target.id !== oldId && [...collect(draft, target.id)].length > 1) target.id = oldId;
    }));
  }

  #reverse() {
    const line = this.#selected();
    const swap = (a, b) => {
      const t = line[a];
      setOrDelete(line, a, line[b]);
      setOrDelete(line, b, t);
    };
    for (const k of ["device", "port", "edge", "point"]) swap(`start_${k}`, `end_${k}`);
    if (line.points) line.points.reverse();
    if (line.rx || line.tx) swap("rx", "tx");
    this.#formKey = "";
    this.#commit();
  }

  #switchKind() {
    const s = this.#sel;
    const line = this.#selected();
    const to = s.list === "datalines" ? "powerlines" : "datalines";
    const keys = to === "powerlines" ? kit().LINE_KEYS : kit().DATALINE_KEYS;
    const moved = Object.fromEntries(Object.entries(line).filter(([k]) => keys.includes(k)));
    if (to === "powerlines" && moved.flow === "dominant") delete moved.flow;
    if (to === "powerlines" && (moved.start_device ?? moved.start_port) === undefined) return this.#flash("A power cable needs both ends connected.");
    if (to === "powerlines" && (moved.end_device ?? moved.end_port) === undefined) return this.#flash("A power cable needs both ends connected.");
    this.#config[s.list].splice(s.index, 1);
    if (!this.#config[s.list].length) delete this.#config[s.list];
    this.#config[to] = [...(this.#config[to] || []), moved];
    this.#sel = { kind: "line", list: to, index: this.#config[to].length - 1 };
    this.#formKey = "";
    this.#commit();
  }

  #cardPanel() {
    const { BACKGROUNDS } = kit();
    const schema = [
      { type: "grid", name: "", schema: [{ name: "line_radius", selector: num(1, 0) }, { name: "scale", selector: num(0.05, 0.1) }] },
      { name: "font", selector: { text: {} } },
      { name: "icon_color", selector: { text: {} } },
      { name: "background", selector: { text: {} } },
      { name: "vlans", selector: { object: {} } },
      {
        type: "grid",
        name: "",
        schema: ["fit_viewport", "vlan_toggle", "power_toggle", "animation_toggle", "debug_toggle", "debug"].map((name) => ({
          name,
          selector: { boolean: {} },
        })),
      },
      { type: "grid", name: "", schema: [{ name: "toggles_at_x", selector: num(1) }, { name: "toggles_at_y", selector: num(1) }] },
    ];
    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = `Background: ${BACKGROUNDS.join(", ")}, a colour such as "#1a2230" or an image URL such as /local/background.jpg.`;
    this.#panel.appendChild(this.#form(schema, () => {
      const data = { ...this.#config };
      if (Array.isArray(data.toggles_at)) [data.toggles_at_x, data.toggles_at_y] = data.toggles_at;
      return data;
    }, (v, draft) => {
      for (const key of ["line_radius", "scale", "font", "icon_color", "background", "vlans"]) setOrDelete(draft, key, v[key]);
      for (const key of ["fit_viewport", "vlan_toggle", "power_toggle", "animation_toggle", "debug_toggle", "debug"]) {
        setOrDelete(draft, key, v[key] || undefined);
      }
      if (v.toggles_at_x !== undefined || v.toggles_at_y !== undefined) draft.toggles_at = [Number(v.toggles_at_x) || 0, Number(v.toggles_at_y) || 0];
    }));
    this.#panel.appendChild(hint);
  }
}

function* collect(config, id) {
  const found = [];
  walkItems(config.items, (it) => {
    if (it.id === id) found.push(it);
  });
  for (const list of ["datalines", "powerlines"]) for (const line of config[list] || []) if (line.id === id) found.push(line);
  yield* found;
}

if (!customElements.get(EDITOR_TYPE)) customElements.define(EDITOR_TYPE, HaHomelabMapEditor);
