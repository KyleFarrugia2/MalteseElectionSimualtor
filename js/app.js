const SEATS_PER_DISTRICT = 5;
const TOTAL_SEATS = 65;
const MAJORITY = 33;

const LEADER_IMAGES = {
  pl: "images/Robert-PL.jpg",
  pn: "images/alex-pn.jpg",
};

const PARTIES = {
  none: { id: "none", label: "Unassigned", short: "—" },
  pl: {
    id: "pl",
    label: "Partit Laburista",
    short: "PL",
    leader: "Robert Abela",
    image: LEADER_IMAGES.pl,
  },
  pn: {
    id: "pn",
    label: "Partit Nazzjonalista",
    short: "PN",
    leader: "Alex Borg",
    image: LEADER_IMAGES.pn,
  },
};

const CLICK_ORDER = ["none", "pl", "pn"];
const GOZO_ID = "gozo";
const GOZO_DISTRICT_ID = 13;

const GOZO_META = {
  id: GOZO_ID,
  displayName: "Gozo",
  districtId: GOZO_DISTRICT_ID,
};

const ELECTION_AUDIO = {
  victorySounds: [
    "Victory/victory-sound-effect_KsQZNCBl.mp3",
    "Victory/VICTORY SOUND EFFECT -  FREE.mp3",
  ],
  plWin: "Audio Clips/PL WIN.mp3",
  pnWin: "Audio Clips/PN WIN.mp3",
  unassignedSubmit: "AreYouSure/omni-man-are-you-sure-sound-effect_RjhkhH8Y.mp3",
};

const SIM_FIXED_PL = ["amrun", "siggiewi"];
const SIM_FIXED_PN = ["sliema", "san-giljan", "san-gwann"];

const MAP_COLORS = {
  none: { fill: "#cbd5e1", stroke: "#64748b" },
  pl: { fill: "#ef4444", stroke: "#fecaca" },
  pn: { fill: "#2563eb", stroke: "#bfdbfe" },
};

const councilStates = new Map();
let mapData = null;
let lastClick = { id: null, time: 0 };
let activeElectionAudio = [];

const councilsLayer = document.getElementById("councils-layer");
const cominoLayer = document.getElementById("comino-layer");
const labelsLayer = document.getElementById("labels-layer");
const townPicker = document.getElementById("town-picker");
const tooltip = document.getElementById("map-tooltip");
const mapWrap = document.getElementById("map-wrap");

const MAP_ZOOM_MIN = 1;
const MAP_ZOOM_MAX = 8;
let mapBaseViewBox = null;
let mapViewState = null;
let mapPointerSession = null;
let mapActivePointers = new Map();
let mapPinchSession = null;
let mapBlockClick = false;

const MAP_PAN_THRESHOLD = 8;

const plSeatsEl = document.getElementById("pl-seats");
const pnSeatsEl = document.getElementById("pn-seats");
const plBarEl = document.getElementById("pl-bar");
const pnBarEl = document.getElementById("pn-bar");
const plTownsEl = document.getElementById("pl-towns");
const pnTownsEl = document.getElementById("pn-towns");
const unassignedEl = document.getElementById("unassigned-towns");

const resetBtn = document.getElementById("reset-btn");
const submitBtn = document.getElementById("submit-btn");
const simulateBtn = document.getElementById("simulate-btn");
const simOddsInput = document.getElementById("sim-odds");
const simOddsValue = document.getElementById("sim-odds-value");
const simOddsLabel = document.getElementById("sim-odds-label");
const simPartyPlBtn = document.getElementById("sim-party-pl");
const simPartyPnBtn = document.getElementById("sim-party-pn");
const simModeSwingBtn = document.getElementById("sim-mode-swing");
const simModeElectionBtn = document.getElementById("sim-mode-election");
const simDescEl = document.getElementById("sim-desc");
const resultEyebrowEl = document.getElementById("result-eyebrow");
const submitErrorEl = document.getElementById("submit-error");
const resultModal = document.getElementById("result-modal");
const closeModalBtn = document.getElementById("close-modal");
const modalOkBtn = document.getElementById("modal-ok");

let simOddsParty = "pl";
let simMode = "swing";

function getSimOddsConfig() {
  const percent = Number(simOddsInput?.value ?? 52);
  const plChance =
    simOddsParty === "pl" ? percent / 100 : 1 - percent / 100;
  return { party: simOddsParty, percent, plChance, mode: simMode };
}

