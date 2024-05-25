'use strict';

/** Hides a DOM element and optionally focuses on focusEl. */
function hideElement(el, focusEl) {
  el.style.display = 'none';
  if (focusEl) focusEl.focus();
}

/** Shows a DOM element that has been hidden and optionally focuses on focusEl. */
function showElement(el, focusEl) {
  el.style.display = 'block';
  if (focusEl) focusEl.focus();
}

/** Determines if a DOM element contains content that cannot be scrolled into view. */
function hasHiddenContent(el) {
  const noscroll = window.getComputedStyle(el).overflowY.includes('hidden');
  return noscroll && el.scrollHeight > el.clientHeight;
}

/** Format a Place Type string by capitalizing and replacing underscores with spaces. */
function formatPlaceType(str) {
  return str.charAt(0).toUpperCase() + str.slice(1).replace(/_/g, ' ');
}

/** Initializes an array of zeros with the given size. */
function initArray(arraySize) {
  return Array(arraySize).fill(0);
}

/** Assigns star icons to an object given its rating (out of 5). */
function addStarIcons(obj) {
  if (!obj.rating) return;
  const starsOutOfTen = Math.round(2 * obj.rating);
  const fullStars = Math.floor(starsOutOfTen / 2);
  const halfStars = starsOutOfTen % 2;
  const emptyStars = 5 - fullStars - halfStars;

  obj.fullStarIcons = initArray(fullStars);
  obj.halfStarIcons = initArray(halfStars);
  obj.emptyStarIcons = initArray(emptyStars);
}

/** Constructs an array of opening hours by day from a PlaceOpeningHours object. */
function parseDaysHours(openingHours) {
  const daysHours = openingHours.weekday_text.map(e => {
    const [day, hours] = e.split(': ');
    return { days: day.substr(0, 3), hours };
  });

  for (let i = 1; i < daysHours.length; i++) {
    if (daysHours[i - 1].hours === daysHours[i].hours) {
      daysHours[i - 1].days += ` - ${daysHours[i].days}`;
      daysHours.splice(i--, 1);
    }
  }
  return daysHours;
}

/** Number of POIs to show on widget load. */
const ND_NUM_PLACES_INITIAL = 5;

/** Number of additional POIs to show when 'Show More' button is clicked. */
const ND_NUM_PLACES_SHOW_MORE = 5;

/** Maximum number of place photos to show on the details panel. */
const ND_NUM_PLACE_PHOTOS_MAX = 6;

/** Minimum zoom level at which the default map POI pins will be shown. */
const ND_DEFAULT_POI_MIN_ZOOM = 18;

/** Mapping of Place Types to Material Icons used to render custom map markers. */
const ND_MARKER_ICONS_BY_TYPE = {
  '_default': 'circle',
};

