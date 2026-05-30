const fs = require('fs');
const path = require('path');

// Whole local councils → electoral district (official 13 districts).
// Localities split across districts share one council polygon — assigned to the district listed first in the official register.
const COUNCIL_TO_DISTRICT = {
  Valletta: 1,
  Floriana: 1,
  "Ħamrun": 1,
  Marsa: 1,
  "Santa Venera": 1,

  Birgu: 2,
  Senglea: 2,
  Cospicua: 2,
  Żabbar: 2,
  Kalkara: 2,
  Xaghra: 2,

  Żejtun: 3,
  Għaxaq: 3,
  Marsaskala: 3,
  Marsaxlokk: 3,

  Fgura: 4,
  Gudja: 4,
  Paola: 4,
  "Santa Lucija": 4,
  Tarxien: 4,

  Birżebbuġa: 5,
  Kirkop: 5,
  Mqabba: 5,
  Qrendi: 5,
  Safi: 5,
  Żurrieq: 5,

  Luqa: 6,
  Qormi: 6,
  Siggiewi: 6,

  Dingli: 7,
  Mdina: 7,
  Mtarfa: 7,
  Rabat: 7,
  "Zebbug (Malta)": 7,

  Birkirkara: 8,
  Iklin: 8,
  Lija: 8,
  Balzan: 8,

  Għargħur: 9,
  Msida: 9,
  "Pietà": 9,
  "San Gwann": 9,
  Swieqi: 9,
  "Ta'Xbiex": 9,

  Gzira: 10,
  Pembroke: 10,
  "San Giljan": 10,
  Sliema: 10,
  Naxxar: 10,

  Attard: 11,
  Mosta: 11,

  Mġarr: 12,
  Mellieħa: 12,
  "Saint Paul's Bay": 12,

  Għajnsielem: 13,
  Victoria: 13,
  Fontana: 13,
  Munxar: 13,
  Qala: 13,
  Nadur: 13,
  Xagħra: 13,
  Xewkija: 13,
  "Zebbug (Gozo)": 13,
  Għarb: 13,
  Għasri: 13,
  "San Lawrenz": 13,
  Sannat: 13,
  Kerċem: 13,
};

const DISTRICT_LOCALITIES = {
  1: [
    "Il-Belt Valletta",
    "Birkirkara (part — Fleur-de-Lys)",
    "Il-Furjana",
    "Il-Ħamrun",
    "Il-Marsa",
    "Gwardamanġa",
    "Santa Venera",
  ],
  2: [
    "Il-Birgu",
    "L-Isla",
    "Bormla",
    "Ħaż-Żabbar (incl. St. Peter's)",
    "Marsaskala (part)",
    "Il-Kalkara",
    "Ix-Xgħajra",
    "Il-Fgura (Tal-Gallu area)",
  ],
  3: ["Iż-Żejtun", "Ħal Għaxaq", "Marsaskala (part)", "Marsaxlokk"],
  4: [
    "Il-Fgura (Mater Boni Consigli & Tal-Liedna)",
    "Il-Gudja",
    "Paola",
    "Santa Luċija",
    "Ħal Tarxien",
  ],
  5: [
    "Birżebbuġa",
    "Ħal Kirkop",
    "L-Imqabba",
    "Il-Qrendi",
    "Ħal Safi",
    "Iż-Żurrieq (incl. Bubaqra)",
  ],
  6: ["Ħal Luqa", "Ħal Qormi", "Is-Siġġiewi", "Ħal Farruġ (Ħal Luqa)"],
  7: [
    "Ħad-Dingli",
    "L-Imdina",
    "L-Imtarfa",
    "Ir-Rabat (incl. Il-Baħrija & Tal-Virtù)",
    "Ħaż-Żebbuġ (Malta)",
  ],
  8: [
    "Birkirkara (incl. Fleur-de-Lys & part of Swatar)",
    "L-Iklin",
    "Ħal Lija",
    "Ħal Balzan",
    "In-Naxxar (part)",
  ],
  9: [
    "Ħal Għargħur",
    "L-Imsida (incl. part of Swatar)",
    "Tal-Pietà",
    "San Ġwann (incl. Il-Kappara)",
    "Is-Swieqi (incl. Tal-Ibraġ & Il-Madliena)",
    "Ta' Xbiex",
  ],
  10: [
    "Il-Gżira",
    "Pembroke",
    "San Ġiljan (incl. Paceville)",
    "Tas-Sliema",
    "In-Naxxar (San Pawl tat-Tarġa, Birguma, Magħtab & Salina)",
    "Baħar iċ-Ċagħaq",
  ],
  11: ["Ħ'Attard", "Il-Mosta"],
  12: [
    "L-Imġarr",
    "Il-Mellieħa (incl. Il-Manikata)",
    "San Pawl il-Baħar (incl. Burmarrad)",
  ],
  13: [
    "Gozo & Comino",
    "Ir-Rabat (Victoria)",
    "Il-Fontana",
    "Għajnsielem (incl. Comino)",
    "L-Għarb",
    "L-Għasri",
    "Ta' Kerċem (incl. Santa Luċija)",
    "Il-Munxar",
    "Ix-Xlendi",
    "In-Nadur",
    "Il-Qala",
    "San Lawrenz",
    "Ta' Sannat",
    "Ix-Xagħra",
    "Ix-Xewkija",
    "Iż-Żebbuġ (incl. Marsalforn)",
  ],
};