function syncOddsControls() {
  const isSwingMode = simMode === "swing";

  if (simDescEl) {
    simDescEl.textContent = isSwingMode
      ? "Each swing locality is assigned randomly by your chosen odds. Fixed strongholds always apply."
      : "Rolls whether your chosen party wins the election (33+ seats), then fills the map to match.";
  }

  if (simOddsLabel) {
    if (isSwingMode) {
      simOddsLabel.textContent =
        simOddsParty === "pl"
          ? "PL win chance in swing towns"
          : "PN win chance in swing towns";
    } else {
      simOddsLabel.textContent =
        simOddsParty === "pl"
          ? "PL chance to win the election"
          : "PN chance to win the election";
    }
  }

  if (simOddsValue && simOddsInput) {
    simOddsValue.textContent = `${simOddsInput.value}%`;
  }

  if (simPartyPlBtn && simPartyPnBtn) {
    simPartyPlBtn.classList.toggle("is-active", simOddsParty === "pl");
    simPartyPnBtn.classList.toggle("is-active", simOddsParty === "pn");
    simPartyPlBtn.setAttribute("aria-pressed", simOddsParty === "pl");
    simPartyPnBtn.setAttribute("aria-pressed", simOddsParty === "pn");
  }

  if (simModeSwingBtn && simModeElectionBtn) {
    simModeSwingBtn.classList.toggle("is-active", isSwingMode);
    simModeElectionBtn.classList.toggle("is-active", !isSwingMode);
    simModeSwingBtn.setAttribute("aria-pressed", isSwingMode);
    simModeElectionBtn.setAttribute("aria-pressed", !isSwingMode);
  }

  if (simOddsInput) {
    simOddsInput.min = "1";
    simOddsInput.max = "100";
    if (Number(simOddsInput.value) < Number(simOddsInput.min)) {
      simOddsInput.value = simOddsInput.min;
    }
    if (Number(simOddsInput.value) > Number(simOddsInput.max)) {
      simOddsInput.value = simOddsInput.max;
    }
    simOddsInput.classList.toggle("odds-slider-pn", simOddsParty === "pn");
  }
}

function setSimOddsParty(party) {
  simOddsParty = party === "pn" ? "pn" : "pl";
  syncOddsControls();
}

function setSimMode(mode) {
  simMode = mode === "election" ? "election" : "swing";
  syncOddsControls();
}

function init() {
  mapData = window.DISTRICT_MAP;
  if (!mapData?.councils) {
    document.querySelector(".map-wrap").innerHTML =
      '<p style="padding:1rem;color:#fca5a5;">Map data failed to load.</p>';
    return;
  }

  const svg = document.getElementById("malta-map");
  if (mapData.viewBox) {
    svg.setAttribute("viewBox", mapData.viewBox);
  }

  const [, , width, height] = mapData.viewBox.split(/\s+/).map(Number);
  const ocean = svg.querySelector(".map-ocean");
  if (ocean) {
    ocean.setAttribute("width", width);
    ocean.setAttribute("height", height);
  }

  mapData.councils
    .filter((council) => council.districtId !== GOZO_DISTRICT_ID)
    .forEach((council) => {
      councilStates.set(council.id, "none");
    });
  councilStates.set(GOZO_ID, "none");

  renderComino();
  renderMap();
  getMaltaCouncils().forEach((council) => paintCouncil(council.id, "none"));
  paintCouncil(GOZO_ID, "none");
  renderTownPicker();
  updateTally();
  bindControls();
  bindMapZoom();
  syncOddsControls();
}

function getMapSvg() {
  return document.getElementById("malta-map");
}

function clampMapViewBox(x, y, w, h) {
  const minW = mapBaseViewBox.w / MAP_ZOOM_MAX;
  const minH = mapBaseViewBox.h / MAP_ZOOM_MAX;
  w = Math.max(minW, Math.min(mapBaseViewBox.w, w));
  h = Math.max(minH, Math.min(mapBaseViewBox.h, h));

  const padX = w * 0.05;
  const padY = h * 0.05;
  const minX = mapBaseViewBox.x - padX;
  const maxX = mapBaseViewBox.x + mapBaseViewBox.w - w + padX;
  const minY = mapBaseViewBox.y - padY;
  const maxY = mapBaseViewBox.y + mapBaseViewBox.h - h + padY;

  return {
    x: Math.min(maxX, Math.max(minX, x)),
    y: Math.min(maxY, Math.max(minY, y)),
    w,
    h,
  };
}

function applyMapViewBox() {
  const svg = getMapSvg();
  if (!svg || !mapViewState) return;
  svg.setAttribute(
    "viewBox",
    `${mapViewState.x} ${mapViewState.y} ${mapViewState.w} ${mapViewState.h}`
  );
}

function resetMapViewBox() {
  mapViewState = { ...mapBaseViewBox };
  applyMapViewBox();
}

function screenPointToSvg(clientX, clientY) {
  const svg = getMapSvg();
  if (!svg) return null;

  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  const matrix = svg.getScreenCTM();
  if (!matrix) return null;
  return point.matrixTransform(matrix.inverse());
}

function zoomMapAt(factor, clientX, clientY) {
  if (!mapViewState) return;

  const svgPoint = screenPointToSvg(clientX, clientY);
  if (!svgPoint) return;

  const current = mapViewState;
  const nextW = current.w / factor;
  const nextH = current.h / factor;
  const nextX = svgPoint.x - ((svgPoint.x - current.x) * nextW) / current.w;
  const nextY = svgPoint.y - ((svgPoint.y - current.y) * nextH) / current.h;

  mapViewState = clampMapViewBox(nextX, nextY, nextW, nextH);
  applyMapViewBox();
}

