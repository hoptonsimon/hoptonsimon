"use strict";

import powerbi from "powerbi-visuals-api";
import { VisualSettings } from "./settings";
import {
    getWeatherIcon,
    getPrecipitationIcon,
    getHumidityIcon,
    getWindIcon,
    IconStyle,
    IconColors,
} from "./weatherIcons";

import VisualConstructorOptions    = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions         = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual                     = powerbi.extensibility.visual.IVisual;
import EnumerateVisualObjectInstancesOptions = powerbi.EnumerateVisualObjectInstancesOptions;
import VisualObjectInstanceEnumeration       = powerbi.VisualObjectInstanceEnumeration;

// ── Open-Meteo types ──────────────────────────────────────────────────────────

interface GeoResult {
    name: string;
    country: string;
    latitude: number;
    longitude: number;
    timezone: string;
}

interface WeatherData {
    location: string;
    country: string;
    timezone: string;
    current: {
        temperature: number;
        windspeed: number;
        weathercode: number;
        time: string;
    };
    hourly: {
        time: string[];
        temperature: number[];
        precipitation_probability: number[];
        weathercode: number[];
        windspeed: number[];
        relativehumidity: number[];
    };
    daily: {
        time: string[];
        temperature_max: number[];
        temperature_min: number[];
        weathercode: number[];
        precipitation_probability_max: number[];
    };
}

// ── WMO weather code → condition string ──────────────────────────────────────

function wmoCondition(code: number): string {
    if (code === 0)              return "Clear Sky";
    if (code === 1)              return "Mainly Clear";
    if (code === 2)              return "Partly Cloudy";
    if (code === 3)              return "Overcast";
    if (code === 45 || code === 48) return "Fog";
    if (code >= 51 && code <= 55)   return "Drizzle";
    if (code >= 56 && code <= 57)   return "Freezing Drizzle";
    if (code >= 61 && code <= 65)   return "Rain";
    if (code >= 66 && code <= 67)   return "Freezing Rain";
    if (code >= 71 && code <= 77)   return "Snow";
    if (code >= 80 && code <= 82)   return "Rain Showers";
    if (code >= 85 && code <= 86)   return "Snow Showers";
    if (code === 95)                return "Thunderstorm";
    if (code >= 96)                 return "Thunderstorm";
    return "Cloudy";
}

// Map WMO condition string to icon condition key used by weatherIcons.ts
function wmoToIconKey(code: number): string {
    if (code === 0)              return "Sunny";
    if (code === 1)              return "Mainly Clear";
    if (code === 2)              return "Partly Cloudy";
    if (code === 3)              return "Overcast";
    if (code === 45 || code === 48) return "Fog";
    if (code >= 51 && code <= 57)   return "Drizzle";
    if (code >= 61 && code <= 67)   return "Rain";
    if (code >= 71 && code <= 77)   return "Snow";
    if (code >= 80 && code <= 82)   return "Rain";
    if (code >= 85 && code <= 86)   return "Snow";
    if (code >= 95)                 return "Thunderstorm";
    return "Cloudy";
}

// ── Cache ─────────────────────────────────────────────────────────────────────

interface CacheEntry {
    cityKey: string;
    unit: string;
    data: WeatherData;
    fetchedAt: number;
}

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

// ── Main Visual Class ─────────────────────────────────────────────────────────

export class WeatherVisual implements IVisual {
    private target: HTMLElement;
    private settings: VisualSettings;
    private cache: CacheEntry | null = null;

    constructor(options: VisualConstructorOptions) {
        this.target = options.element;
        this.target.style.overflow = "hidden";
        this.target.style.width = "100%";
        this.target.style.height = "100%";
    }

    public update(options: VisualUpdateOptions): void {
        this.settings = VisualSettings.parse<VisualSettings>(
            options.dataViews && options.dataViews[0]
        );
        this.applyVars();
        this.loadAndRender();
    }

    // ── Fetch + render pipeline ───────────────────────────────────────────────