const SPLIT_COUNCIL_NOTES = {
  Birkirkara: "Split between District 1 (Fleur-de-Lys) and District 8 on map shown in D8",
  Marsaskala: "Split between District 2 and District 3 — shown in D3",
  Fgura: "Split between District 2 (Tal-Gallu) and District 4 — shown in D4",
  Naxxar: "Split between District 8 and District 10 — shown in D10",
};

const DISTRICT_LABELS = {
  1: "District 1",
  2: "District 2",
  3: "District 3",
  4: "District 4",
  5: "District 5",
  6: "District 6",
  7: "District 7",
  8: "District 8",
  9: "District 9",
  10: "District 10",
  11: "District 11",
  12: "District 12",
  13: "District 13",
};

const DISPLAY_NAMES = {
  "San Gwann": "San Ġwann",
  "San Giljan": "St Julian's",
  "Ta'Xbiex": "Ta' Xbiex",
  "Zebbug (Malta)": "Żebbuġ",
  "Zebbug (Gozo)": "Żebbuġ (Gozo)",
  "Saint Paul's Bay": "St. Paul's Bay",
  Gzira: "Gżira",
  "Santa Lucija": "Santa Luċija",
  "Santa Venera": "Santa Venera",
  Ħamrun: "Ħamrun",
  Pietà: "Pietà",
  Għargħur: "Għargħur",
  Mellieħa: "Mellieħa",
  Għajnsielem: "Għajnsielem",
  Għarb: "Għarb",
  Għasri: "Għasri",
  "San Lawrenz": "San Lawrenz",
  Kerċem: "Kerċem",
  Xagħra: "Xagħra",
  Xaghra: "Xagħra (Malta)",
  Żurrieq: "Żurrieq",
  Żabbar: "Żabbar",
  Żejtun: "Żejtun",
  Birżebbuġa: "Birżebbuġa",
  Għaxaq: "Għaxaq",
  Mġarr: "Mġarr",
};

const MAP_WIDTH = 960;
const MAP_HEIGHT = 580;
const PADDING = 24;

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function project(lng, lat) {
  const scale = 9200;
  const x = (lng - 14.15) * scale;
  const y = (36.18 - lat) * scale;
  return [x, y];
}

function collectRings(geometry) {
  if (geometry.type === "Polygon") {
    return geometry.coordinates;
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.flat();
  }
  return [];
}

function ringCentroid(ring) {
  let lng = 0;
  let lat = 0;
  ring.forEach(([lo, la]) => {
    lng += lo;
    lat += la;
  });
  return [lng / ring.length, lat / ring.length];
}

function ringArea(ring) {
  let area = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const [x1, y1] = project(ring[i][0], ring[i][1]);
    const [x2, y2] = project(ring[i + 1][0], ring[i + 1][1]);
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area / 2);
}

function isGozoRegion(feature) {
  const region = feature.properties.NAME_1 || "";
  return region === "Għawdex" || feature.properties.GID_1 === "MLT.2_1";
}

function isCominoRing(ring) {
  const [lng, lat] = ringCentroid(ring);
  return (
    lng >= 14.318 &&
    lng <= 14.356 &&
    lat >= 36.002 &&
    lat <= 36.021
  );
}

function pathBboxArea(pathD) {
  const nums = pathD.match(/-?\d+\.?\d*/g).map(Number);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < nums.length; i += 2) {
    minX = Math.min(minX, nums[i]);
    maxX = Math.max(maxX, nums[i]);
    minY = Math.min(minY, nums[i + 1]);
    maxY = Math.max(maxY, nums[i + 1]);
  }
  return (maxX - minX) * (maxY - minY);
}

function dropTinyPathSlivers(paths) {
  if (paths.length <= 1) {
    return paths;
  }

  const withArea = paths.map((pathD) => ({ pathD, area: pathBboxArea(pathD) }));
  const maxArea = Math.max(...withArea.map((entry) => entry.area));
  const kept = withArea
    .filter((entry) => entry.area >= maxArea * 0.05)
    .map((entry) => entry.pathD);

  return kept.length ? kept : [withArea.sort((a, b) => b.area - a.area)[0].pathD];
}

function labelAnchorFromPaths(paths) {
  if (!paths.length) {
    return null;
  }

  const boxes = paths.map((pathD) => {
    const nums = pathD.match(/-?\d+\.?\d*/g).map(Number);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < nums.length; i += 2) {
      minX = Math.min(minX, nums[i]);
      maxX = Math.max(maxX, nums[i]);
      minY = Math.min(minY, nums[i + 1]);
      maxY = Math.max(maxY, nums[i + 1]);
    }
    const area = (maxX - minX) * (maxY - minY);
    return {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
      area,
    };
  });

  const largest = boxes.reduce((best, current) =>
    current.area > best.area ? current : best
  );

  return {
    x: Math.round(largest.x * 10) / 10,
    y: Math.round(largest.y * 10) / 10,
  };
}

