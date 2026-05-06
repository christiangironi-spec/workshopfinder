const state = {
  map: null,
  geocoder: null,
  placesLib: null,
  circle: null,
  markers: [],
  results: [],
  filteredResults: [],
};

const els = {
  apiKeyInput: document.querySelector("#apiKeyInput"),
  loadMapsButton: document.querySelector("#loadMapsButton"),
  countryInput: document.querySelector("#countryInput"),
  cityInput: document.querySelector("#cityInput"),
  goToCityButton: document.querySelector("#goToCityButton"),
  keywordInput: document.querySelector("#keywordInput"),
  radiusInput: document.querySelector("#radiusInput"),
  radiusValue: document.querySelector("#radiusValue"),
  searchForm: document.querySelector("#searchForm"),
  searchButton: document.querySelector("#searchButton"),
  exportButton: document.querySelector("#exportButton"),
  statusTitle: document.querySelector("#statusTitle"),
  statusText: document.querySelector("#statusText"),
  resultCount: document.querySelector("#resultCount"),
  resultsBody: document.querySelector("#resultsBody"),
  tableFilter: document.querySelector("#tableFilter"),
  sectionResizer: document.querySelector("#sectionResizer"),
  workspace: document.querySelector(".workspace"),
};

const savedKey = localStorage.getItem("googleMapsApiKey");
if (savedKey) {
  els.apiKeyInput.value = savedKey;
  window.setTimeout(() => loadGoogleMaps(savedKey), 200);
}

els.radiusInput.addEventListener("input", () => {
  const radius = Number(els.radiusInput.value);
  els.radiusValue.textContent = formatRadius(radius);
  if (state.circle) {
    state.circle.setRadius(radius);
  }
});

els.loadMapsButton.addEventListener("click", () => {
  const apiKey = els.apiKeyInput.value.trim();
  if (!apiKey) {
    setStatus("Missing key", "Enter a valid Google Maps API key.", true);
    return;
  }

  localStorage.setItem("googleMapsApiKey", apiKey);
  loadGoogleMaps(apiKey);
});

els.goToCityButton.addEventListener("click", () => {
  goToCity();
});

els.searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  searchPlaces();
});

els.tableFilter.addEventListener("input", () => {
  const query = els.tableFilter.value.trim().toLowerCase();
  state.filteredResults = state.results.filter((result) => {
    return [result.name, result.address, result.phone, result.website]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(query));
  });
  renderResults();
});

els.exportButton.addEventListener("click", () => {
  exportCsv();
});

els.sectionResizer.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  const workspaceRect = els.workspace.getBoundingClientRect();
  const minMapHeight = 240;
  const minResultsHeight = 240;

  els.sectionResizer.setPointerCapture(event.pointerId);
  els.sectionResizer.classList.add("is-dragging");
  document.body.classList.add("is-resizing");

  const resize = (moveEvent) => {
    const desiredHeight = moveEvent.clientY - workspaceRect.top;
    const maxMapHeight = workspaceRect.height - minResultsHeight - els.sectionResizer.offsetHeight;
    const mapHeight = clamp(desiredHeight, minMapHeight, Math.max(minMapHeight, maxMapHeight));
    els.workspace.style.setProperty("--map-height", `${Math.round(mapHeight)}px`);

    if (state.map && state.circle) {
      google.maps.event.trigger(state.map, "resize");
      state.map.panTo(state.circle.getCenter());
    }
  };

  const stop = () => {
    els.sectionResizer.classList.remove("is-dragging");
    document.body.classList.remove("is-resizing");
    els.sectionResizer.removeEventListener("pointermove", resize);
    els.sectionResizer.removeEventListener("pointerup", stop);
    els.sectionResizer.removeEventListener("pointercancel", stop);
  };

  els.sectionResizer.addEventListener("pointermove", resize);
  els.sectionResizer.addEventListener("pointerup", stop);
  els.sectionResizer.addEventListener("pointercancel", stop);
});

