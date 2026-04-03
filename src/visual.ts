"use strict";

import powerbi from "powerbi-visuals-api";
import { VisualSettings } from "./settings";
import {
    getWeatherIcon,
    getPrecipitationIcon,
    getHumidityIcon,
    getWindIcon,
    getPressureIcon,
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
        surface_pressure: number[];
    };
    daily: {
        time: string[];
        temperature_max: number[];
        temperature_min: number[];
        weathercode: number[];
        precipitation_probability_max: number[];
    };
}

// ── WMO weather-code helpers ──────────────────────────────────────────────────

function wmoCondition(code: number): string {
    if (code === 0)                  return "Clear Sky";
    if (code === 1)                  return "Mainly Clear";
    if (code === 2)                  return "Partly Cloudy";
    if (code === 3)                  return "Overcast";
    if (code === 45 || code === 48)  return "Fog";
    if (code >= 51 && code <= 55)    return "Drizzle";
    if (code >= 56 && code <= 57)    return "Freezing Drizzle";
    if (code >= 61 && code <= 65)    return "Rain";
    if (code >= 66 && code <= 67)    return "Freezing Rain";
    if (code >= 71 && code <= 77)    return "Snow";
    if (code >= 80 && code <= 82)    return "Rain Showers";
    if (code >= 85 && code <= 86)    return "Snow Showers";
    if (code >= 95)                  return "Thunderstorm";
    return "Cloudy";
}

function wmoToIconKey(code: number): string {
    if (code === 0)                  return "Sunny";
    if (code === 1)                  return "Mainly Clear";
    if (code === 2)                  return "Partly Cloudy";
    if (code === 3)                  return "Overcast";
    if (code === 45 || code === 48)  return "Fog";
    if (code >= 51 && code <= 57)    return "Drizzle";
    if (code >= 61 && code <= 67)    return "Rain";
    if (code >= 71 && code <= 77)    return "Snow";
    if (code >= 80 && code <= 82)    return "Rain";
    if (code >= 85 && code <= 86)    return "Snow";
    if (code >= 95)                  return "Thunderstorm";
    return "Cloudy";
}

// ── Cache ─────────────────────────────────────────────────────────────────────

interface CacheEntry {
    cityKey: string;
    unit: string;
    data: WeatherData;
    fetchedAt: number;
}

const CACHE_TTL_MS = 30 * 60 * 1000;

// ── Main Visual Class ─────────────────────────────────────────────────────────

export class WeatherVisual implements IVisual {
    private target: HTMLElement;
    private settings: VisualSettings;
    private cache: CacheEntry | null = null;

    constructor(options: VisualConstructorOptions) {
        this.target = options.element;
        this.target.style.overflow = "hidden";
        this.target.style.width    = "100%";
        this.target.style.height   = "100%";
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
        const city    = (this.settings.locationSettings.cityName || "London").trim();
        const unit    = this.settings.displaySettings.temperatureUnit;
        const cacheKey = city.toLowerCase();
        const now     = Date.now();

        if (
            this.cache &&
            this.cache.cityKey === cacheKey &&
            this.cache.unit === unit &&
            now - this.cache.fetchedAt < CACHE_TTL_MS
        ) {
            this.render(this.cache.data);
            return;
        }

        // Show cached data instantly while refetching
        if (this.cache && this.cache.cityKey === cacheKey) {
            this.render(this.cache.data);
        } else {
            this.renderLoading(city);
        }

        try {
            const data = await this.fetchWeather(city, unit);
            this.cache = { cityKey: cacheKey, unit, data, fetchedAt: Date.now() };
            this.render(data);
        } catch (err) {
            if (!this.cache) this.renderError(String(err));
        }
    }

    // ── Open-Meteo API ────────────────────────────────────────────────────────