    private async loadAndRender(): Promise<void> {
        const city = (this.settings.locationSettings.cityName || "London").trim();
        const unit = this.settings.displaySettings.temperatureUnit;
        const cacheKey = city.toLowerCase();
        const now = Date.now();

        // Use cached data if still fresh and same city+unit
        if (
            this.cache &&
            this.cache.cityKey === cacheKey &&
            this.cache.unit === unit &&
            now - this.cache.fetchedAt < CACHE_TTL_MS
        ) {
            this.render(this.cache.data);
            return;
        }

        this.renderLoading(city);

        try {
            const data = await this.fetchWeather(city, unit);
            this.cache = { cityKey: cacheKey, unit, data, fetchedAt: now };
            this.render(data);
        } catch (err) {
            this.renderError(String(err));
        }
    }

    // ── Open-Meteo API calls ──────────────────────────────────────────────────

    private async fetchWeather(city: string, unit: string): Promise<WeatherData> {
        // Step 1: Geocode the city name
        const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=3&language=en&format=json`;
        const geoResp = await fetch(geoUrl);
        if (!geoResp.ok) throw new Error(`Geocoding failed (${geoResp.status})`);
        const geoJson = await geoResp.json();

        if (!geoJson.results || geoJson.results.length === 0) {
            throw new Error(`City not found: "${city}"`);
        }
        const geo: GeoResult = geoJson.results[0];

        // Step 2: Fetch forecast
        const tempUnit = unit === "C" ? "celsius" : "fahrenheit";
        const wxUrl = [
            `https://api.open-meteo.com/v1/forecast`,
            `?latitude=${geo.latitude}`,
            `&longitude=${geo.longitude}`,
            `&hourly=temperature_2m,precipitation_probability,weathercode,windspeed_10m,relativehumidity_2m`,
            `&daily=temperature_2m_max,temperature_2m_min,weathercode,precipitation_probability_max`,
            `&current_weather=true`,
            `&timezone=auto`,
            `&temperature_unit=${tempUnit}`,
            `&windspeed_unit=mph`,
            `&forecast_days=7`,
        ].join("");

        const wxResp = await fetch(wxUrl);
        if (!wxResp.ok) throw new Error(`Weather fetch failed (${wxResp.status})`);
        const wx = await wxResp.json();

