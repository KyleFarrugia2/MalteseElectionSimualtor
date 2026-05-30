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
  victory: "Victory/victory-sound-effect_KsQZNCBl.mp3",
  plWin: "Audio Clips/PL WIN.mp3",
  pnWin: "Audio Clips/PN WIN.mp3",
};

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
let mapPanSession = null;
let mapTouchPinch = null;

const plSeatsEl = document.getElementById("pl-seats");
const pnSeatsEl = document.getElementById("pn-seats");
const plBarEl = document.getElementById("pl-bar");
const pnBarEl = document.getElementById("pn-bar");
const plTownsEl = document.getElementById("pl-towns");
const pnTownsEl = document.getElementById("pn-towns");
const unassignedEl = document.getElementById("unassigned-towns");

const resetBtn = document.getElementById("reset-btn");
const submitBtn = document.getElementById("submit-btn");
const submitErrorEl = document.getElementById("submit-error");
const resultModal = document.getElementById("result-modal");
const closeModalBtn = document.getElementById("close-modal");
const modalOkBtn = document.getElementById("modal-ok");

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
      const factor = event.deltaY < 0 ? 1.18 : 1 / 1.18;
      zoomMapAt(factor, event.clientX, event.clientY);
    },
    { passive: false }
  );

  mapWrap.addEventListener("mousedown", (event) => {
    if (!event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    mapPanSession = {
      startX: event.clientX,
      startY: event.clientY,
      viewBox: { ...mapViewState },
    };
    mapWrap.classList.add("map-panning");
  });

  window.addEventListener("mousemove", (event) => {
    if (!mapPanSession) return;

    const scaleX = mapPanSession.viewBox.w / mapWrap.clientWidth;
    const scaleY = mapPanSession.viewBox.h / mapWrap.clientHeight;
    const dx = (event.clientX - mapPanSession.startX) * scaleX;
    const dy = (event.clientY - mapPanSession.startY) * scaleY;

    mapViewState = clampMapViewBox(
      mapPanSession.viewBox.x - dx,
      mapPanSession.viewBox.y - dy,
      mapPanSession.viewBox.w,
      mapPanSession.viewBox.h
    );
    applyMapViewBox();
  });

  window.addEventListener("mouseup", () => {
    mapPanSession = null;
    mapWrap.classList.remove("map-panning");
  });

  mapWrap.addEventListener(
    "touchstart",
    (event) => {
      if (event.touches.length === 2) {
        const [a, b] = event.touches;
        mapTouchPinch = {
          distance: Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY),
          centerX: (a.clientX + b.clientX) / 2,
          centerY: (a.clientY + b.clientY) / 2,
        };
      }
    },
    { passive: true }
  );

  mapWrap.addEventListener(
    "touchmove",
    (event) => {
      if (event.touches.length !== 2 || !mapTouchPinch) return;
      event.preventDefault();

      const [a, b] = event.touches;
      const distance = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
      const factor = distance / mapTouchPinch.distance;
      if (Math.abs(factor - 1) > 0.01) {
        zoomMapAt(factor, mapTouchPinch.centerX, mapTouchPinch.centerY);
        mapTouchPinch.distance = distance;
      }
    },
    { passive: false }
  );

  mapWrap.addEventListener("touchend", () => {
    mapTouchPinch = null;
  });

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

function cycleCouncil(councilId) {
  const now = Date.now();
  if (lastClick.id === councilId && now - lastClick.time < 250) {
    return;
  }
  lastClick = { id: councilId, time: now };

  const current = councilStates.get(councilId) || "none";
  const next = CLICK_ORDER[(CLICK_ORDER.indexOf(current) + 1) % CLICK_ORDER.length];
  councilStates.set(councilId, next);
  paintCouncil(councilId, next);
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

function playElectionAudio(winner) {
  stopElectionAudio();

  if (winner !== "pl" && winner !== "pn") {
    return;
  }

  const victory = new Audio(encodeURI(ELECTION_AUDIO.victory));
  const partyWin = new Audio(
    encodeURI(winner === "pl" ? ELECTION_AUDIO.plWin : ELECTION_AUDIO.pnWin)
  );

  activeElectionAudio = [victory, partyWin];

  victory.play().catch(() => {});
  partyWin.play().catch(() => {});
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
  closeModalBtn.addEventListener("click", () => resultModal.close());
  modalOkBtn.addEventListener("click", () => resultModal.close());
  resultModal.addEventListener("close", stopElectionAudio);

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
    return;
  }

  try {
    const { plSeats, pnSeats, breakdown } = calculateSeatTotals();

    const headline = document.getElementById("result-headline");
    const seatsSummary = document.getElementById("result-seats");
    const winnerEl = document.getElementById("result-winner");
    const breakdownEl = document.getElementById("result-breakdown");

    breakdownEl.innerHTML = breakdown.map(renderDistrictResultRow).join("");

    winnerEl.className = "result-winner";

    let electionWinner = null;

    if (plSeats >= MAJORITY) {
      headline.textContent = `${PARTIES.pl.leader} wins`;
      seatsSummary.textContent = `Partit Laburista — ${plSeats} of 65 seats (33 needed for a majority)`;
      winnerEl.classList.add("pl-win");
      winnerEl.innerHTML = winnerMarkup("pl");
      electionWinner = "pl";
    } else if (pnSeats >= MAJORITY) {
      headline.textContent = `${PARTIES.pn.leader} wins`;
      seatsSummary.textContent = `Partit Nazzjonalista — ${pnSeats} of 65 seats (33 needed for a majority)`;
      winnerEl.classList.add("pn-win");
      winnerEl.innerHTML = winnerMarkup("pn");
      electionWinner = "pn";
    } else {
      headline.textContent = "Hung parliament";
      seatsSummary.textContent = `PL ${plSeats} seats · PN ${pnSeats} seats — no majority reached`;
      winnerEl.classList.add("tie");
      winnerEl.innerHTML = `
      <div class="winner-badge">?</div>
      <div>
        <h3>No clear winner</h3>
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
  } catch (error) {
    showSubmitError("Something went wrong showing the results. Please refresh and try again.");
    console.error(error);
  }
}

init();
