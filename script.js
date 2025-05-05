let userLat, userLon;
let hospitalList = [];
let hospitalMarkers = [];
let map;
let routingControl;
let userMarker;
let isRoutingStarted = false;
let watchId = null;
let locationFetched = false;

// UI Elements
const loadingScreen = document.getElementById("loading-screen");
const findMeBtn = document.getElementById("find-me-btn");
const retryPopup = document.getElementById("retry-location-popup");
const modal = document.getElementById("modal");
const directionBox = document.getElementById("direction-box");
const startBtn = document.getElementById("start-btn");
const changeDestinationBtn = document.getElementById("change-destination-btn");

// Initial UI setup
loadingScreen.style.display = "flex";
findMeBtn.style.display = "none";

// Show location fetch error popup
function showLocationError() {
  retryPopup.style.display = "block";
}

// Retry location fetch
function retryLocation() {
  retryPopup.style.display = "none";
  initLocationFetch();
}

// Start location fetch
function initLocationFetch() {
  navigator.geolocation.getCurrentPosition(
    position => {
      const { latitude, longitude } = position.coords;
      userLat = latitude;
      userLon = longitude;

      initMap(userLat, userLon);
      locationFetched = true;
    },
    () => {
      locationFetched = true;
      showLocationError();
    }
  );
}

// Ensure loading screen is visible for at least 2 seconds
function hideLoadingScreen() {
  setTimeout(function check() {
    if (locationFetched) {
      loadingScreen.style.display = "none";
    } else {
      setTimeout(check, 100);
    }
  }, 0);
}

// Initialize Leaflet map
function initMap(lat, lon) {
  map = L.map('map', {
    zoomControl: false,
    attributionControl: false
  }).setView([lat, lon], 15);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: ''
  }).addTo(map);

  const userIcon = L.icon({
    iconUrl: './assets/redlocator.png',
    iconSize: [32, 32],
    iconAnchor: [16, 32]
  });

  userMarker = L.marker([lat, lon], { icon: userIcon }).addTo(map);

  fetchNearbyHospitals(lat, lon);
  disableUserMarkerCreation();
  findMeBtn.style.display = "block";
}

// Fetch nearby hospitals using Overpass API
function fetchNearbyHospitals(lat, lon) {
  const url = `https://overpass-api.de/api/interpreter?data=[out:json];(node["amenity"="hospital"](around:2000,${lat},${lon});way["amenity"="hospital"](around:2000,${lat},${lon});relation["amenity"="hospital"](around:2000,${lat},${lon}););out center;`;

  fetch(url)
    .then(res => res.json())
    .then(data => {
      hospitalList = [];
      hospitalMarkers.forEach(marker => map.removeLayer(marker));
      hospitalMarkers = [];

      data.elements.forEach((el, idx) => {
        const hLat = el.lat || el.center?.lat;
        const hLon = el.lon || el.center?.lon;
        if (hLat && hLon) {
          const name = el.tags?.name || `Hospital ${idx + 1}`;
          const distance = getDistance(userLat, userLon, hLat, hLon);
          const eta = (distance / 40 * 60).toFixed(0); // 40 km/h

          hospitalList.push({ name, lat: hLat, lon: hLon, distance, eta });

          const marker = L.marker([hLat, hLon]).addTo(map).bindPopup(name);
          hospitalMarkers.push(marker);
        }
      });

      hospitalList.sort((a, b) => a.distance - b.distance);
      showCustomPopup();
      hideLoadingScreen();
    })
    .catch(err => {
      console.error("Error fetching hospitals:", err);
      alert("Couldn't fetch hospital data.");
      hideLoadingScreen();
    });
}

// Calculate haversine distance in km
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return (R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(2);
}

// Disable user interactions on map
function disableUserMarkerCreation() {
  map.on('click', () => false);
  if (map.tap) map.tap.disable();
  map.getContainer().style.cursor = "not-allowed";
}

// Show hospital options in modal
function showCustomPopup() {
  modal.innerHTML = `<h3>Select a Hospital</h3>`;

  if (hospitalList.length > 0) {
    const nearest = hospitalList[0];
    const btn = document.createElement("button");
    btn.className = "hospital-btn top-option";
    btn.innerHTML = `<b>Route to Nearest Hospital</b>`;
    btn.onclick = () => {
      modal.style.display = "none";
      routeToHospital(0);
    };
    modal.appendChild(btn);
  }

  hospitalList.forEach((hosp, i) => {
    const btn = document.createElement("button");
    btn.className = "hospital-btn";
    btn.innerHTML = `<b>${hosp.name}</b><br>Distance: ${hosp.distance} km`;
    btn.onclick = () => {
      modal.style.display = "none";
      routeToHospital(i);
    };
    modal.appendChild(btn);
  });

  modal.style.display = "block";
}

