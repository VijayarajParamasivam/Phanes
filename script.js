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
const trafficBox = document.getElementById("trafficBox");
const trafficLevelSpan = document.getElementById("trafficLevel");
const etaSpan = document.getElementById("eta");

// Initial UI setup
loadingScreen.style.display = "flex";
findMeBtn.style.display = "none";

function showLocationError() {
  retryPopup.style.display = "block";
}

function retryLocation() {
  retryPopup.style.display = "none";
  initLocationFetch();
}

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

function hideLoadingScreen() {
  setTimeout(function check() {
    if (locationFetched) {
      loadingScreen.style.display = "none";
    } else {
      setTimeout(check, 100);
    }
  }, 0);
}

function initMap(lat, lon) {
  map = L.map('map', {
    zoomControl: false,
    attributionControl: false
  }).setView([lat, lon], 15);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '',
    pane: 'tilePane' 
  }).addTo(map);

  var tilePane = map.getPane('tilePane');
  if (tilePane) {
    tilePane.style.filter = 'brightness(0.7) invert(0.9) grayscale(0.6) contrast(1.1)' ;

  }

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
          const eta = (distance / 40 * 60).toFixed(0);

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

function disableUserMarkerCreation() {
  map.on('click', () => false);
  if (map.tap) map.tap.disable();
  map.getContainer().style.cursor = "not-allowed";
}

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

async function fetchTrafficData(lat, lon) {
  try {
    const res = await fetch(`https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?point=${lat},${lon}&unit=KMPH&key=ppuQPLJUxLOvsAWiGvDnYCw8n0xdJHBd`);
    const data = await res.json();
    const seg = data.flowSegmentData;

    const ratio = seg.currentSpeed / seg.freeFlowSpeed;
    const trafficLevel = ratio > 0.8 ? "Low" : ratio > 0.5 ? "Medium" : "High";
    const eta = Math.round(seg.currentTravelTime / 60);


    trafficLevelSpan.textContent = `${trafficLevel}`;
    trafficLevelSpan.className = "traffic-status"; 
    if (trafficLevel === "Low") trafficLevelSpan.classList.add("traffic-low");
    else if (trafficLevel === "Medium") trafficLevelSpan.classList.add("traffic-medium");
    else if (trafficLevel === "High") trafficLevelSpan.classList.add("traffic-high");

    etaSpan.textContent = `${eta}`;

    trafficBox.style.display = "block";

  } catch (err) {
    console.error("Failed to fetch traffic data:", err);
    trafficBox.style.display = "none";
  }
}


function routeToHospital(index) {
  const hosp = hospitalList[index];

  if (routingControl) map.removeControl(routingControl);
  hospitalMarkers.forEach(marker => map.removeLayer(marker));
  hospitalMarkers = [];

  fetchTrafficData(hosp.lat, hosp.lon);

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

function toggleRoute() {
  if (!isRoutingStarted) {
    isRoutingStarted = true;
    trafficBox.style.display = "none";
    map.setView([userLat, userLon], 18);
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
    trafficBox.style.display = "block";
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

function showDirection(instruction) {
  directionBox.innerText = instruction;
  if (isRoutingStarted) directionBox.style.display = 'block';
}

findMeBtn.onclick = () => {
  if (userLat && userLon) {
    map.setView([userLat, userLon], 18);
  }
};

document.getElementById("change-destination-btn").onclick = () => {
  showCustomPopup();
};

document.addEventListener('DOMContentLoaded', () => {
  initLocationFetch();
  hideLoadingScreen();
});