function panMapByScreenDelta(dx, dy, baseViewBox) {
  const scaleX = baseViewBox.w / mapWrap.clientWidth;
  const scaleY = baseViewBox.h / mapWrap.clientHeight;
  mapViewState = clampMapViewBox(
    baseViewBox.x - dx * scaleX,
    baseViewBox.y - dy * scaleY,
    baseViewBox.w,
    baseViewBox.h
  );
  applyMapViewBox();
}

function shouldBlockMapClick() {
  return mapBlockClick;
}

function bindMapZoom() {
  const svg = getMapSvg();
  if (!svg || !mapWrap || !mapData?.viewBox) return;

  const parts = mapData.viewBox.split(/\s+/).map(Number);
  mapBaseViewBox = { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
  resetMapViewBox();

  mapWrap.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
      zoomMapAt(factor, event.clientX, event.clientY);
    },
    { passive: false }
  );

  const clearPointerSession = () => {
    mapPointerSession = null;
    mapPinchSession = null;
    mapWrap.classList.remove("map-panning");
  };

  const getPinchMetrics = () => {
    const points = [...mapActivePointers.values()];
    if (points.length < 2) return null;
    const [a, b] = points;
    return {
      distance: Math.hypot(b.x - a.x, b.y - a.y),
      centerX: (a.x + b.x) / 2,
      centerY: (a.y + b.y) / 2,
    };
  };

  mapWrap.addEventListener("pointerdown", (event) => {
    if (event.button > 0 || event.target.closest(".map-zoom-btn")) return;

    mapActivePointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });

    if (mapActivePointers.size === 2) {
      mapPointerSession = null;
      const metrics = getPinchMetrics();
      if (metrics) {
        mapPinchSession = { ...metrics, viewBox: { ...mapViewState } };
      }
      return;
    }

    if (mapActivePointers.size === 1) {
      mapPointerSession = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        viewBox: { ...mapViewState },
        panning: false,
        captured: false,
        townGroup: event.target.closest(".town-group"),
      };
    }
  });

  mapWrap.addEventListener(
    "pointermove",
    (event) => {
      if (!mapActivePointers.has(event.pointerId)) return;

      mapActivePointers.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });

      if (mapActivePointers.size >= 2) {
        const metrics = getPinchMetrics();
        if (!metrics || !mapPinchSession) return;

        event.preventDefault();
        const factor = metrics.distance / mapPinchSession.distance;
        if (Math.abs(factor - 1) > 0.008) {
          zoomMapAt(factor, metrics.centerX, metrics.centerY);
          mapPinchSession.distance = metrics.distance;
          mapPinchSession.centerX = metrics.centerX;
          mapPinchSession.centerY = metrics.centerY;
        }
        return;
      }

      if (
        !mapPointerSession ||
        event.pointerId !== mapPointerSession.pointerId
      ) {
        return;
      }

      const dx = event.clientX - mapPointerSession.startX;
      const dy = event.clientY - mapPointerSession.startY;

      if (!mapPointerSession.panning) {
        if (Math.hypot(dx, dy) < MAP_PAN_THRESHOLD) return;
        mapPointerSession.panning = true;
        mapPointerSession.townGroup = null;
        mapWrap.classList.add("map-panning");
        if (!mapPointerSession.captured) {
          mapWrap.setPointerCapture(event.pointerId);
          mapPointerSession.captured = true;
        }
      }

      event.preventDefault();
      panMapByScreenDelta(dx, dy, mapPointerSession.viewBox);
    },
    { passive: false }
  );

  const endPointer = (event) => {
    mapActivePointers.delete(event.pointerId);

    if (mapPointerSession?.pointerId === event.pointerId) {
      if (mapPointerSession.panning) {
        mapBlockClick = true;
        window.setTimeout(() => {
          mapBlockClick = false;
        }, 50);
      } else if (mapPointerSession.townGroup) {
        const councilId = mapPointerSession.townGroup.dataset.councilId;
        if (councilId) {
          cycleCouncil(councilId);
          mapBlockClick = true;
          window.setTimeout(() => {
            mapBlockClick = false;
          }, 300);
        }
      }
      clearPointerSession();
    }

    if (mapActivePointers.size < 2) {
      mapPinchSession = null;
    }

    if (mapActivePointers.size === 1) {
      const remaining = [...mapActivePointers.entries()][0];
      mapPointerSession = {
        pointerId: remaining[0],
        startX: remaining[1].x,
        startY: remaining[1].y,
        viewBox: { ...mapViewState },
        panning: false,
        captured: false,
        townGroup: null,
      };
    }

    if (mapWrap.hasPointerCapture?.(event.pointerId)) {
      mapWrap.releasePointerCapture(event.pointerId);
    }
  };

  mapWrap.addEventListener("pointerup", endPointer);
  mapWrap.addEventListener("pointercancel", endPointer);

  document.getElementById("map-zoom-in")?.addEventListener("click", () => {
    const rect = mapWrap.getBoundingClientRect();
    zoomMapAt(1.35, rect.left + rect.width / 2, rect.top + rect.height / 2);
  });

  document.getElementById("map-zoom-out")?.addEventListener("click", () => {
    const rect = mapWrap.getBoundingClientRect();
    zoomMapAt(1 / 1.35, rect.left + rect.width / 2, rect.top + rect.height / 2);
  });

  document.getElementById("map-zoom-reset")?.addEventListener("click", resetMapViewBox);

  const fullscreenBtn = document.getElementById("map-fullscreen");
  fullscreenBtn?.addEventListener("click", () => {
    if (document.fullscreenElement === mapWrap) {
      document.exitFullscreen?.();
      return;
    }

    if (mapWrap.requestFullscreen) {
      mapWrap.requestFullscreen();
      return;
    }

    mapWrap.classList.toggle("map-expanded");
    fullscreenBtn.setAttribute(
      "aria-label",
      mapWrap.classList.contains("map-expanded")
        ? "Exit expanded map"
        : "Fullscreen map"
    );
  });

  document.addEventListener("fullscreenchange", () => {
    const isFullscreen = document.fullscreenElement === mapWrap;
    mapWrap.classList.toggle("map-fullscreen-active", isFullscreen);
    fullscreenBtn?.setAttribute(
      "aria-label",
      isFullscreen ? "Exit fullscreen map" : "Fullscreen map"
    );
  });
}

