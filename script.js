'use strict';

/** Your existing JavaScript functions here */

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
      { name: "Fishtown", center: { lat: 39.9729, lng: -75.1255 }, radius: 600 },
      { name: "Kensington", center: { lat: 39.9879, lng: -75.1253 }, radius: 700 },
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
    labelDiv.style.background = 'transparent';
    labelDiv.style.border = 'none';
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
    mapsApiKey: "YOUR_API_KEY_HERE",
  };

  new NeighborhoodDiscovery(CONFIGURATION);
}
