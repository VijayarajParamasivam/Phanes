let userLat, userLon;
let hospitalList = [];
let hospitalMarkers = [];
let map;
let routingControl;
let userMarker;
let isRoutingStarted = false;
let watchId = null;

// Show the loading screen
document.getElementById("loading-screen").style.display = "flex";
document.getElementById("find-me-btn").style.display = "none";

// Track if location fetch has finished
let locationFetched = false;

// Handle location fetching error
function showLocationError() {
  document.getElementById("retry-location-popup").style.display = "block";
}

// Retry location fetch
function retryLocation() {
  document.getElementById("retry-location-popup").style.display = "none";
  initLocationFetch();
}

// Function to initiate location fetch and map setup
function initLocationFetch() {
  navigator.geolocation.getCurrentPosition(
    position => {
      const { latitude, longitude } = position.coords;
      userLat = latitude;
      userLon = longitude;

      // Initialize map after getting location
      initMap(latitude, longitude);

      locationFetched = true;
    },
    () => {
      // Handle location fetch failure
      locationFetched = true;
      showLocationError();
    }
  );
}

// Show the loading screen for a minimum of 2 seconds, or extend if fetching location takes longer
function hideLoadingScreen() {
  setTimeout(function () {
    if (locationFetched) {
      document.getElementById("loading-screen").style.display = "none";
    } else {
      hideLoadingScreen(); // Keep showing loading screen until location is fetched
    }
  }, 2000);
}

// Start location fetch immediately after loading
initLocationFetch();

// Function to initialize the map
function initMap(lat, lon) {
  map = L.map('map', {
    zoomControl: false,
    attributionControl: false  // Remove Leaflet logo
  }).setView([lat, lon], 15);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '' // This removes the default attribution which includes the Leaflet logo
  }).addTo(map);

  const userIcon = L.icon({
    iconUrl: './assets/redlocator.png',
    iconSize: [32, 32],
    iconAnchor: [16, 32]
  });

  userMarker = L.marker([lat, lon], { icon: userIcon }).addTo(map);

  fetchNearbyHospitals(lat, lon);
  hideLoadingScreen();
  document.getElementById("find-me-btn").style.display = "block";
}

// Function to fetch nearby hospitals using Overpass API
function fetchNearbyHospitals(lat, lon) {
  const overpassUrl = `https://overpass-api.de/api/interpreter?data=[out:json];(node["amenity"="hospital"](around:2000,${lat},${lon});way["amenity"="hospital"](around:2000,${lat},${lon});relation["amenity"="hospital"](around:2000,${lat},${lon}););out center;`;

  fetch(overpassUrl)
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
          const eta = (distance / 40 * 60).toFixed(0); // km/h speed

          hospitalList.push({ name, lat: hLat, lon: hLon, distance, eta });

          const marker = L.marker([hLat, hLon]).addTo(map).bindPopup(name);
          hospitalMarkers.push(marker);
        }
      });

      hospitalList.sort((a, b) => a.distance - b.distance);
      showCustomPopup();
    })
    .catch(err => {
      console.error("Error fetching hospitals:", err);
      alert("Couldn't fetch hospital data.");
    });
}

// Function to calculate distance between two points in km
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return (R * c).toFixed(2);
}

// Show hospital options in a custom popup
function showCustomPopup() {
  const modal = document.getElementById("modal");
  modal.innerHTML = `<h3>Select a Hospital</h3>`;

  if (hospitalList.length > 0) {
    const nearest = hospitalList[0];
    const topBtn = document.createElement("button");
    topBtn.className = "hospital-btn top-option";
    topBtn.innerHTML = `<b>Route to Nearest Hospital</b>`;
    topBtn.onclick = () => {
      modal.style.display = "none";
      routeToHospital(0);
    };
    modal.appendChild(topBtn);
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

function routeToHospital(index) {
  const hosp = hospitalList[index];

  if (routingControl) {
    map.removeControl(routingControl);
  }

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
      if (i === 0) return null;
      return L.marker(waypoint.latLng);
    }
  }).addTo(map);

  // Hide default direction panel
  document.querySelector('.leaflet-routing-container').style.display = 'none';

  // Show immediate instruction on route selected
  routingControl.on('routesfound', function (e) {
    const instructions = e.routes[0].instructions;
    if (instructions.length > 0) {
      const firstInstruction = instructions[0].text;
      showDirection(firstInstruction);
    }
  });

  routingControl.on('routeselected', function (e) {
    const instructions = e.route.instructions;
    if (instructions.length > 0) {
      const firstInstruction = instructions[0].text;
      showDirection(firstInstruction);
    }
  });

  document.getElementById("start-btn").style.display = "block";

  document.getElementById("start-btn").onclick = function () {
    if (!isRoutingStarted) {
      document.querySelector('.leaflet-routing-container').style.display = 'none';
      isRoutingStarted = true;

      if (userLat && userLon) {
        map.setView([userLat, userLon], 18);
      }

      map.dragging.disable();
      map.touchZoom.disable();
      map.doubleClickZoom.disable();
      map.scrollWheelZoom.disable();
      map.boxZoom.disable();
      map.keyboard.disable();
      if (map.tap) map.tap.disable();
      map.getContainer().style.cursor = "not-allowed";

      this.innerHTML = "Stop";
      this.style.backgroundColor = "red";
      document.getElementById("find-me-btn").style.display = "none";

      watchId = navigator.geolocation.watchPosition((pos) => {
        if (!isRoutingStarted) return;

        userLat = pos.coords.latitude;
        userLon = pos.coords.longitude;

        const latlng = L.latLng(userLat, userLon);
        if (userMarker) userMarker.setLatLng(latlng);
        map.setView(latlng);

        routingControl.spliceWaypoints(0, 1, latlng);
      });

      // Show direction box after starting route
      document.getElementById("direction-box").style.display = "block";

    } else {
      isRoutingStarted = false;
      document.querySelector('.leaflet-routing-container').style.display = 'none';

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

      this.innerHTML = "Start";
      this.style.backgroundColor = "";
      document.getElementById("find-me-btn").style.display = "block";

      const waypoints = routingControl.getWaypoints();
      const latlngs = [waypoints[0].latLng, waypoints[1].latLng];
      map.fitBounds(L.latLngBounds(latlngs));

      // Hide direction box when stop is clicked
      document.getElementById("direction-box").style.display = "none";
    }
  };
}

document.getElementById("find-me-btn").onclick = () => {
  if (userLat && userLon) {
    map.setView([userLat, userLon], 18);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  initLocationFetch();
  hideLoadingScreen();
});

function showDirection(instruction) {
  const box = document.getElementById("direction-box");
  box.innerText = instruction;
  if (isRoutingStarted) box.style.display = 'block';
}