// Start routing
function routeToHospital(index) {
  const hosp = hospitalList[index];

  if (routingControl) map.removeControl(routingControl);
  hospitalMarkers.forEach(marker => map.removeLayer(marker));
  hospitalMarkers = [];

  routingControl = L.Routing.control({
    waypoints: [
      L.latLng(userLat, userLon),
      L.latLng(hosp.lat, hosp.lon)
    ],
    routeWhileDragging: false,
    lineOptions: {
      styles: [{ color: 'blue', weight: 6 }]
    },
    createMarker: function (i, waypoint, n) {
      if (i === 0) {
        return L.marker(waypoint.latLng, {
          icon: L.icon({
            iconUrl: './assets/redlocator.png',
            iconSize: [32, 32],
            iconAnchor: [16, 32]
          })
        }).bindPopup("Ambulance Location");
      } else if (i === n - 1) {
        return L.marker(waypoint.latLng).bindPopup("Destination Hospital");
      }
      return null;
    }
  }).addTo(map);

  document.querySelector('.leaflet-routing-container').style.display = 'none';

  routingControl.on('routesfound', e => {
    const instructions = e.routes[0].instructions;
    if (instructions.length > 0) showDirection(instructions[0].text);
  });

  routingControl.on('routeselected', e => {
    const instructions = e.route.instructions;
    if (instructions.length > 0) showDirection(instructions[0].text);
  });

  changeDestinationBtn.style.display = "block";
  startBtn.style.display = "block";
  startBtn.onclick = toggleRoute;
}

// Toggle route tracking on/off
function toggleRoute() {
  if (!isRoutingStarted) {
    isRoutingStarted = true;
    map.setView([userLat, userLon], 16);
    map.dragging.disable();
    map.touchZoom.disable();
    map.doubleClickZoom.disable();
    map.scrollWheelZoom.disable();
    map.boxZoom.disable();
    map.keyboard.disable();
    if (map.tap) map.tap.disable();
    map.getContainer().style.cursor = "not-allowed";

    startBtn.innerHTML = "Stop";
    startBtn.style.backgroundColor = "rgb(197, 27, 15)";
    findMeBtn.style.display = "none";
    changeDestinationBtn.style.display = "none";
    directionBox.style.display = "block";

    watchId = navigator.geolocation.watchPosition((pos) => {
      if (!isRoutingStarted) return;

      userLat = pos.coords.latitude;
      userLon = pos.coords.longitude;
      const latlng = L.latLng(userLat, userLon);

      if (userMarker) userMarker.setLatLng(latlng);
      map.setView(latlng);
      routingControl.spliceWaypoints(0, 1, latlng);
    });

  } else {
    isRoutingStarted = false;
    directionBox.style.display = "none";
    map.dragging.enable();
    map.touchZoom.enable();
    map.doubleClickZoom.enable();
    map.scrollWheelZoom.enable();
    map.boxZoom.enable();
    map.keyboard.enable();
    if (map.tap) map.tap.enable();
    map.getContainer().style.cursor = "grab";

    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }

    startBtn.innerHTML = "Start";
    startBtn.style.backgroundColor = "";
    findMeBtn.style.display = "block";
    changeDestinationBtn.style.display = "block";

    const waypoints = routingControl.getWaypoints();
    map.fitBounds(L.latLngBounds([waypoints[0].latLng, waypoints[1].latLng]));
  }
}

// Show direction text in UI
function showDirection(instruction) {
  directionBox.innerText = instruction;
  if (isRoutingStarted) directionBox.style.display = 'block';
}

// Center map to user location
findMeBtn.onclick = () => {
  if (userLat && userLon) {
    map.setView([userLat, userLon], 18);
  }
};

document.getElementById("change-destination-btn").onclick = () => {
  showCustomPopup();
};

// DOM ready actions
document.addEventListener('DOMContentLoaded', () => {
  initLocationFetch();
  hideLoadingScreen();
});
