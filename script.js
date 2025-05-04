let userLat, userLon;
let hospitalList = [];
let hospitalMarkers = [];
let map;
let routingControl;
let userMarker;
let isRoutingStarted = false;
let watchId = null;

function initMap(lat, lon) {
  userLat = lat;
  userLon = lon;

  map = L.map('map').setView([lat, lon], 15);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
  }).addTo(map);

  const userIcon = L.icon({
    iconUrl: './assets/redlocator.png',
    iconSize: [32, 32],
    iconAnchor: [16, 32]
  });

  userMarker = L.marker([lat, lon], { icon: userIcon }).addTo(map);

  fetchNearbyHospitals(lat, lon);
}

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

function showCustomPopup() {
  const modal = document.getElementById("modal");
  modal.innerHTML = `<h3>Select a Hospital</h3>`;

  if (hospitalList.length > 0) {
    const nearest = hospitalList[0];
    const topBtn = document.createElement("button");
    topBtn.className = "hospital-btn top-option";
    topBtn.innerHTML = `<b>Route to Nearest Hospital</b><br>${nearest.name}<br>Distance: ${nearest.distance} km | ETA: ${nearest.eta} mins`;
    topBtn.onclick = () => {
      modal.style.display = "none";
      routeToHospital(0);
    };
    modal.appendChild(topBtn);
  }

  hospitalList.forEach((hosp, i) => {
    const btn = document.createElement("button");
    btn.className = "hospital-btn";
    btn.innerHTML = `<b>${hosp.name}</b><br>Distance: ${hosp.distance} km | ETA: ${hosp.eta} mins`;
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
    createMarker: function(i, waypoint, n) {
      if (i === 0) return null;
      return L.marker(waypoint.latLng);
    }
  }).addTo(map);
  document.querySelector('.leaflet-routing-container').style.display = 'none';

  // Show both buttons AFTER hospital selection
  document.getElementById("start-btn").style.display = "block";
  document.getElementById("find-me-btn").style.display = "block";

  document.getElementById("start-btn").onclick = function () {
    if (!isRoutingStarted) {
      document.querySelector('.leaflet-routing-container').style.display = 'block';
      isRoutingStarted = true;

      if (userLat && userLon) {
        map.setView([userLat, userLon], 18);
      }

      // Disable map interactions
      map.dragging.disable();
      map.touchZoom.disable();
      map.doubleClickZoom.disable();
      map.scrollWheelZoom.disable();
      map.boxZoom.disable();
      map.keyboard.disable();
      if (map.tap) map.tap.disable();

      map.getContainer().style.cursor = "not-allowed";
      this.innerHTML = "Stop Routing";
      this.style.backgroundColor = "red";
      document.getElementById("find-me-btn").style.display = "none";

      // Start live location tracking
      watchId = navigator.geolocation.watchPosition((pos) => {
        if (!isRoutingStarted) return;

        userLat = pos.coords.latitude;
        userLon = pos.coords.longitude;

        const latlng = L.latLng(userLat, userLon);

        if (userMarker) {
          userMarker.setLatLng(latlng);

          // Optional heading rotation
          if (pos.coords.heading !== null) {
            const heading = pos.coords.heading;
            const icon = document.querySelector('.rotatable-icon');
            if (icon) icon.style.transform = `rotate(${heading}deg)`;
          }
        }

        map.setView(latlng);

        // Update only the start point of the route
        routingControl.spliceWaypoints(0, 1, latlng);
      });

    } else {
      // Stop tracking, hide the side panel
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

      this.innerHTML = "Start Routing";
      this.style.backgroundColor = "";
      document.getElementById("find-me-btn").style.display = "block";

      // Calculate the bounds of the route
      const waypoints = routingControl.getWaypoints();
      const latlngs = [waypoints[0].latLng, waypoints[1].latLng];

      // Fit map to the route bounds
      map.fitBounds(L.latLngBounds(latlngs));
    }
  };
}

// "Find Me" centers the map to current user location
document.getElementById("find-me-btn").onclick = () => {
  if (userLat && userLon) {
    map.setView([userLat, userLon], 18);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  navigator.geolocation.getCurrentPosition(position => {
    const { latitude, longitude } = position.coords;
    initMap(latitude, longitude);
  });
});
