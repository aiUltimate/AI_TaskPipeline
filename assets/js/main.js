import { runWeatherPipeline } from './weatherPipeline.js';
import { runAuditPipeline, loadSampleHtml } from './auditPipeline.js';

function wireEvents() {
  const weatherBtn = document.getElementById('run-weather');
  const auditBtn = document.getElementById('run-audit');
  const sampleBtn = document.getElementById('load-sample');

  if (weatherBtn) {
    weatherBtn.addEventListener('click', runWeatherPipeline);
  }
  if (auditBtn) {
    auditBtn.addEventListener('click', runAuditPipeline);
  }
  if (sampleBtn) {
    sampleBtn.addEventListener('click', function (evt) {
      evt.preventDefault();
      loadSampleHtml();
    });
  }
}

document.addEventListener('DOMContentLoaded', wireEvents);