        return {
            location: geo.name,
            country: geo.country,
            timezone: wx.timezone,
            current: {
                temperature: Math.round(wx.current_weather.temperature),
                windspeed:   Math.round(wx.current_weather.windspeed),
                weathercode: wx.current_weather.weathercode,
                time:        wx.current_weather.time,
            },
            hourly: {
                time:                     wx.hourly.time,
                temperature:              wx.hourly.temperature_2m.map(Math.round),
                precipitation_probability: wx.hourly.precipitation_probability,
                weathercode:              wx.hourly.weathercode,
                windspeed:                wx.hourly.windspeed_10m.map(Math.round),
                relativehumidity:         wx.hourly.relativehumidity_2m,
            },
            daily: {
                time:                        wx.daily.time,
                temperature_max:             wx.daily.temperature_2m_max.map(Math.round),
                temperature_min:             wx.daily.temperature_2m_min.map(Math.round),
                weathercode:                 wx.daily.weathercode,
                precipitation_probability_max: wx.daily.precipitation_probability_max,
            },
        };
    }

    // ── CSS variable injection ────────────────────────────────────────────────

    private applyVars(): void {
        const cs = this.settings.colorSettings;
        const fs = this.settings.fontSettings;
        const el = this.target;
        el.style.setProperty("--wv-font-family",        fs.fontFamily);
        el.style.setProperty("--wv-text-color",         cs.textColor);
        el.style.setProperty("--wv-bg-color",           cs.backgroundColor);
        el.style.setProperty("--wv-bg-opacity",         String(cs.backgroundOpacity / 100));
        el.style.setProperty("--wv-accent-color",       cs.accentColor);
        el.style.setProperty("--wv-highlight-color",    cs.highlightColor);
        el.style.setProperty("--wv-gradient-start",     cs.gradientStartColor);
        el.style.setProperty("--wv-gradient-end",       cs.gradientEndColor);
        el.style.setProperty("--wv-border-radius",      `${cs.borderRadius}px`);
        el.style.setProperty("--wv-temp-font-size",     `${fs.currentTempSize}px`);
        el.style.setProperty("--wv-location-font-size", `${fs.locationFontSize}px`);
        el.style.setProperty("--wv-label-font-size",    `${fs.labelFontSize}px`);
        el.style.setProperty("--wv-bg-rgb",             this.hexToRgb(cs.backgroundColor));
    }

    // ── Render: loading state ─────────────────────────────────────────────────

    private renderLoading(city: string): void {
        const s = this.settings.colorSettings;
        this.setHTML(this.target, `
        <div class="weatherVisualRoot">
            <div class="wv-card style-${s.cardStyle}">
                <div class="wv-no-data">
                    <div class="wv-spinner"></div>
                    <div>Loading weather for ${this.esc(city)}…</div>
                </div>
            </div>
        </div>`);
    }

    // ── Render: error state ───────────────────────────────────────────────────

    private renderError(message: string): void {
        const s = this.settings.colorSettings;
        this.setHTML(this.target, `
        <div class="weatherVisualRoot">
            <div class="wv-card style-${s.cardStyle}">
                <div class="wv-no-data">
                    <div style="font-size:28px">⚠</div>
                    <div>${this.esc(message)}</div>
                    <div style="font-size:11px;opacity:0.6">Check the city name in the Format pane → Location</div>
                </div>
            </div>
        </div>`);
    }

    // ── Render: main card ─────────────────────────────────────────────────────

    private render(data: WeatherData): void {
        const ds = this.settings.displaySettings;
        const cs = this.settings.colorSettings;
        const is = this.settings.iconSettings;

        const iconColors: IconColors = {
            sun:   is.sunColor,
            cloud: is.cloudColor,
            rain:  is.rainColor,
            text:  cs.textColor,
        };
        const iconStyle    = is.iconSet as IconStyle;
        const iconSizeClass = `size-${is.iconSize}`;
        const unit          = ds.temperatureUnit;
        const unitLabel     = `°${unit}`;

        // Find the nearest hourly slot to now
        const nowStr   = new Date().toISOString().slice(0, 13); // "YYYY-MM-DDTHH"
        let nowIdx     = data.hourly.time.findIndex(t => t.startsWith(nowStr));
        if (nowIdx < 0) nowIdx = 0;

        const currentCode  = data.current.weathercode;
        const currentCond  = wmoCondition(currentCode);
        const currentTemp  = data.current.temperature;
        const todayHigh    = data.daily.temperature_max[0];
        const todayLow     = data.daily.temperature_min[0];
        const currentPrecip = data.hourly.precipitation_probability[nowIdx];
        const currentHumidity = data.hourly.relativehumidity[nowIdx];
        const currentWind  = data.current.windspeed;

        const currentIconSvg = is.showIcons
            ? getWeatherIcon(wmoToIconKey(currentCode), iconStyle, iconColors)
            : "";

        const styleClass = `style-${cs.cardStyle}`;
        const dateLabel  = this.formatDate(new Date());
        const locLabel   = `${data.location}, ${data.country}`;

        const html = `
        <div class="weatherVisualRoot">
            <div class="wv-card ${styleClass}">
                ${this.renderHeader(locLabel, dateLabel, ds)}
                ${this.renderCurrentBlock(currentTemp, currentCond, todayHigh, todayLow, currentIconSvg, iconSizeClass, unitLabel, ds)}
                ${this.renderDetails(currentPrecip, currentHumidity, currentWind, ds, iconColors)}
                <div class="wv-divider"></div>
                ${this.renderTabBar(ds.viewMode)}
                ${ds.viewMode === "daily"
                    ? this.renderDailyView(data, ds, is, iconColors, iconStyle, iconSizeClass, unitLabel)
                    : this.renderHourlyView(data, ds, is, iconColors, iconStyle, iconSizeClass, unitLabel, nowIdx)
                }
            </div>
        </div>`;

        this.setHTML(this.target, html);
    }

    // ── Header ────────────────────────────────────────────────────────────────

    private renderHeader(location: string, dateLabel: string, ds: any): string {
        const locPart  = ds.showLocation ? `<div class="wv-location">${this.esc(location)}</div>` : "";
        const datePart = ds.showDate     ? `<div class="wv-date">${this.esc(dateLabel)}</div>` : "";
        return `
        <div class="wv-header">
            <div class="wv-location-block">${locPart}${datePart}</div>
            <div class="wv-settings-dot"></div>
        </div>`;
    }

    // ── Current conditions block ──────────────────────────────────────────────

    private renderCurrentBlock(
        temp: number,
        condition: string,
        high: number,
        low: number,
        iconSvg: string,
        iconSizeClass: string,
        unitLabel: string,
        ds: any
    ): string {
        const highLowHtml = ds.showHighLow ? `
            <div class="wv-high-low">
                <span class="wv-high">${high}${unitLabel}</span>
                <span class="wv-low">${low}${unitLabel}</span>
            </div>` : "";

        return `
        <div class="wv-current">
            ${iconSvg ? `<div class="wv-current-icon ${iconSizeClass}">${iconSvg}</div>` : ""}
            <div class="wv-current-info">
                <div class="wv-condition-label">${this.esc(condition)}</div>
                <div class="wv-current-temp">
                    ${temp}<span class="wv-temp-unit">${unitLabel}</span>
                </div>
                ${highLowHtml}
            </div>
        </div>`;
    }

    // ── Details row (precip / humidity / wind) ────────────────────────────────

    private renderDetails(
        precip: number | null,
        humidity: number | null,
        wind: number | null,
        ds: any,
        iconColors: IconColors
    ): string {
        const items: string[] = [];
        if (ds.showPrecipitation && precip !== null) {
            items.push(`<div class="wv-detail-item">
                <div class="wv-detail-icon">${getPrecipitationIcon(iconColors.rain)}</div>
                <span>${Math.round(precip)}%</span></div>`);
        }
        if (ds.showHumidity && humidity !== null) {
            items.push(`<div class="wv-detail-item">
                <div class="wv-detail-icon">${getHumidityIcon(iconColors.text)}</div>
                <span>${Math.round(humidity)}%</span></div>`);
        }
        if (ds.showWindSpeed && wind !== null) {
            items.push(`<div class="wv-detail-item">
                <div class="wv-detail-icon">${getWindIcon(iconColors.text)}</div>
                <span>${Math.round(wind)} mph</span></div>`);
        }
        return items.length ? `<div class="wv-details">${items.join("")}</div>` : "";
    }

    // ── Tab bar ───────────────────────────────────────────────────────────────

    private renderTabBar(viewMode: string): string {
        return `
        <div class="wv-tab-bar">
            <span class="wv-tab ${viewMode === "hourly" ? "active" : ""}">Hourly</span>
            <span class="wv-tab ${viewMode === "daily"  ? "active" : ""}">Daily</span>
        </div>`;
    }

    // ── Hourly strip ──────────────────────────────────────────────────────────

    private renderHourlyView(
        data: WeatherData,
        ds: any, is: any,
        iconColors: IconColors,
        iconStyle: IconStyle,
        iconSizeClass: string,
        unitLabel: string,
        nowIdx: number
    ): string {
        const limit = Math.min(Math.max(2, Math.round(ds.hoursToShow)), 12);
        const slots = data.hourly.time
            .slice(nowIdx, nowIdx + limit)
            .map((t, i) => ({
                time:   i === 0 ? "Now" : this.formatHour(t),
                temp:   data.hourly.temperature[nowIdx + i],
                code:   data.hourly.weathercode[nowIdx + i],
                precip: data.hourly.precipitation_probability[nowIdx + i],
            }));

        const html = slots.map((slot, i) => {
            const iconSvg = is.showIcons
                ? getWeatherIcon(wmoToIconKey(slot.code), iconStyle, iconColors) : "";
            const precipHtml = ds.showPrecipitation && slot.precip != null
                ? `<div class="wv-slot-precip">${slot.precip}%</div>` : "";
            return `
            <div class="wv-forecast-item${i === 0 ? " current-slot" : ""}">
                <div class="wv-slot-time">${slot.time}</div>
                ${iconSvg ? `<div class="wv-slot-icon ${iconSizeClass}">${iconSvg}</div>` : ""}
                <div class="wv-slot-temp">${slot.temp}${unitLabel}</div>
                ${precipHtml}
            </div>`;
        }).join("");

        return `<div class="wv-forecast">${html}</div>`;
    }

    // ── Daily rows ────────────────────────────────────────────────────────────

    private renderDailyView(
        data: WeatherData,
        ds: any, is: any,
        iconColors: IconColors,
        iconStyle: IconStyle,
        iconSizeClass: string,
        unitLabel: string
    ): string {
        const limit = Math.min(Math.max(2, Math.round(ds.daysToShow)), 7);
        const html = data.daily.time.slice(0, limit).map((dateStr, i) => {
            const code   = data.daily.weathercode[i];
            const high   = data.daily.temperature_max[i];
            const low    = data.daily.temperature_min[i];
            const precip = data.daily.precipitation_probability_max[i];
            const cond   = wmoCondition(code);
            const iconSvg = is.showIcons
                ? getWeatherIcon(wmoToIconKey(code), iconStyle, iconColors) : "";
            const dayName = i === 0 ? "Today" : this.formatDayName(dateStr);
            const highLow = ds.showHighLow ? `
                <div class="wv-day-temps">
                    <span class="wv-day-high">${high}${unitLabel}</span>
                    <span class="wv-day-low">${low}${unitLabel}</span>
                </div>` : "";
            const precipBadge = ds.showPrecipitation && precip != null
                ? `<span class="wv-day-precip">${precip}%</span>` : "";

            return `
            <div class="wv-daily-row">
                <div class="wv-day-name">${dayName}</div>
                ${iconSvg ? `<div class="wv-day-icon ${iconSizeClass}">${iconSvg}</div>` : ""}
                <div class="wv-day-condition">${this.esc(cond)}</div>
                ${precipBadge}
                ${highLow}
            </div>`;
        }).join("");

        return `<div class="wv-daily-list">${html}</div>`;
    }

    // ── Formatting helpers ────────────────────────────────────────────────────

    private formatDate(d: Date): string {
        return d.toLocaleDateString("en-GB", {
            weekday: "long", day: "numeric", month: "long", year: "numeric"
        });
    }

    private formatHour(isoStr: string): string {
        // isoStr = "2024-04-03T14:00"
        const h = parseInt(isoStr.slice(11, 13), 10);
        const ampm = h >= 12 ? "PM" : "AM";
        return `${h % 12 || 12}${ampm}`;
    }

    private formatDayName(dateStr: string): string {
        // dateStr = "2024-04-03"
        const d = new Date(dateStr + "T12:00:00");
        return d.toLocaleDateString("en-GB", { weekday: "short" });
    }

    private esc(s: string): string {
        return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    private hexToRgb(hex: string): string {
        const c = hex.replace("#", "");
        const full = c.length === 3
            ? c.split("").map(x => x + x).join("")
            : c;
        return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16)).join(",");
    }

    // ── DOM helpers ───────────────────────────────────────────────────────────

    private clearElement(el: HTMLElement): void {
        while (el.firstChild) el.removeChild(el.firstChild);
    }

    private setHTML(el: HTMLElement, html: string): void {
        this.clearElement(el);
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");
        Array.from(doc.body.childNodes).forEach(node => el.appendChild(node));
    }

    // ── Power BI Format Pane ──────────────────────────────────────────────────

    public enumerateObjectInstances(options: EnumerateVisualObjectInstancesOptions): VisualObjectInstanceEnumeration {
        return VisualSettings.enumerateObjectInstances(
            this.settings || VisualSettings.getDefault(),
            options
        );
    }
}
