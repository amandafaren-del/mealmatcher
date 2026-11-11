
    const homeScreen = document.querySelector('#home-screen');
    const plannerScreen = document.querySelector('#planner-screen');
    const form = document.querySelector('#meal-form');
    const statusMessage = document.querySelector('#form-status');
    let coordinates = null;

    function showPlanner(show) {
      homeScreen.classList.toggle('active', !show);
      plannerScreen.classList.toggle('active', show);
      homeScreen.hidden = show;
      plannerScreen.hidden = !show;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    document.querySelector('#start-button').addEventListener('click', () => showPlanner(true));
    document.querySelector('#back-button').addEventListener('click', () => showPlanner(false));

    document.querySelector('#use-location').addEventListener('click', () => {
      if (!navigator.geolocation) {
        statusMessage.textContent = 'Location sharing is not available in this browser. Enter a city or ZIP code instead.';
        statusMessage.classList.add('error');
        return;
      }
      statusMessage.classList.remove('error');
      statusMessage.textContent = 'Requesting your location…';
      navigator.geolocation.getCurrentPosition(async ({ coords }) => {
        coordinates = { lat: coords.latitude, lon: coords.longitude };
        document.querySelector('#location').value = `${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`;
        statusMessage.textContent = 'Location added. Tap Find my meal when you’re ready.';
        try {
          const query = new URLSearchParams({ format: 'jsonv2', lat: coords.latitude, lon: coords.longitude, zoom: '14' });
          const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${query}`);
          if (response.ok) {
            const result = await response.json();
            const address = result.address || {};
            const placeName = address.suburb || address.neighbourhood || address.city || address.town || address.village;
            if (placeName) document.querySelector('#location').value = placeName;
          }
        } catch { /* Coordinates remain available even if reverse geocoding is unavailable. */ }
      }, (error) => {
        statusMessage.classList.add('error');
        statusMessage.textContent = error.code === 1 ? 'Location permission was denied. Enter a city or ZIP code instead.' : 'Could not get your location. Enter a city or ZIP code instead.';
      }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
    });

    async function geocodeLocation(location) {
      const coordinateMatch = location.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
      if (coordinateMatch) return { lat: Number(coordinateMatch[1]), lon: Number(coordinateMatch[2]) };
      const query = new URLSearchParams({ format: 'jsonv2', q: location, limit: '1' });
      const response = await fetch(`https://nominatim.openstreetmap.org/search?${query}`);
      if (!response.ok) throw new Error('Location search is temporarily unavailable. Try again or use a nearby city.');
      const matches = await response.json();
      if (!matches.length) throw new Error('We couldn’t find that location. Try a city, neighborhood, or ZIP code.');
      return { lat: Number(matches[0].lat), lon: Number(matches[0].lon) };
    }

    async function findNearbyPlaces(point) {
      const query = `[out:json][timeout:15];(node[amenity~"restaurant|cafe|fast_food|food_court"](around:3500,${point.lat},${point.lon});way[amenity~"restaurant|cafe|fast_food|food_court"](around:3500,${point.lat},${point.lon}););out center tags 20;`;
      const response = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }, body: `data=${encodeURIComponent(query)}` });
      if (!response.ok) throw new Error('Nearby places are temporarily unavailable. Your meal idea is still ready.');
      const data = await response.json();
      return data.elements.map((place) => {
        const lat = place.lat ?? place.center?.lat;
        const lon = place.lon ?? place.center?.lon;
        if (lat == null || lon == null) return null;
        return { name: place.tags?.name || 'Nearby restaurant', type: place.tags?.cuisine?.replaceAll(';', ', ') || place.tags?.amenity?.replaceAll('_', ' ') || 'Food nearby', distance: distanceKm(point.lat, point.lon, lat, lon) };
      }).filter(Boolean).sort((a, b) => a.distance - b.distance).slice(0, 5);
    }

    function distanceKm(lat1, lon1, lat2, lon2) {
      const radians = (degrees) => degrees * Math.PI / 180;
      const dLat = radians(lat2 - lat1);
      const dLon = radians(lon2 - lon1);
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
      return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    const mealIdeas = {
      omnivore: { name: 'Chicken, rice & greens bowl', ingredients: 'Grilled chicken, brown rice, black beans, greens, and a citrus-yogurt dressing.', protein: 38, carbs: 54, fat: 16, fiber: 12, price: 8.5 },
      vegetarian: { name: 'Crispy tofu grain bowl', ingredients: 'Golden tofu, brown rice, edamame, crunchy greens, and sesame-lime dressing.', protein: 30, carbs: 57, fat: 18, fiber: 13, price: 7.5 },
      vegan: { name: 'Lentil & roasted veg bowl', ingredients: 'Warm lentils, roasted seasonal vegetables, brown rice, and a lemon-tahini drizzle.', protein: 25, carbs: 61, fat: 17, fiber: 17, price: 6.5 },
      pescatarian: { name: 'Salmon & greens plate', ingredients: 'Salmon, brown rice, seasonal greens, and a bright lemon-herb dressing.', protein: 35, carbs: 48, fat: 19, fiber: 9, price: 10.5 }
    };

    function renderMeal(goals, budget, foodType) {
      const meal = { ...mealIdeas[foodType] };
      const scale = Math.min(1.45, Math.max(.7, Math.min(
        goals.protein ? goals.protein / meal.protein : 1,
        goals.carbs ? goals.carbs / meal.carbs : 1,
        goals.fat ? goals.fat / meal.fat : 1,
        goals.fiber ? goals.fiber / meal.fiber : 1
      )));
      const costScale = Math.min(1, budget / (meal.price * scale));
      const portion = scale * costScale;
      const estimate = (value) => Math.round(value * portion);
      const finalCost = Math.min(budget, meal.price * portion);
      document.querySelector('#meal-name').textContent = meal.name;
      document.querySelector('#meal-description').textContent = meal.ingredients;
      document.querySelector('#nutrition-row').innerHTML = [
        ['Protein', estimate(meal.protein)], ['Carbs', estimate(meal.carbs)], ['Fat', estimate(meal.fat)], ['Fiber', estimate(meal.fiber)]
      ].map(([label, amount]) => `<div class="nutrition-cell"><strong>${amount}g</strong><span>${label}</span></div>`).join('');
      document.querySelector('#meal-cost').textContent = `~$${finalCost.toFixed(2)} estimated ingredients`;
      document.querySelector('#meal-type').textContent = `${foodType[0].toUpperCase()}${foodType.slice(1)} idea`;
      document.querySelector('#meal-result').classList.add('visible');
    }

    function renderPlaces(places) {
      const list = document.querySelector('#place-list');
      list.replaceChildren();
      if (!places.length) {
        const item = document.createElement('li');
        item.className = 'result-card';
        item.innerHTML = '<p>No restaurants were listed nearby in OpenStreetMap. Try a broader location; your meal idea is still below.</p>';
        list.append(item);
      } else {
        for (const place of places) {
          const item = document.createElement('li');
          item.className = 'place-item';
          const details = document.createElement('div');
          const name = document.createElement('strong');
          const kind = document.createElement('span');
          const distance = document.createElement('span');
          name.textContent = place.name;
          kind.textContent = place.type;
          distance.className = 'place-distance';
          distance.textContent = place.distance < 1 ? `${Math.round(place.distance * 1000)} m` : `${place.distance.toFixed(1)} km`;
          details.append(name, kind);
          item.append(details, distance);
          list.append(item);
        }
      }
      document.querySelector('#places-area').hidden = false;
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const location = String(data.get('location') || '').trim();
      const budget = Number(data.get('budget'));
      const foodType = String(data.get('foodType'));
      if (!location || !Number.isFinite(budget) || budget <= 0) {
        statusMessage.classList.add('error');
        statusMessage.textContent = 'Enter a location and a budget greater than zero.';
        return;
      }
      const goals = Object.fromEntries(['protein', 'carbs', 'fat', 'fiber'].map((key) => [key, Number(data.get(key)) || 0]));
      const button = document.querySelector('#find-button');
      button.disabled = true;
      button.textContent = 'Finding nearby…';
      statusMessage.classList.remove('error');
      statusMessage.textContent = 'Looking up your location and nearby places…';
      document.querySelector('#empty-result').hidden = true;
      document.querySelector('#meal-result').classList.remove('visible');
      try {
        const point = coordinates && document.querySelector('#location').value.includes(',') ? coordinates : await geocodeLocation(location);
        coordinates = point;
        renderMeal(goals, budget, foodType);
        try {
          const places = await findNearbyPlaces(point);
          renderPlaces(places);
          statusMessage.textContent = places.length ? `Found ${places.length} nearby places and made a meal idea for your goals.` : 'No nearby places were listed; your meal idea is ready.';
        } catch (error) {
          document.querySelector('#places-area').hidden = true;
          statusMessage.textContent = `${error.message} Your meal idea is ready.`;
        }
      } catch (error) {
        document.querySelector('#empty-result').hidden = false;
        statusMessage.classList.add('error');
        statusMessage.textContent = error.message || 'Something went wrong. Please try again.';
      } finally {
        button.disabled = false;
        button.innerHTML = 'Find my meal <span class="button-arrow" aria-hidden="true">→</span>';
      }
    });
  