function getMaltaCouncils() {
  return mapData.councils.filter(
    (council) => council.districtId !== GOZO_DISTRICT_ID
  );
}

function getGozoCouncils() {
  return mapData.councils.filter(
    (council) => council.districtId === GOZO_DISTRICT_ID
  );
}

function allocateDistrictSeats(plTowns, pnTowns) {
  const assigned = plTowns + pnTowns;
  if (assigned === 0) {
    return { pl: 0, pn: 0 };
  }

  const plQuota = (plTowns / assigned) * SEATS_PER_DISTRICT;
  const pnQuota = (pnTowns / assigned) * SEATS_PER_DISTRICT;

  let plSeats = Math.floor(plQuota);
  let pnSeats = Math.floor(pnQuota);
  let remaining = SEATS_PER_DISTRICT - plSeats - pnSeats;

  const remainders = [
    { party: "pl", value: plQuota - plSeats },
    { party: "pn", value: pnQuota - pnSeats },
  ].sort((a, b) => b.value - a.value);

  for (let i = 0; i < remaining; i += 1) {
    if (remainders[i].party === "pl") {
      plSeats += 1;
    } else {
      pnSeats += 1;
    }
  }

  return { pl: plSeats, pn: pnSeats };
}

function calculateSeatTotals() {
  let plSeats = 0;
  let pnSeats = 0;
  const breakdown = [];

  mapData.districts.forEach((district) => {
    if (district.id === GOZO_DISTRICT_ID) {
      const party = councilStates.get(GOZO_ID);
      const seats =
        party === "pl"
          ? { pl: SEATS_PER_DISTRICT, pn: 0 }
          : party === "pn"
            ? { pl: 0, pn: SEATS_PER_DISTRICT }
            : { pl: 0, pn: 0 };

      plSeats += seats.pl;
      pnSeats += seats.pn;
      breakdown.push({
        district,
        plTowns: party === "pl" ? 1 : 0,
        pnTowns: party === "pn" ? 1 : 0,
        plSeats: seats.pl,
        pnSeats: seats.pn,
        isGozo: true,
      });
      return;
    }

    let plTowns = 0;
    let pnTowns = 0;

    district.councilIds.forEach((councilId) => {
      const party = councilStates.get(councilId);
      if (party === "pl") plTowns += 1;
      if (party === "pn") pnTowns += 1;
    });

    const seats = allocateDistrictSeats(plTowns, pnTowns);
    plSeats += seats.pl;
    pnSeats += seats.pn;
    breakdown.push({
      district,
      plTowns,
      pnTowns,
      plSeats: seats.pl,
      pnSeats: seats.pn,
      isGozo: false,
    });
  });

  return { plSeats, pnSeats, breakdown };
}

function renderComino() {
  cominoLayer.replaceChildren();
  if (!mapData.comino?.paths?.length) return;

  mapData.comino.paths.forEach((pathD) => {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pathD);
    path.classList.add("comino");
    cominoLayer.appendChild(path);
  });
}

function renderMap() {
  councilsLayer.replaceChildren();
  labelsLayer.replaceChildren();

  const sorted = [...getMaltaCouncils()].sort((a, b) => a.area - b.area);

  sorted.forEach((council) => {
    councilsLayer.appendChild(createTownGroup(council));

    if (council.area < 500000) {
      addTownLabel(council);
    }
  });

  renderGozoGroup();

  if (mapData.comino?.paths?.length) {
    const cominoLabel = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "text"
    );
    cominoLabel.classList.add("comino-label");
    cominoLabel.setAttribute("x", mapData.comino.labelX || 366);
    cominoLabel.setAttribute("y", mapData.comino.labelY || 145);
    cominoLabel.setAttribute("text-anchor", "middle");
    cominoLabel.textContent = "Comino";
    labelsLayer.appendChild(cominoLabel);
  }
}