function loadGoogleMaps(apiKey) {
  if (window.google?.maps) {
    initMap();
    return;
  }

  setStatus("Loading", "Loading Google Maps and Places.");
  window.initWorkshopFinder = initMap;

  const script = document.createElement("script");
  script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&loading=async&callback=initWorkshopFinder`;
  script.async = true;
  script.onerror = () => {
    setStatus("Error", "Google Maps could not be loaded. Check key, billing, and enabled APIs.", true);
  };
  document.head.appendChild(script);
}

async function initMap() {
  const center = { lat: 45.4642, lng: 9.19 };
  state.map = new google.maps.Map(document.querySelector("#map"), {
    center,
    zoom: 12,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true,
  });
  state.placesLib = await google.maps.importLibrary("places");
  state.circle = new google.maps.Circle({
    center,
    radius: Number(els.radiusInput.value),
    map: state.map,
    draggable: true,
    editable: true,
    fillColor: "#19715f",
    fillOpacity: 0.14,
    strokeColor: "#19715f",
    strokeOpacity: 0.88,
    strokeWeight: 2,
  });

  state.circle.addListener("radius_changed", () => {
    const radius = Math.round(state.circle.getRadius());
    els.radiusInput.value = String(clamp(radius, Number(els.radiusInput.min), Number(els.radiusInput.max)));
    els.radiusValue.textContent = formatRadius(radius);
  });

  state.circle.addListener("center_changed", () => {
    state.map.panTo(state.circle.getCenter());
  });

  setControlsEnabled(true);
  setStatus("Map ready", "Choose country and city, then adjust the circle on the map.");
  goToCity();
}

function setControlsEnabled(enabled) {
  els.goToCityButton.disabled = !enabled;
  els.radiusInput.disabled = !enabled;
  els.searchButton.disabled = !enabled;
}

function goToCity() {
  const country = els.countryInput.value.trim();
  const city = els.cityInput.value.trim();
  const address = [city, country].filter(Boolean).join(", ");

  if (!address) {
    setStatus("Missing location", "Enter at least a city or a country.", true);
    return;
  }

  setStatus("Locating area", `Moving the map to ${address}.`);
  resolveCityWithPlaces(address);
}

async function resolveCityWithPlaces(address) {
  try {
    const { Place } = state.placesLib;
    const { places } = await Place.searchByText({
      textQuery: address,
      fields: ["displayName", "formattedAddress", "location", "viewport", "id", "googleMapsURI"],
      maxResultCount: 1,
      language: "en",
    });

    if (!places?.length || !places[0].location) {
      setStatus("Area not found", "Try a more specific name, for example 'Milan, Italy'.", true);
      return;
    }

    moveMapTo(places[0].location, places[0].viewport);
  } catch (error) {
    console.error("City lookup failed", error);
    setStatus(
      "Map ready",
      "The city could not be located automatically. You can move the circle and search anyway.",
      true,
    );
  }
}

function moveMapTo(location, viewport) {
  if (viewport) {
    state.map.fitBounds(viewport);
  } else {
    state.map.setCenter(location);
    state.map.setZoom(12);
  }

  state.circle.setCenter(location);
  setStatus("Area set", "You can now move the circle or run the search.");
}

function searchPlaces() {
  const keyword = els.keywordInput.value.trim();
  if (!keyword) {
    setStatus("Missing query", "Enter a search query such as auto repair, tire shop, or auto electrician.", true);
    return;
  }

  clearMarkers();
  state.results = [];
  state.filteredResults = [];
  renderResults("Search in progress...");
  els.searchButton.disabled = true;
  els.exportButton.disabled = true;
  els.tableFilter.disabled = true;
  setStatus("Searching", `Searching for "${keyword}" in the selected area.`);

  searchByTextInArea(keyword)
    .then((places) => {
      if (!places.length) {
        els.searchButton.disabled = false;
        renderResults("No results found.");
        setStatus("No results", "Try increasing the radius or changing the search query.", true);
        return;
      }

      fetchPlaceDetails(places.slice(0, 60));
    })
    .catch((error) => {
      console.error("Place search failed", error);
      els.searchButton.disabled = false;
      renderResults("No results found.");
      setStatus("Search blocked", "Check that Places API (New) is enabled for this Google key.", true);
    });
}

async function searchByTextInArea(keyword) {
  const { Place, SearchByTextRankPreference } = state.placesLib;
  const center = state.circle.getCenter();
  const radius = Math.round(state.circle.getRadius());
  const city = els.cityInput.value.trim();
  const country = els.countryInput.value.trim();
  const textQuery = [keyword, city, country].filter(Boolean).join(" ");

  const { places } = await Place.searchByText({
    textQuery,
    fields: [
      "id",
      "displayName",
      "formattedAddress",
      "nationalPhoneNumber",
      "internationalPhoneNumber",
      "websiteURI",
      "googleMapsURI",
      "location",
      "businessStatus",
    ],
    locationBias: {
      center: { lat: center.lat(), lng: center.lng() },
      radius,
    },
    maxResultCount: 20,
    rankPreference: SearchByTextRankPreference.RELEVANCE,
    language: "en",
  });

  return places || [];
}

async function fetchPlaceDetails(places) {
  for (let index = 0; index < places.length; index += 1) {
    const place = places[index];
    setStatus("Details", `Completing record ${index + 1} of ${places.length}.`);

    addResult(place);

    renderResults();
  }

  state.filteredResults = [...state.results];
  renderResults();
  els.searchButton.disabled = false;
  els.exportButton.disabled = state.results.length === 0;
  els.tableFilter.disabled = state.results.length === 0;
  setStatus("Search complete", `${state.results.length} businesses found in the selected area.`);
}

function addResult(place) {
  const placeId = place.id || place.place_id || "";
  if (state.results.some((result) => result.placeId === placeId)) {
    return;
  }

  const location = place.location || place.geometry?.location;
  const name = place.displayName || place.name || "Unnamed";
  const website = stringifyUri(place.websiteURI || place.website || "");
  const mapsUrl = stringifyUri(
    place.googleMapsURI || place.url || (placeId ? `https://www.google.com/maps/place/?q=place_id:${placeId}` : ""),
  );
  const result = {
    placeId,
    name: typeof name === "string" ? name : name.text || "Unnamed",
    address: place.formattedAddress || place.formatted_address || place.vicinity || "",
    phone: place.internationalPhoneNumber || place.nationalPhoneNumber || place.international_phone_number || "",
    website,
    mapsUrl,
    lat: location?.lat?.() || "",
    lng: location?.lng?.() || "",
    businessStatus: place.businessStatus || place.business_status || "",
  };

  state.results.push(result);
  state.filteredResults = [...state.results];

  if (location) {
    const marker = new google.maps.Marker({
      map: state.map,
      position: location,
      title: result.name,
    });
    marker.addListener("click", () => {
      window.open(result.mapsUrl, "_blank", "noopener");
    });
    state.markers.push(marker);
  }
}