    private async fetchWeather(city: string, unit: string): Promise<WeatherData> {
        const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=3&language=en&format=json`;
        const geoResp = await fetch(geoUrl);
        if (!geoResp.ok) throw new Error(`Geocoding failed (${geoResp.status})`);
        const geoJson = await geoResp.json();
        if (!geoJson.results || geoJson.results.length === 0) {
            throw new Error(`City not found: "${city}"`);
        }
        const geo: GeoResult = geoJson.results[0];

        const tempUnit = unit === "C" ? "celsius" : "fahrenheit";
        const wxUrl = [
            `https://api.open-meteo.com/v1/forecast`,
            `?latitude=${geo.latitude}&longitude=${geo.longitude}`,
            `&hourly=temperature_2m,precipitation_probability,weathercode,windspeed_10m,relativehumidity_2m,surface_pressure`,
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
            country:  geo.country,
            current: {
                temperature: Math.round(wx.current_weather.temperature),
                windspeed:   Math.round(wx.current_weather.windspeed),
                weathercode: wx.current_weather.weathercode,
                time:        wx.current_weather.time,
            },
            hourly: {
                time:                      wx.hourly.time,
                temperature:               wx.hourly.temperature_2m.map(Math.round),
                precipitation_probability: wx.hourly.precipitation_probability,
                weathercode:               wx.hourly.weathercode,
                windspeed:                 wx.hourly.windspeed_10m.map(Math.round),
                relativehumidity:          wx.hourly.relativehumidity_2m,
                surface_pressure:          wx.hourly.surface_pressure.map(Math.round),
            },
            daily: {
                time:                          wx.daily.time,
                temperature_max:               wx.daily.temperature_2m_max.map(Math.round),
                temperature_min:               wx.daily.temperature_2m_min.map(Math.round),
                weathercode:                   wx.daily.weathercode,
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

    // ── Loading state ─────────────────────────────────────────────────────────

    private renderLoading(city: string): void {
        const styleClass = `style-${this.settings.colorSettings.cardStyle}`;
        this.setHTML(this.target, `
        <div class="weatherVisualRoot">
            <div class="wv-card ${styleClass}">
                <div class="wv-no-data">
                    <div class="wv-spinner"></div>
                    <div>Loading ${this.esc(city)}…</div>
                </div>
            </div>
        </div>`);
    }

    // ── Error state ───────────────────────────────────────────────────────────

    private renderError(msg: string): void {
        const styleClass = `style-${this.settings.colorSettings.cardStyle}`;
        this.setHTML(this.target, `
        <div class="weatherVisualRoot">
            <div class="wv-card ${styleClass}">
                <div class="wv-no-data">
                    <div style="font-size:26px;opacity:0.7">⚠</div>
                    <div>${this.esc(msg)}</div>
                    <div class="wv-no-data-sub">Check the city name in Format pane → Location</div>
                </div>
            </div>
        </div>`);
    }

    // ── Main render ───────────────────────────────────────────────────────────

    private render(data: WeatherData): void {
        const ds  = this.settings.displaySettings;
        const cs  = this.settings.colorSettings;
        const is  = this.settings.iconSettings;
        const fs  = this.settings.fontSettings;

        const iconColors: IconColors = {
            sun:   is.sunColor,
            cloud: is.cloudColor,
            rain:  is.rainColor,
            text:  cs.textColor,
        };
        const iconStyle     = is.iconSet as IconStyle;
        const iconSizeClass = `size-${is.iconSize}`;
        const unit          = ds.temperatureUnit;
        const unitLabel     = `°${unit}`;
        const styleClass    = `style-${cs.cardStyle}`;

        // Find hourly index closest to now
        const nowHour  = new Date().toISOString().slice(0, 13);
        let nowIdx     = data.hourly.time.findIndex(t => t.slice(0, 13) === nowHour);
        if (nowIdx < 0) nowIdx = 0;

        const html = `
        <div class="weatherVisualRoot">
            <div class="wv-card ${styleClass}">
                ${this.buildHeader(data, ds)}
                ${this.buildMain(data, nowIdx, ds, is, iconColors, iconStyle, iconSizeClass, unitLabel)}
                <div class="wv-divider"></div>
                ${this.buildTabBar(ds.viewMode)}
                ${ds.viewMode === "daily"
                    ? this.buildDailyView(data, ds, is, iconColors, iconStyle, iconSizeClass, unitLabel)
                    : this.buildHourlyView(data, ds, is, iconColors, iconStyle, iconSizeClass, unitLabel, nowIdx)
                }
            </div>
        </div>`;

        this.setHTML(this.target, html);
    }

    // ── Header ────────────────────────────────────────────────────────────────

    private buildHeader(data: WeatherData, ds: any): string {
        const dateStr = this.formatDate(new Date());
        const locStr  = `${data.location}, ${data.country}`;
        const pinSvg  = this.pinIconSvg(this.settings.colorSettings.textColor);

        return `
        <div class="wv-header">
            ${ds.showDate
                ? `<div class="wv-date">${this.esc(dateStr)}</div>`
                : `<div></div>`}
            ${ds.showLocation
                ? `<div class="wv-location-pill">
                      <div class="wv-pin-icon">${pinSvg}</div>
                      <span>${this.esc(locStr)}</span>
                   </div>`
                : ``}
        </div>`;
    }

    // ── Main conditions block ─────────────────────────────────────────────────

    private buildMain(
        data: WeatherData,
        nowIdx: number,
        ds: any, is: any,
        iconColors: IconColors,
        iconStyle: IconStyle,
        iconSizeClass: string,
        unitLabel: string
    ): string {
        const code      = data.current.weathercode;
        const cond      = wmoCondition(code);
        const temp      = data.current.temperature;
        const high      = data.daily.temperature_max[0];
        const low       = data.daily.temperature_min[0];
        const wind      = data.current.windspeed;
        const humidity  = Math.round(data.hourly.relativehumidity[nowIdx] ?? 0);
        const pressure  = Math.round(data.hourly.surface_pressure[nowIdx] ?? 0);

        const mainIconSvg = is.showIcons
            ? getWeatherIcon(wmoToIconKey(code), iconStyle, iconColors) : "";

        const highLow = ds.showHighLow ? `
        <div class="wv-high-low-col">
            <div class="wv-temp-row">
                <span class="wv-arrow-up">↑</span>
                <span class="wv-hl-val">${high}${unitLabel}</span>
            </div>
            <div class="wv-temp-row">
                <span class="wv-arrow-down">↓</span>
                <span class="wv-hl-val">${low}${unitLabel}</span>
            </div>
        </div>` : "";

        // Stats column: always show available data (wind, humidity, pressure)
        const statsItems: string[] = [];
        if (ds.showWindSpeed) {
            statsItems.push(`<div class="wv-stat">
                <div class="wv-stat-icon">${getWindIcon(iconColors.text)}</div>
                <span>${wind} mph</span>
            </div>`);
        }
        if (ds.showHumidity) {
            statsItems.push(`<div class="wv-stat">
                <div class="wv-stat-icon">${getHumidityIcon(iconColors.text)}</div>
                <span>${humidity}%</span>
            </div>`);
        }
        if (ds.showPrecipitation && pressure > 0) {
            statsItems.push(`<div class="wv-stat">
                <div class="wv-stat-icon">${getPressureIcon(iconColors.text)}</div>
                <span>${pressure} hPa</span>
            </div>`);
        }
        const statsCol = statsItems.length
            ? `<div class="wv-stats-col">${statsItems.join("")}</div>` : "";

        return `
        <div class="wv-main">
            ${mainIconSvg ? `<div class="wv-main-icon ${iconSizeClass}">${mainIconSvg}</div>` : ""}
            <div class="wv-main-temp-block">
                <div class="wv-temp-large">${temp}<span class="wv-temp-unit">${unitLabel}</span></div>
                <div class="wv-condition-text">${this.esc(cond)}</div>
            </div>
            ${highLow}
            ${statsCol}
        </div>`;
    }

    // ── Tab bar ───────────────────────────────────────────────────────────────

    private buildTabBar(viewMode: string): string {
        return `
        <div class="wv-tab-bar">
            <span class="wv-tab ${viewMode === "hourly" ? "active" : ""}">Hourly</span>
            <span class="wv-tab ${viewMode === "daily"  ? "active" : ""}">Daily</span>
        </div>`;
    }

    // ── Hourly strip ──────────────────────────────────────────────────────────

    private buildHourlyView(
        data: WeatherData,
        ds: any, is: any,
        iconColors: IconColors,
        iconStyle: IconStyle,
        iconSizeClass: string,
        unitLabel: string,
        nowIdx: number
    ): string {
        const limit = Math.min(Math.max(2, Math.round(ds.hoursToShow)), 24);
        const slots = data.hourly.time.slice(nowIdx, nowIdx + limit);

        const html = slots.map((timeStr, i) => {
            const idx    = nowIdx + i;
            const code   = data.hourly.weathercode[idx];
            const temp   = data.hourly.temperature[idx];
            const precip = data.hourly.precipitation_probability[idx];
            const label  = i === 0 ? "Now" : this.formatHour(timeStr);
            const iconSvg = is.showIcons
                ? getWeatherIcon(wmoToIconKey(code), iconStyle, iconColors) : "";
            const precipBadge = precip != null
                ? `<div class="wv-hour-precip">${precip}%</div>` : "";

            return `
            <div class="wv-hour-slot${i === 0 ? " current-slot" : ""}">
                <div class="wv-hour-time">${label}</div>
                ${iconSvg ? `<div class="wv-hour-icon ${iconSizeClass}">${iconSvg}</div>` : ""}
                <div class="wv-hour-temp">${temp}${unitLabel}</div>
                ${precipBadge}
            </div>`;
        }).join("");

        return `<div class="wv-hourly-wrap"><div class="wv-hourly-inner">${html}</div></div>`;
    }

    // ── Daily list ────────────────────────────────────────────────────────────

    private buildDailyView(
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
            const day    = i === 0 ? "Today" : this.formatDayName(dateStr);
            const iconSvg = is.showIcons
                ? getWeatherIcon(wmoToIconKey(code), iconStyle, iconColors) : "";

            return `
            <div class="wv-daily-row">
                <div class="wv-day-name">${day}</div>
                ${iconSvg ? `<div class="wv-day-icon ${iconSizeClass}">${iconSvg}</div>` : ""}
                <div class="wv-day-condition">${this.esc(cond)}</div>
                ${ds.showPrecipitation && precip != null
                    ? `<div class="wv-day-precip">${precip}%</div>` : ""}
                ${ds.showHighLow ? `
                <div class="wv-day-temps">
                    <span class="wv-day-high">${high}${unitLabel}</span>
                    <span class="wv-day-low">${low}${unitLabel}</span>
                </div>` : ""}
            </div>`;
        }).join("");

        return `<div class="wv-daily-wrap">${html}</div>`;
    }