function createTownGroup(council) {
  const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
  group.classList.add("town-group");
  group.dataset.councilId = council.id;
  group.dataset.districtId = String(council.districtId);
  group.dataset.party = "none";
  group.setAttribute("role", "button");
  group.setAttribute("tabindex", "0");
  group.setAttribute(
    "aria-label",
    `${council.displayName}. Unassigned. Click for PL.`
  );

  council.paths.forEach((pathD) => {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pathD);
    path.classList.add("town-shape");
    group.appendChild(path);
  });

  bindCouncilInteraction(group, council);
  return group;
}

function renderGozoGroup() {
  const gozoCouncils = getGozoCouncils();
  if (!gozoCouncils.length) return;

  const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
  group.classList.add("town-group", "gozo-group");
  group.dataset.councilId = GOZO_ID;
  group.dataset.districtId = String(GOZO_DISTRICT_ID);
  group.dataset.party = "none";
  group.setAttribute("role", "button");
  group.setAttribute("tabindex", "0");
  group.setAttribute(
    "aria-label",
    "Gozo (District 13). Unassigned. Click for PL."
  );

  gozoCouncils.forEach((council) => {
    council.paths.forEach((pathD) => {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", pathD);
      path.classList.add("town-shape");
      group.appendChild(path);
    });
  });

  bindCouncilInteraction(group, GOZO_META);
  councilsLayer.appendChild(group);

  const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
  label.classList.add("town-label", "gozo-island-label");
  label.setAttribute("text-anchor", "middle");
  label.setAttribute("dominant-baseline", "middle");
  label.textContent = "Gozo";

  requestAnimationFrame(() => {
    const box = group.getBBox();
    label.setAttribute("x", box.x + box.width / 2);
    label.setAttribute("y", box.y + box.height / 2);
    labelsLayer.appendChild(label);
  });
}

function bindCouncilInteraction(group, council) {
  group.addEventListener("click", (event) => {
    if (shouldBlockMapClick()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    event.stopPropagation();
    cycleCouncil(council.id);
  });
  group.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      cycleCouncil(council.id);
    }
  });
  group.addEventListener("mouseenter", (event) => showTooltip(event, council));
  group.addEventListener("mousemove", moveTooltip);
  group.addEventListener("mouseleave", hideTooltip);
  group.addEventListener("focus", (event) => showTooltip(event, council));
  group.addEventListener("blur", hideTooltip);
}

function getTownLabelPosition(council, group) {
  if (council.labelAnchor) {
    return { x: council.labelAnchor.x, y: council.labelAnchor.y };
  }

  const shapes = [...group.querySelectorAll(".town-shape")];
  let bestBox = null;
  let bestArea = 0;

  shapes.forEach((shape) => {
    const box = shape.getBBox();
    const area = box.width * box.height;
    if (area > bestArea) {
      bestArea = area;
      bestBox = box;
    }
  });

  if (!bestBox) {
    return null;
  }

  return {
    x: bestBox.x + bestBox.width / 2,
    y: bestBox.y + bestBox.height / 2,
  };
}

function addTownLabel(council) {
  const group = councilsLayer.querySelector(
    `[data-council-id="${council.id}"]`
  );
  if (!group) return;

  const position = getTownLabelPosition(council, group);
  if (!position) return;

  const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
  label.classList.add("town-label");
  label.setAttribute("x", position.x);
  label.setAttribute("y", position.y);
  label.setAttribute("text-anchor", "middle");
  label.setAttribute("dominant-baseline", "middle");
  label.textContent =
    council.displayName.length > 12
      ? council.displayName.split(" ")[0]
      : council.displayName;
  labelsLayer.appendChild(label);
}

function filterTownPicker(query) {
  const normalized = query.trim().toLowerCase();
  townPicker.querySelectorAll(".picker-district").forEach((section) => {
    const chips = [...section.querySelectorAll(".town-chip")];
    const localities = section.querySelector(".picker-localities")?.textContent || "";
    const districtLabel = section.querySelector("summary")?.textContent || "";
    let visible = 0;

    chips.forEach((chip) => {
      const matches =
        !normalized ||
        chip.textContent.toLowerCase().includes(normalized) ||
        localities.toLowerCase().includes(normalized) ||
        districtLabel.toLowerCase().includes(normalized);
      chip.hidden = !matches;
      if (matches) visible += 1;
    });

    section.hidden = !normalized ? false : visible === 0;
    if (normalized && visible > 0) {
      section.open = true;
    }
  });
}

