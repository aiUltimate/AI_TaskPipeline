import { updateJsonView, hashString, roundToOne } from './utils.js';

function buildLocationSpec() {
  const inputEl = document.getElementById('weather-location-input');
  const unitsEl = document.getElementById('weather-units');
  const rawText = (inputEl?.value || '').trim();
  const units = unitsEl?.value === 'imperial' ? 'imperial' : 'metric';

  const parts = rawText.split(',').map((p) => p.trim()).filter(Boolean);
  const city = parts[0] || 'Unknown';
  const countryGuess = parts[1] || null;

  const payload = {
    type: 'LocationSpec',
    input_text: rawText,
    city,
    country_guess: countryGuess,
    units,
    meta: {
      created_at: Date.now(),
    },
  };

  updateJsonView('weather-location-json', payload);
  return payload;
}

function buildWeatherRequest(locationSpec) {
  const payload = {
    type: 'WeatherRequest',
    provider_hint: 'mock_weather_v1',
    location: {
      city: locationSpec.city,
      country_guess: locationSpec.country_guess,
    },
    units: locationSpec.units,
    parameters: {
      horizon_days: 3,
    },
  };

  updateJsonView('weather-request-json', payload);
  return payload;
}

function buildMockForecast(weatherRequest) {
  const base = Math.abs(hashString(weatherRequest.location.city)) % 15;
  const todayBase = 18 + base;
  const tomorrowBase = todayBase + ((hashString(weatherRequest.units) % 5) - 2);

  const temps = [];
  for (let i = 0; i < 24; i++) {
    const variation = Math.sin((i / 24) * Math.PI) * 5;
    temps.push(tomorrowBase + variation);
  }

  const payload = {
    type: 'RawForecast',
    provider: 'mock_weather_v1',
    location: weatherRequest.location,
    units: weatherRequest.units,
    hourly: temps.map((t, idx) => ({
      hour: idx,
      temp: roundToOne(t),
    })),
    meta: {
      generated_at: Date.now(),
    },
  };

  updateJsonView('weather-forecast-json', payload);
  return payload;
}

function extractTomorrowStats(rawForecast) {
  const temps = rawForecast.hourly.map((h) => h.temp);
  const minTemp = Math.min(...temps);
  const maxTemp = Math.max(...temps);
  const avgTemp = temps.reduce((acc, v) => acc + v, 0) / (temps.length || 1);

  const ideal = rawForecast.units === 'imperial' ? 70 : 21;
  const diff = Math.abs(avgTemp - ideal);
  const comfortScore = Math.max(0, 100 - diff * 5);

  const payload = {
    type: 'TomorrowStats',
    units: rawForecast.units,
    location: rawForecast.location,
    min_temp: roundToOne(minTemp),
    max_temp: roundToOne(maxTemp),
    avg_temp: roundToOne(avgTemp),
    comfort_score: Math.round(comfortScore),
    meta: {
      from: 'RawForecast',
    },
  };

  updateJsonView('weather-stats-json', payload);
  return payload;
}

function compareWithPrevious(stats) {
  const key = 'weather:last:' + stats.location.city + ':' + stats.units;
  const prevRaw = localStorage.getItem(key);
  let prev = null;
  if (prevRaw) {
    try {
      prev = JSON.parse(prevRaw);
    } catch {
      prev = null;
    }
  }

  const deltaComfort =
    prev && typeof prev.comfort_score === 'number'
      ? stats.comfort_score - prev.comfort_score
      : null;

  const payload = {
    type: 'WeatherComparison',
    current: stats,
    previous: prev,
    deltas: {
      comfort_score: deltaComfort,
    },
  };

  localStorage.setItem(key, JSON.stringify(stats));

  updateJsonView('weather-comparison-json', payload);
  return payload;
}

function renderWeather(comparison) {
  const summaryEl = document.getElementById('weather-summary');

  const current = comparison.current;
  const prevComfort = comparison.previous ? comparison.previous.comfort_score : null;
  const deltaComfort = comparison.deltas.comfort_score;

  const unitsLabel = current.units === 'imperial' ? '°F' : '°C';

  let comfortLine = '';
  if (prevComfort == null || deltaComfort == null) {
    comfortLine = `Comfort score is ${current.comfort_score} (0–100, higher is more comfortable).`;
  } else if (deltaComfort > 0) {
    comfortLine = `Comfort score improved from ${prevComfort} → ${current.comfort_score} (Δ +${deltaComfort}).`;
  } else if (deltaComfort < 0) {
    comfortLine = `Comfort score fell from ${prevComfort} → ${current.comfort_score} (Δ ${deltaComfort}).`;
  } else {
    comfortLine = `Comfort score stayed the same at ${current.comfort_score}.`;
  }

  summaryEl.innerHTML =
    `<strong>${current.location.city}</strong> tomorrow: ` +
    `<strong>${current.min_temp}${unitsLabel}</strong> low, ` +
    `<strong>${current.max_temp}${unitsLabel}</strong> high, ` +
    `average around <strong>${current.avg_temp}${unitsLabel}</strong>.<br/>` +
    comfortLine;

  const payload = {
    type: 'WeatherRenderModel',
    display_city: current.location.city,
    units: unitsLabel,
    min_temp_label: `${current.min_temp}${unitsLabel}`,
    max_temp_label: `${current.max_temp}${unitsLabel}`,
    avg_temp_label: `${current.avg_temp}${unitsLabel}`,
    comfort_score: current.comfort_score,
    previous_comfort_score: prevComfort,
    delta_comfort: deltaComfort,
  };

  updateJsonView('weather-render-json', payload);
  return payload;
}

export function runWeatherPipeline() {
  const statusEl = document.getElementById('weather-status');
  if (statusEl) {
    statusEl.textContent = 'Running weather pipeline…';
    statusEl.classList.remove('ok', 'error');
  }

  try {
    const locationSpec = buildLocationSpec();
    const request = buildWeatherRequest(locationSpec);
    const forecast = buildMockForecast(request);
    const stats = extractTomorrowStats(forecast);
    const comparison = compareWithPrevious(stats);
    renderWeather(comparison);

    if (statusEl) {
      statusEl.textContent = 'Weather pipeline complete.';
      statusEl.classList.add('ok');
    }
  } catch (err) {
    console.error(err);
    if (statusEl) {
      statusEl.textContent = 'Error: ' + err.message;
      statusEl.classList.add('error');
    }
  }
}