function ringToNormalizedPath(ring, bounds) {
  const { minX, minY, maxX, maxY } = bounds;
  const innerW = MAP_WIDTH - PADDING * 2;
  const innerH = MAP_HEIGHT - PADDING * 2;
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;

  return ring
    .map(([lng, lat], index) => {
      const [x, y] = project(lng, lat);
      const nx = PADDING + ((x - minX) / spanX) * innerW;
      const ny = PADDING + ((y - minY) / spanY) * innerH;
      const rx = Math.round(nx * 10) / 10;
      const ry = Math.round(ny * 10) / 10;
      return `${index === 0 ? "M" : "L"}${rx},${ry}`;
    })
    .join(" ") + " Z";
}

const geojson = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "..", "data", "malta-councils.geojson"),
    "utf8"
  )
);

const allPoints = [];
geojson.features.forEach((feature) => {
  collectRings(feature.geometry).forEach((ring) => {
    ring.forEach(([lng, lat]) => {
      allPoints.push(project(lng, lat));
    });
  });
});

const bounds = {
  minX: Math.min(...allPoints.map(([x]) => x)),
  maxX: Math.max(...allPoints.map(([x]) => x)),
  minY: Math.min(...allPoints.map(([, y]) => y)),
  maxY: Math.max(...allPoints.map(([, y]) => y)),
};

const comino = { paths: [] };
const councils = [];
const districtMeta = {};

for (let i = 1; i <= 13; i += 1) {
  districtMeta[i] = {
    id: i,
    label: DISTRICT_LABELS[i],
    shortLabel: i === 13 ? "District 13 — Gozo" : DISTRICT_LABELS[i],
    localities: DISTRICT_LOCALITIES[i],
    councilIds: [],
  };
}

let unmapped = [];

geojson.features.forEach((feature) => {
  const rawName = feature.properties.NAME_2;
  const isGozo = isGozoRegion(feature);

  if (rawName === "Xaghra" && isGozo) {
    return;
  }

  let districtId = COUNCIL_TO_DISTRICT[rawName];
  if (!districtId) {
    unmapped.push(rawName);
    districtId = 12;
  }

  if (isGozo && rawName !== "Xaghra") {
    districtId = 13;
  }

  const councilId = slugify(rawName);
  const displayName = DISPLAY_NAMES[rawName] || rawName;
  const paths = [];
  let area = 0;

  collectRings(feature.geometry).forEach((ring) => {
    if (isCominoRing(ring)) {
      comino.paths.push(ringToNormalizedPath(ring, bounds));
      return;
    }

    paths.push(ringToNormalizedPath(ring, bounds));
    area += ringArea(ring);
  });

  if (!paths.length) {
    return;
  }

  const councilPaths = dropTinyPathSlivers(paths);
  const councilArea = councilPaths.reduce(
    (total, pathD) => total + pathBboxArea(pathD),
    0
  );

  councils.push({
    id: councilId,
    name: rawName,
    displayName,
    districtId,
    splitNote: SPLIT_COUNCIL_NOTES[rawName] || null,
    paths: councilPaths,
    area: Math.round(councilArea),
    labelAnchor: labelAnchorFromPaths(councilPaths),
  });

  districtMeta[districtId].councilIds.push(councilId);
});

if (unmapped.length) {
  console.warn("Unmapped councils:", unmapped);
}

if (comino.paths.length) {
  const cominoPoints = [];
  comino.paths.forEach((pathD) => {
    const nums = pathD.match(/[\d.]+/g).map(Number);
    for (let i = 0; i < nums.length; i += 2) {
      cominoPoints.push([nums[i], nums[i + 1]]);
    }
  });
  comino.labelX =
    Math.round(
      (cominoPoints.reduce((s, p) => s + p[0], 0) / cominoPoints.length) * 10
    ) / 10;
  comino.labelY =
    Math.round(
      (cominoPoints.reduce((s, p) => s + p[1], 0) / cominoPoints.length) * 10
    ) / 10;
}

const output = {
  viewBox: `0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`,
  comino,
  councils: councils.sort((a, b) => a.area - b.area),
  districts: Object.values(districtMeta),
};

fs.writeFileSync(
  path.join(__dirname, "..", "data", "district-map.json"),
  JSON.stringify(output)
);

fs.writeFileSync(
  path.join(__dirname, "..", "js", "district-map-data.js"),
  `window.DISTRICT_MAP = ${JSON.stringify(output)};`
);

console.log("Councils:", output.councils.length);
console.log("Comino paths:", comino.paths.length);
console.log(
  "San Gwann:",
  output.councils.find((c) => c.id === "san-gwann") ? "yes" : "MISSING"
);
console.log(
  "Gozo councils:",
  output.councils.filter((c) => c.districtId === 13).map((c) => c.displayName).join(", ")
);