function renderTownPicker() {
  townPicker.replaceChildren();

  mapData.districts.forEach((district) => {
    const section = document.createElement("details");
    section.className = "picker-district";
    section.open = district.id === 1 || district.id === GOZO_DISTRICT_ID;

    const summary = document.createElement("summary");
    summary.innerHTML = `<span class="district-num">${district.id}</span><span class="district-name">${district.shortLabel || district.label}</span>`;
    section.appendChild(summary);

    if (district.localities?.length) {
      const localities = document.createElement("p");
      localities.className = "picker-localities";
      localities.textContent = district.localities.join(" · ");
      section.appendChild(localities);
    }

    const grid = document.createElement("div");
    grid.className = "town-picker-grid";

    district.councilIds.forEach((councilId) => {
      if (district.id === GOZO_DISTRICT_ID) return;

      const council = mapData.councils.find((c) => c.id === councilId);
      if (!council) return;

      const button = document.createElement("button");
      button.type = "button";
      button.className = "town-chip";
      button.dataset.councilId = council.id;
      button.textContent = council.displayName;
      button.addEventListener("click", () => cycleCouncil(council.id));
      grid.appendChild(button);
    });

    if (district.id === GOZO_DISTRICT_ID) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "town-chip gozo-chip";
      button.dataset.councilId = GOZO_ID;
      button.textContent = "Gozo (District 13)";
      button.addEventListener("click", () => cycleCouncil(GOZO_ID));
      grid.appendChild(button);
    }

    section.appendChild(grid);
    townPicker.appendChild(section);
  });
}

function assignCouncil(councilId, party) {
  councilStates.set(councilId, party);
  paintCouncil(councilId, party);
}

function cycleCouncil(councilId) {
  const now = Date.now();
  if (lastClick.id === councilId && now - lastClick.time < 250) {
    return;
  }
  lastClick = { id: councilId, time: now };

  const current = councilStates.get(councilId) || "none";
  const next = CLICK_ORDER[(CLICK_ORDER.indexOf(current) + 1) % CLICK_ORDER.length];
  assignCouncil(councilId, next);
  updateTally();
}

function paintCouncil(councilId, party) {
  const group = councilsLayer.querySelector(
    `[data-council-id="${councilId}"]`
  );
  const chip = townPicker.querySelector(`[data-council-id="${councilId}"]`);
  const council =
    councilId === GOZO_ID
      ? GOZO_META
      : mapData.councils.find((c) => c.id === councilId);
  const partyInfo = PARTIES[party];

  if (group) {
    group.dataset.party = party;
    group.classList.toggle("town-active", party !== "none");

    const colors = MAP_COLORS[party] || MAP_COLORS.none;
    group.querySelectorAll(".town-shape").forEach((path) => {
      path.setAttribute("fill", colors.fill);
      path.setAttribute("stroke", colors.stroke);
      path.setAttribute("stroke-width", party === "none" ? "0.85" : "1.15");
    });

    group.setAttribute(
      "aria-label",
      `${council.displayName}. ${partyInfo.label}. Click to change.`
    );
  }

  if (chip) {
    chip.dataset.party = party;
  }
}

function updateTally() {
  let plTowns = 0;
  let pnTowns = 0;
  let unassigned = 0;

  councilStates.forEach((party) => {
    if (party === "pl") plTowns += 1;
    else if (party === "pn") pnTowns += 1;
    else unassigned += 1;
  });

  const { plSeats, pnSeats } = calculateSeatTotals();

  plSeatsEl.textContent = String(plSeats);
  pnSeatsEl.textContent = String(pnSeats);
  plTownsEl.textContent = String(plTowns);
  pnTownsEl.textContent = String(pnTowns);
  unassignedEl.textContent = String(unassigned);

  plBarEl.style.width = `${(plSeats / TOTAL_SEATS) * 100}%`;
  pnBarEl.style.width = `${(pnSeats / TOTAL_SEATS) * 100}%`;

  if (submitBtn) {
    submitBtn.textContent =
      unassigned > 0
        ? `Submit Election (${unassigned} unassigned)`
        : "Submit Election";
  }

  if (unassigned === 0) {
    clearSubmitError();
  }
}

function showTooltip(event, council) {
  const party = councilStates.get(council.id) || "none";
  const partyInfo = PARTIES[party];
  const district = mapData.districts.find((d) => d.id === council.districtId);
  const districtLine =
    council.id === GOZO_ID
      ? "District 13 — Gozo & Comino"
      : district?.shortLabel || "";
  const splitLine = council.splitNote
    ? `<span class="tooltip-note">${council.splitNote}</span><br />`
    : "";

  tooltip.hidden = false;
  tooltip.innerHTML = `
    <strong>${council.displayName}</strong>
    ${districtLine}<br />
    ${splitLine}
    ${partyInfo.label}<br />
  `;
  moveTooltip(event);
}

function moveTooltip(event) {
  const rect = mapWrap.getBoundingClientRect();
  tooltip.style.left = `${event.clientX - rect.left}px`;
  tooltip.style.top = `${event.clientY - rect.top}px`;
}

function hideTooltip() {
  tooltip.hidden = true;
}

function stopElectionAudio() {
  activeElectionAudio.forEach((audio) => {
    audio.pause();
    audio.currentTime = 0;
  });
  activeElectionAudio = [];
}

function getNextVictorySound() {
  const sounds = ELECTION_AUDIO.victorySounds;
  if (!sounds.length) {
    return null;
  }

  return sounds[Math.floor(Math.random() * sounds.length)];
}