/** Defines an instance of the Neighborhood Discovery widget. */
function NeighborhoodDiscovery(configuration) {
  const widget = this;
  const widgetEl = document.querySelector('.neighborhood-discovery');

  widget.center = configuration.mapOptions.center;
  widget.places = configuration.pois || [];
  widget.placeIdsToDetails = new Map();
  widget.selectedPlaceId = null;

  initializeMap();
  initializePlaceDetails();
  initializeSidePanel();
  initializeSearchInput();
  function initializeMap() {
    const mapOptions = { ...configuration.mapOptions, mapTypeControlOptions: { position: google.maps.ControlPosition.TOP_RIGHT }, zoomControl: true, fullscreenControl: true };
    widget.map = new google.maps.Map(widgetEl.querySelector('.map'), mapOptions);
    widget.map.setZoom(12);
    widget.map.setCenter({ lat: 39.9526, lng: -75.1652 });

    widget.map.addListener('click', (e) => {
      if (e.placeId) {
        e.stop();
        widget.selectPlaceById(e.placeId);
      }
    });

    widget.map.addListener('zoom_changed', () => {
      const hideDefaultPoiPins = widget.map.getZoom() < ND_DEFAULT_POI_MIN_ZOOM;
      widget.map.setOptions({
        styles: [{
          featureType: 'poi',
          elementType: hideDefaultPoiPins ? 'labels' : 'labels.text',
          stylers: [{ visibility: 'off' }],
        }],
      });
    });

    const markerPath = widgetEl.querySelector('.marker-pin path').getAttribute('d');
    widget.drawMarker = (title, position, fillColor, strokeColor, labelText) => new google.maps.Marker({
      title,
      position,
      map: widget.map,
      icon: {
        path: markerPath,
        fillColor,
        fillOpacity: 1,
        strokeColor,
        anchor: new google.maps.Point(13, 35),
        labelOrigin: new google.maps.Point(13, 13),
      },
      label: {
        text: labelText,
        color: 'white',
        fontSize: '16px',
        fontFamily: 'Material Icons',
      },
    });

    widget.addPlaceMarker = (place) => {
      place.marker = widget.drawMarker(place.name, place.coords, '#EA4335', '#C5221F', place.icon);
      place.marker.addListener('click', () => widget.selectPlaceById(place.placeId));
    };

    widget.updateBounds = (places) => {
      const bounds = new google.maps.LatLngBounds();
      bounds.extend(widget.center);
      places.forEach(place => bounds.extend(place.marker.getPosition()));
      widget.map.fitBounds(bounds, 100);
    };

    widget.selectedPlaceMarker = new google.maps.Marker({ title: 'Point of Interest' });

    const neighborhoods = [
      { name: "Rittenhouse Square", center: { lat: 39.9496, lng: -75.1713 }, radius: 400 },
      { name: "Old City", center: { lat: 39.9504, lng: -75.1449 }, radius: 500 },
      { name: "Society Hill", center: { lat: 39.9443, lng: -75.1494 }, radius: 500 },
      { name: "Washington Square West", center: { lat: 39.9466, lng: -75.1590 }, radius: 500 },
      { name: "Logan Square", center: { lat: 39.9574, lng: -75.1711 }, radius: 400 },
      { name: "Pennsport", center: { lat: 39.9286, lng: -75.1497 }, radius: 500 },
      { name: "Queen Village", center: { lat: 39.9398, lng: -75.1517 }, radius: 500 },
      { name: "Bella Vista", center: { lat: 39.9403, lng: -75.1578 }, radius: 400 },
      { name: "Graduate Hospital", center: { lat: 39.9428, lng: -75.1789 }, radius: 500 },
      { name: "Point Breeze", center: { lat: 39.9336, lng: -75.1791 }, radius: 500 },
      { name: "Passyunk Square", center: { lat: 39.9310, lng: -75.1636 }, radius: 500 },
      { name: "East Passyunk Crossing", center: { lat: 39.9277, lng: -75.1621 }, radius: 500 },
      { name: "University City", center: { lat: 39.9522, lng: -75.1932 }, radius: 600 },
      { name: "Powelton Village", center: { lat: 39.9623, lng: -75.1960 }, radius: 500 },
      { name: "Cedar Park", center: { lat: 39.9515, lng: -75.2173 }, radius: 700 },
      { name: "Spruce Hill", center: { lat: 39.9510, lng: -75.2107 }, radius: 700 },
      { name: "Cobbs Creek", center: { lat: 39.9528, lng: -75.2360 }, radius: 600 },
      { name: "Overbrook", center: { lat: 39.9873, lng: -75.2388 }, radius: 600 },
      { name: "Northern Liberties", center: { lat: 39.9624, lng: -75.1429 }, radius: 600 },
      { name: "Fishtown", center: { lat: 39.9729, lng: -75.1255 }, radius: 600 },
      { name: "Kensington", center: { lat: 39.9879, lng: -75.1253 }, radius: 700 },
      { name: "East Kensington", center: { lat: 39.9802, lng: -75.1282 }, radius: 700 },
      { name: "West Kensington", center: { lat: 39.9864, lng: -75.1391 }, radius: 700 },
      { name: "Brewerytown", center: { lat: 39.9784, lng: -75.1867 }, radius: 600 },
      { name: "Fairmount", center: { lat: 39.9677, lng: -75.1735 }, radius: 600 },
      { name: "Yorktown", center: { lat: 39.9774, lng: -75.1495 }, radius: 600 },
      { name: "Mayfair", center: { lat: 40.0397, lng: -75.0592 }, radius: 700 },
      { name: "Bustleton", center: { lat: 40.0830, lng: -75.0407 }, radius: 700 },
      { name: "Fox Chase", center: { lat: 40.0723, lng: -75.0824 }, radius: 700 },
      { name: "Somerton", center: { lat: 40.1237, lng: -75.0131 }, radius: 700 },
      { name: "Frankford", center: { lat: 40.0192, lng: -75.0878 }, radius: 700 },
      { name: "Tacony", center: { lat: 40.0332, lng: -75.0317 }, radius: 700 },
      { name: "Manayunk", center: { lat: 40.0267, lng: -75.2242 }, radius: 700 },
      { name: "Roxborough", center: { lat: 40.0394, lng: -75.2167 }, radius: 700 },
      { name: "Chestnut Hill", center: { lat: 40.0700, lng: -75.2055 }, radius: 700 },
      { name: "Germantown", center: { lat: 40.0389, lng: -75.1735 }, radius: 700 },
      { name: "Mount Airy", center: { lat: 40.0590, lng: -75.1884 }, radius: 700 },
      { name: "East Falls", center: { lat: 40.0140, lng: -75.1944 }, radius: 700 },
      { name: "Ardmore", center: { lat: 40.0077, lng: -75.2841 }, radius: 700 },
      { name: "Bryn Mawr", center: { lat: 40.0214, lng: -75.3188 }, radius: 700 },
      { name: "Jenkintown", center: { lat: 40.0951, lng: -75.1257 }, radius: 700 },
      { name: "Abington", center: { lat: 40.1203, lng: -75.1184 }, radius: 700 },
      { name: "Blue Bell", center: { lat: 40.1529, lng: -75.2663 }, radius: 700 },
      { name: "Conshohocken", center: { lat: 40.0798, lng: -75.3016 }, radius: 700 },
      { name: "Bala Cynwyd", center: { lat: 40.0129, lng: -75.2297 }, radius: 700 },
      { name: "Glenside", center: { lat: 40.1015, lng: -75.1522 }, radius: 700 },
      { name: "Media", center: { lat: 39.9168, lng: -75.3877 }, radius: 700 },
      { name: "Swarthmore", center: { lat: 39.9020, lng: -75.3479 }, radius: 700 },
      { name: "Wayne", center: { lat: 40.0412, lng: -75.3872 }, radius: 700 },
      { name: "Havertown", center: { lat: 39.9801, lng: -75.3085 }, radius: 700 },
      { name: "Springfield", center: { lat: 39.9335, lng: -75.3206 }, radius: 700 },
      { name: "Radnor", center: { lat: 40.0462, lng: -75.3729 }, radius: 700 },
      { name: "West Chester", center: { lat: 39.9607, lng: -75.6086 }, radius: 700 },
      { name: "Exton", center: { lat: 40.0290, lng: -75.6205 }, radius: 700 },
      { name: "Malvern", center: { lat: 40.0362, lng: -75.5133 }, radius: 700 },
      { name: "Phoenixville", center: { lat: 40.1304, lng: -75.5140 }, radius: 700 },
      { name: "Downingtown", center: { lat: 40.0068, lng: -75.7030 }, radius: 700 },
      { name: "Kennett Square", center: { lat: 39.8468, lng: -75.7113 }, radius: 700 },
      { name: "Doylestown", center: { lat: 40.3101, lng: -75.1300 }, radius: 700 },
      { name: "New Hope", center: { lat: 40.3648, lng: -74.9515 }, radius: 700 },
      { name: "Yardley", center: { lat: 40.2454, lng: -74.8362 }, radius: 700 },
      { name: "Langhorne", center: { lat: 40.1740, lng: -74.9227 }, radius: 700 },
      { name: "Newtown", center: { lat: 40.2293, lng: -74.9365 }, radius: 700 },
      { name: "Levittown", center: { lat: 40.1551, lng: -74.8288 }, radius: 700 },
    ];

    neighborhoods.forEach(neighborhood => drawNeighborhoodCircle(widget.map, neighborhood));
  }

  function drawNeighborhoodCircle(map, neighborhood) {
    const circle = new google.maps.Circle({
        strokeColor: '#FF0000',
        strokeOpacity: 0.8,
        strokeWeight: 2,
        fillColor: '#FF0000',
        fillOpacity: 0.35,
        map,
        center: neighborhood.center,
        radius: neighborhood.radius,
    });

    const labelDiv = document.createElement('div');
    labelDiv.style.position = 'absolute';
    labelDiv.style.background = 'transparent'; // Make background transparent
    labelDiv.style.border = 'none'; // Remove border
    labelDiv.style.padding = '2px';
    labelDiv.style.borderRadius = '3px';
    labelDiv.style.whiteSpace = 'nowrap';
    labelDiv.style.transform = 'translate(-50%, -50%)';
    labelDiv.innerHTML = `<strong>${neighborhood.name}</strong>`;

    const customLabel = new google.maps.OverlayView();
    customLabel.onAdd = function () {
        const pane = this.getPanes().overlayLayer;
        pane.appendChild(labelDiv);
    };

    customLabel.draw = function () {
        const projection = this.getProjection();
        const position = projection.fromLatLngToDivPixel(neighborhood.center);
        labelDiv.style.left = `${position.x}px`;
        labelDiv.style.top = `${position.y}px`;
    };

    customLabel.onRemove = function () {
        labelDiv.parentNode.removeChild(labelDiv);
    };

    customLabel.setMap(map);

    google.maps.event.addListener(circle, 'click', function () {
        map.setCenter(neighborhood.center);
        map.setZoom(15);
    });

    google.maps.event.addListener(map, 'zoom_changed', function () {
        customLabel.draw();
    });
}

  function initializePlaceDetails() {
    const detailsService = new google.maps.places.PlacesService(widget.map);

    widget.fetchPlaceDetails = function (placeId, fields, callback) {
      if (!placeId || !fields) return;

      let place = widget.placeIdsToDetails.get(placeId);
      if (!place) {
        place = { placeId, fetchedFields: new Set(['place_id']) };
        widget.placeIdsToDetails.set(placeId, place);
      }
      const missingFields = fields.filter(field => !place.fetchedFields.has(field));
      if (missingFields.length === 0) {
        callback(place);
        return;
      }

      const request = { placeId, fields: missingFields };
      processPlaceDetails(detailsService, request, place, missingFields, callback);
    };
  }

  function processPlaceDetails(detailsService, request, place, missingFields, callback) {
    let retryCount = 0;
    const processResult = (result, status) => {
      if (status !== google.maps.places.PlacesServiceStatus.OK) {
        if (status === google.maps.places.PlacesServiceStatus.OVER_QUERY_LIMIT && retryCount < 5) {
          const delay = (Math.pow(2, retryCount) + Math.random()) * 500;
          setTimeout(() => detailsService.getDetails(request, processResult), delay);
          retryCount++;
        }
        return;
      }

      updatePlaceDetails(place, result);
      missingFields.forEach(field => place.fetchedFields.add(field));
      callback(place);
    };

    detailsService.getDetails(request, processResult);
  }

  function updatePlaceDetails(place, result) {
    place.name = result.name || place.name;
    place.coords = result.geometry?.location || place.coords;
    place.address = result.formatted_address || place.address;
    place.photos = result.photos?.map(photo => ({
      urlSmall: photo.getUrl({ maxWidth: 200, maxHeight: 200 }),
      urlLarge: photo.getUrl({ maxWidth: 1200, maxHeight: 1200 }),
      attrs: photo.html_attributions,
    })).slice(0, ND_NUM_PLACE_PHOTOS_MAX) || place.photos;
    place.type = formatPlaceType(result.types?.[0]) || place.type;
    place.icon = ND_MARKER_ICONS_BY_TYPE[result.types?.[0]] || ND_MARKER_ICONS_BY_TYPE['_default'];
    place.url = result.url || place.url;
    place.website = result.website || place.website;
    place.websiteDomain = result.website ? new URL(result.website).hostname : place.websiteDomain;
    place.phoneNumber = result.formatted_phone_number || place.phoneNumber;
    place.openingHours = result.opening_hours ? parseDaysHours(result.opening_hours) : place.openingHours;
    place.rating = result.rating || place.rating;
    place.numReviews = result.user_ratings_total || place.numReviews;
    place.priceLevel = result.price_level || place.priceLevel;
    place.reviews = result.reviews || place.reviews;

    if (place.rating) addStarIcons(place);
    place.reviews?.forEach(review => addStarIcons(review));
  }

  function initializeSidePanel() {
    const placesPanelEl = widgetEl.querySelector('.places-panel');
    const detailsPanelEl = widgetEl.querySelector('.details-panel');
    const placeResultsEl = widgetEl.querySelector('.place-results-list');
    const showMoreButtonEl = widgetEl.querySelector('.show-more-button');
    const photoModalEl = widgetEl.querySelector('.photo-modal');
    const detailsTemplate = Handlebars.compile(document.getElementById('nd-place-details-tmpl').innerHTML);
    const resultsTemplate = Handlebars.compile(document.getElementById('nd-place-results-tmpl').innerHTML);

    const renderPlaceResults = (places, startIndex) => {
      placeResultsEl.insertAdjacentHTML('beforeend', resultsTemplate({ places }));
      placeResultsEl.querySelectorAll('.place-result').forEach((resultEl, i) => {
        const place = places[i - startIndex];
        if (!place) return;

        resultEl.addEventListener('click', () => widget.selectPlaceById(place.placeId, true));
        resultEl.querySelector('.name').addEventListener('click', (e) => {
          widget.selectPlaceById(place.placeId, true);
          e.stopPropagation();
        });
        resultEl.querySelector('.photo').addEventListener('click', (e) => {
          showPhotoModal(photoModalEl, place.photos[0], place.name);
          e.stopPropagation();
        });
        widget.addPlaceMarker(place);
      });
    };

    const showNextPlaces = (n) => {
      const nextPlaces = widget.places.slice(widget.nextPlaceIndex, widget.nextPlaceIndex + n);
      if (nextPlaces.length < 1) {
        hideElement(showMoreButtonEl);
        return;
      }

      showMoreButtonEl.disabled = true;
      let count = nextPlaces.length;
      nextPlaces.forEach(place => {
        widget.fetchPlaceDetails(place.placeId, [
          'name', 'types', 'geometry.location', 'photo', 'rating', 'user_ratings_total', 'price_level'
        ], (fetchedPlace) => {
          count--;
          if (count === 0) {
            renderPlaceResults(nextPlaces, widget.nextPlaceIndex);
            widget.nextPlaceIndex += n;
            widget.updateBounds(widget.places.slice(0, widget.nextPlaceIndex));
            if (widget.nextPlaceIndex < widget.places.length || hasHiddenContent(placesPanelEl)) {
              showElement(showMoreButtonEl);
              showMoreButtonEl.disabled = false;
            } else {
              hideElement(showMoreButtonEl);
            }
          }
        });
      });
    };

    widget.nextPlaceIndex = 0;
    showNextPlaces(ND_NUM_PLACES_INITIAL);
    showMoreButtonEl.addEventListener('click', () => {
      placesPanelEl.classList.remove('no-scroll');
      showMoreButtonEl.classList.remove('sticky');
      showNextPlaces(ND_NUM_PLACES_SHOW_MORE);
    });

    function showPhotoModal(photoModalEl, photo, placeName) {
      const prevFocusEl = document.activeElement;
      const imgEl = photoModalEl.querySelector('img');
      imgEl.src = photo.urlLarge;
      const backButtonEl = photoModalEl.querySelector('.back-button');
      backButtonEl.addEventListener('click', () => {
        hideElement(photoModalEl, prevFocusEl);
        imgEl.src = '';
      });
      photoModalEl.querySelector('.photo-place').innerHTML = placeName;
      photoModalEl.querySelector('.photo-attrs span').innerHTML = photo.attrs;
      const attributionEl = photoModalEl.querySelector('.photo-attrs a');
      if (attributionEl) attributionEl.setAttribute('target', '_blank');
      photoModalEl.addEventListener('click', (e) => {
        if (e.target === photoModalEl) {
          hideElement(photoModalEl, prevFocusEl);
          imgEl.src = '';
        }
      });
      showElement(photoModalEl, backButtonEl);
    }
  }

  function initializeSearchInput() {
    const searchInputEl = widgetEl.querySelector('.place-search-input');
    widget.placeIdsToAutocompleteResults = new Map();

    const autocomplete = new google.maps.places.Autocomplete(searchInputEl, {
      types: ['establishment'],
      fields: [
        'place_id', 'name', 'types', 'geometry.location', 'formatted_address', 'photo', 'url', 'website', 'formatted_phone_number', 'opening_hours', 'rating', 'user_ratings_total', 'price_level', 'review',
      ],
      bounds: widget.mapBounds,
      strictBounds: true,
    });

    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      widget.placeIdsToAutocompleteResults.set(place.place_id, place);
      widget.selectPlaceById(place.place_id, true);
      searchInputEl.value = '';
    });
  }

  widget.selectPlaceById = function (placeId, panToMarker = false) {
    if (widget.selectedPlaceId === placeId) return;
    widget.selectedPlaceId = placeId;

    const showDetailsPanel = (place) => {
      const detailsPanelEl = widgetEl.querySelector('.details-panel');
      detailsPanelEl.innerHTML = detailsTemplate(place);
      const backButtonEl = detailsPanelEl.querySelector('.back-button');
      backButtonEl.addEventListener('click', () => {
        hideElement(detailsPanelEl);
        widget.selectedPlaceId = null;
        widget.selectedPlaceMarker.setMap(null);
      });
      detailsPanelEl.querySelectorAll('.photo').forEach((photoEl, i) => {
        photoEl.addEventListener('click', () => showPhotoModal(photoModalEl, place.photos[i], place.name));
      });
      showElement(detailsPanelEl);
      detailsPanelEl.scrollTop = 0;
    };

    widget.fetchPlaceDetails(placeId, [
      'name', 'types', 'geometry.location', 'formatted_address', 'photo', 'url', 'website', 'formatted_phone_number', 'opening_hours', 'rating', 'user_ratings_total', 'price_level', 'review',
    ], (place) => {
      if (!place.marker) {
        widget.selectedPlaceMarker.setPosition(place.coords);
        widget.selectedPlaceMarker.setMap(widget.map);
      }
      if (panToMarker) widget.map.panTo(place.coords);
      showDetailsPanel(place);
    });
  };
}

function initMap() {
  const CONFIGURATION = {
    capabilities: { search: true, distances: false, directions: false, contacts: true, atmospheres: true, thumbnails: true },
    mapRadius: 1000,
    mapOptions: {
      center: { lat: 39.9526, lng: -75.1652 },
      fullscreenControl: true,
      mapTypeControl: true,
      streetViewControl: false,
      zoom: 12,
      zoomControl: true,
      maxZoom: 20,
      minZoom: 3,
      mapId: "",
    },
    mapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
  };

  new NeighborhoodDiscovery(CONFIGURATION);
}

function addGoogleMapsScript(apiKey) {
  const script = document.createElement('script');
  script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=initMap&libraries=places,geometry`;
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);
}

document.addEventListener('DOMContentLoaded', function() {
  const apiKey = 'YOUR_GOOGLE_MAPS_API_KEY';
  addGoogleMapsScript(apiKey);
});