function renderResults(emptyText = "No search yet.") {
  els.resultCount.textContent = `${state.filteredResults.length} ${state.filteredResults.length === 1 ? "business" : "businesses"}`;

  if (!state.filteredResults.length) {
    els.resultsBody.innerHTML = `<tr class="empty-row"><td colspan="5">${escapeHtml(emptyText)}</td></tr>`;
    return;
  }

  els.resultsBody.innerHTML = state.filteredResults
    .map((result) => {
      const site = result.website
        ? `<a href="${escapeAttribute(result.website)}" target="_blank" rel="noopener">Website</a>`
        : "";
      const maps = result.mapsUrl
        ? `<a href="${escapeAttribute(result.mapsUrl)}" target="_blank" rel="noopener">Open</a>`
        : "";

      return `
        <tr>
          <td><strong>${escapeHtml(result.name)}</strong></td>
          <td>${escapeHtml(result.address)}</td>
          <td>${escapeHtml(result.phone)}</td>
          <td class="site-cell">${site}</td>
          <td>${maps}</td>
        </tr>
      `;
    })
    .join("");
}

function exportCsv() {
  const rows = [
    ["Name", "Address", "Phone", "Website", "Google Maps", "Lat", "Lng", "Place ID", "Business status"],
    ...state.filteredResults.map((result) => [
      result.name,
      result.address,
      result.phone,
      result.website,
      result.mapsUrl,
      result.lat,
      result.lng,
      result.placeId,
      result.businessStatus,
    ]),
  ];

  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `workshop-results-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function clearMarkers() {
  state.markers.forEach((marker) => marker.setMap(null));
  state.markers = [];
}

function setStatus(title, text, isWarning = false) {
  els.statusTitle.textContent = title;
  els.statusText.textContent = text;
  els.statusTitle.style.color = isWarning ? "var(--warn)" : "var(--ink)";
}

function readableGoogleError(error, fallback) {
  const message = error?.message || String(error || "");
  if (message.includes("REQUEST_DENIED") || message.includes("ApiNotActivated")) {
    return "The Google key does not have all required APIs enabled.";
  }
  if (message.includes("PERMISSION_DENIED")) {
    return "Places API (New) is not enabled for this Google key project.";
  }
  if (message.includes("INVALID_ARGUMENT")) {
    return "Google rejected the search parameters. Try a simpler search query.";
  }
  return fallback;
}

function stringifyUri(value) {
  if (!value) {
    return "";
  }
  return typeof value === "string" ? value : value.toString();
}

function formatRadius(radius) {
  return radius >= 1000 ? `${(radius / 1000).toFixed(1)} km` : `${Math.round(radius)} m`;
}

function csvCell(value) {
  const normalized = String(value ?? "").replaceAll('"', '""');
  return `"${normalized}"`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