function playElectionAudio(winner) {
  stopElectionAudio();

  if (winner !== "pl" && winner !== "pn") {
    return;
  }

  const victoryPath = getNextVictorySound();
  const victory = victoryPath ? new Audio(encodeURI(victoryPath)) : null;
  const partyWin = new Audio(
    encodeURI(winner === "pl" ? ELECTION_AUDIO.plWin : ELECTION_AUDIO.pnWin)
  );

  activeElectionAudio = victory ? [victory, partyWin] : [partyWin];

  if (victory) {
    victory.play().catch(() => {});
  }
  partyWin.play().catch(() => {});
}

function playUnassignedSubmitAudio() {
  stopElectionAudio();

  const clip = new Audio(encodeURI(ELECTION_AUDIO.unassignedSubmit));
  activeElectionAudio = [clip];
  clip.play().catch(() => {});
}

function showSubmitError(message) {
  if (!submitErrorEl) return;
  submitErrorEl.textContent = message;
  submitErrorEl.hidden = false;
  submitErrorEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function clearSubmitError() {
  if (!submitErrorEl) return;
  submitErrorEl.hidden = true;
  submitErrorEl.textContent = "";
}

function getFirstUnassignedCouncilId() {
  for (const [councilId, party] of councilStates.entries()) {
    if (party === "none") {
      return councilId;
    }
  }
  return null;
}

function focusUnassignedCouncil(councilId) {
  if (!councilId) return;

  const chip = townPicker.querySelector(`[data-council-id="${councilId}"]`);
  const group = councilsLayer.querySelector(`[data-council-id="${councilId}"]`);

  if (chip) {
    const district = chip.closest(".picker-district");
    if (district) {
      district.open = true;
    }
    chip.scrollIntoView({ behavior: "smooth", block: "nearest" });
    chip.classList.add("town-chip-highlight");
    window.setTimeout(() => chip.classList.remove("town-chip-highlight"), 1800);
  } else if (group) {
    group.classList.add("town-active");
    window.setTimeout(() => group.classList.remove("town-active"), 1800);
  }
}

function bindControls() {
  resetBtn.addEventListener("click", resetMap);
  submitBtn.addEventListener("click", submitElection);
  simulateBtn?.addEventListener("click", simulateElection);
  closeModalBtn.addEventListener("click", () => resultModal.close());
  modalOkBtn.addEventListener("click", () => resultModal.close());
  resultModal.addEventListener("close", stopElectionAudio);

  simPartyPlBtn?.addEventListener("click", () => setSimOddsParty("pl"));
  simPartyPnBtn?.addEventListener("click", () => setSimOddsParty("pn"));
  simModeSwingBtn?.addEventListener("click", () => setSimMode("swing"));
  simModeElectionBtn?.addEventListener("click", () => setSimMode("election"));

  if (simOddsInput) {
    simOddsInput.addEventListener("input", syncOddsControls);
  }

  const townSearch = document.getElementById("town-search");
  if (townSearch) {
    townSearch.addEventListener("input", (event) => {
      filterTownPicker(event.target.value);
    });
  }
}

function resetMap() {
  stopElectionAudio();
  getMaltaCouncils().forEach((council) => {
    councilStates.set(council.id, "none");
    paintCouncil(council.id, "none");
  });
  councilStates.set(GOZO_ID, "none");
  paintCouncil(GOZO_ID, "none");
  updateTally();
}

function winnerMarkup(party) {
  const info = PARTIES[party];
  return `
    <img
      class="winner-photo"
      src="${info.image}"
      alt="${info.leader}, ${info.label}"
      width="88"
      height="88"
    />
    <div>
      <h3>${info.leader}</h3>
      <p>Next Prime Minister · ${info.label}</p>
    </div>
  `;
}

function renderDistrictResultRow(row) {
  const { district, plSeats, pnSeats } = row;
  let winner = "split";
  if (plSeats > pnSeats) winner = "pl";
  else if (pnSeats > plSeats) winner = "pn";

  const winnerText =
    winner === "pl"
      ? "PL wins"
      : winner === "pn"
        ? "PN wins"
        : "Split";

  return `
    <li class="district-result district-result-${winner}">
      <div class="district-result-top">
        <span class="district-result-name">${district.shortLabel}</span>
        <span class="district-result-badge">${winnerText}</span>
      </div>
      <span class="district-result-seats">PL ${plSeats} seats · PN ${pnSeats} seats</span>
    </li>
  `;
}

function showElectionResults(options = {}) {
  const {
    isSimulation = false,
    favouredParty = "pl",
    favouredPercent = 52,
    simMode: resultMode = "swing",
  } = options;
  const { plSeats, pnSeats, breakdown } = calculateSeatTotals();

  const headline = document.getElementById("result-headline");
  const seatsSummary = document.getElementById("result-seats");
  const winnerEl = document.getElementById("result-winner");
  const breakdownEl = document.getElementById("result-breakdown");

  breakdownEl.innerHTML = breakdown.map(renderDistrictResultRow).join("");
  winnerEl.className = "result-winner";

  let electionWinner = null;
  const favouredLabel = favouredParty === "pl" ? "PL" : "PN";
  const oddsNote = isSimulation
    ? resultMode === "election"
      ? `${favouredPercent}% ${favouredLabel} chance to win the election`
      : `${favouredPercent}% ${favouredLabel} swing town odds`
    : "";

  if (resultEyebrowEl) {
    resultEyebrowEl.textContent = isSimulation ? "Simulated Result" : "Election Result";
  }

  if (plSeats >= MAJORITY) {
    headline.textContent = isSimulation
      ? `Simulation: ${PARTIES.pl.leader} projected to win`
      : `${PARTIES.pl.leader} wins`;
    seatsSummary.textContent = isSimulation
      ? `Partit Laburista — ${plSeats} of 65 seats projected (${oddsNote})`
      : `Partit Laburista — ${plSeats} of 65 seats (33 needed for a majority)`;
    winnerEl.classList.add("pl-win");
    winnerEl.innerHTML = winnerMarkup("pl");
    electionWinner = "pl";
  } else if (pnSeats >= MAJORITY) {
    headline.textContent = isSimulation
      ? `Simulation: ${PARTIES.pn.leader} projected to win`
      : `${PARTIES.pn.leader} wins`;
    seatsSummary.textContent = isSimulation
      ? `Partit Nazzjonalista — ${pnSeats} of 65 seats projected (${oddsNote})`
      : `Partit Nazzjonalista — ${pnSeats} of 65 seats (33 needed for a majority)`;
    winnerEl.classList.add("pn-win");
    winnerEl.innerHTML = winnerMarkup("pn");
    electionWinner = "pn";
  } else {
    headline.textContent = isSimulation ? "Simulation: Hung parliament" : "Hung parliament";
    seatsSummary.textContent = isSimulation
      ? `PL ${plSeats} · PN ${pnSeats} seats — no majority (${oddsNote})`
      : `PL ${plSeats} seats · PN ${pnSeats} seats — no majority reached`;
    winnerEl.classList.add("tie");
    winnerEl.innerHTML = `
      <div class="winner-badge">?</div>
      <div>
        <h3>${isSimulation ? "Too close to call" : "No clear winner"}</h3>
        <p>Neither party reached 33 seats.</p>
      </div>
    `;
  }

  if (!resultModal.open) {
    resultModal.showModal();
  }

  if (electionWinner) {
    playElectionAudio(electionWinner);
  }
}

function applyFixedStrongholds() {
  SIM_FIXED_PL.forEach((councilId) => assignCouncil(councilId, "pl"));
  SIM_FIXED_PN.forEach((councilId) => assignCouncil(councilId, "pn"));
}

function getSwingCouncilIds() {
  const fixed = new Set([...SIM_FIXED_PL, ...SIM_FIXED_PN]);
  const ids = getMaltaCouncils()
    .filter((council) => !fixed.has(council.id))
    .map((council) => council.id);

  if (!fixed.has(GOZO_ID)) {
    ids.push(GOZO_ID);
  }

  return ids;
}

function hasMajority(party) {
  const { plSeats, pnSeats } = calculateSeatTotals();
  return party === "pl" ? plSeats >= MAJORITY : pnSeats >= MAJORITY;
}

function simulateSwingTownsMode(plChance) {
  applyFixedStrongholds();

  getSwingCouncilIds().forEach((councilId) => {
    assignCouncil(councilId, Math.random() < plChance ? "pl" : "pn");
  });
}

function simulateElectionWinMode(party, percent) {
  applyFixedStrongholds();

  const favouredWins = Math.random() < percent / 100;
  const targetParty = favouredWins ? party : party === "pl" ? "pn" : "pl";
  const swingIds = getSwingCouncilIds();
  let plBias = targetParty === "pl" ? 0.58 : 0.42;

  for (let attempt = 0; attempt < 200; attempt += 1) {
    swingIds.forEach((councilId) => {
      assignCouncil(councilId, Math.random() < plBias ? "pl" : "pn");
    });

    if (hasMajority(targetParty)) {
      return;
    }

    plBias =
      targetParty === "pl"
        ? Math.min(0.92, plBias + 0.03)
        : Math.max(0.08, plBias - 0.03);
  }

  swingIds.forEach((councilId) => assignCouncil(councilId, targetParty));
}

function simulateElection() {
  clearSubmitError();
  stopElectionAudio();

  const { party, percent, plChance, mode } = getSimOddsConfig();

  if (mode === "election") {
    simulateElectionWinMode(party, percent);
  } else {
    simulateSwingTownsMode(plChance);
  }

  updateTally();
  showElectionResults({
    isSimulation: true,
    favouredParty: party,
    favouredPercent: percent,
    simMode: mode,
  });
}

function submitElection() {
  clearSubmitError();

  let unassigned = 0;
  councilStates.forEach((party) => {
    if (party === "none") unassigned += 1;
  });

  if (unassigned > 0) {
    const label = unassigned === 1 ? "locality" : "localities";
    showSubmitError(
      `Assign every town and Gozo before submitting. ${unassigned} ${label} still unassigned — use the map or search below.`
    );
    focusUnassignedCouncil(getFirstUnassignedCouncilId());
    playUnassignedSubmitAudio();
    return;
  }

  try {
    showElectionResults({ isSimulation: false });
  } catch (error) {
    showSubmitError("Something went wrong showing the results. Please refresh and try again.");
    console.error(error);
  }
}

init();