    // ── SVG helpers ───────────────────────────────────────────────────────────

    private pinIconSvg(color: string): string {
        return `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="${color}">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z
                     m0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
        </svg>`;
    }

    // ── Date / time formatting (en-GB for UK style) ───────────────────────────

    private formatDate(d: Date): string {
        return d.toLocaleDateString("en-GB", {
            weekday: "long", day: "numeric", month: "long"
        });
    }

    private formatHour(isoStr: string): string {
        const h = parseInt(isoStr.slice(11, 13), 10);
        return `${String(h).padStart(2, "0")}:00`;
    }

    private formatDayName(dateStr: string): string {
        return new Date(dateStr + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short" });
    }

    // ── Utility ───────────────────────────────────────────────────────────────

    private esc(s: string): string {
        return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
                        .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    private hexToRgb(hex: string): string {
        const c    = hex.replace("#", "");
        const full = c.length === 3 ? c.split("").map(x => x + x).join("") : c;
        return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16)).join(",");
    }

    private clearElement(el: HTMLElement): void {
        while (el.firstChild) el.removeChild(el.firstChild);
    }

    private setHTML(el: HTMLElement, html: string): void {
        this.clearElement(el);
        const doc = new DOMParser().parseFromString(html, "text/html");
        Array.from(doc.body.childNodes).forEach(n => el.appendChild(n));
    }

    // ── Power BI Format Pane ──────────────────────────────────────────────────

    public enumerateObjectInstances(options: EnumerateVisualObjectInstancesOptions): VisualObjectInstanceEnumeration {
        return VisualSettings.enumerateObjectInstances(
            this.settings || VisualSettings.getDefault(),
            options
        );
    }
}
